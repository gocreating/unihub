"""Tests for row-level staged publishing (spec 015 US4, FR-010..FR-013).

A publish with exclusions writes hybrid CSVs: the base commit's rows plus only
the STAGED operations. Unstaged changes stay local and reappear in the next
preview — nothing is ever lost.
"""

from __future__ import annotations

import csv
import datetime
import io
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.test import Client

from inventory.models import Acquisition, Item
from sync.services.git_service import (
    GitSyncService,
    NothingStagedException,
    PreviewStaleException,
)

pytestmark = pytest.mark.django_db

PUBLISH_URL = "/api/v1/sync/publish/"
VALID_CONFIG = {
    "repo_url": "https://github.com/testuser/my-sync-repo",
    "pat": "ghp_testtoken123456789abcdef",
}


@pytest.fixture
def svc(bare_repo: dict, tmp_path: Path) -> GitSyncService:
    return GitSyncService(
        repo_url=bare_repo["repo_url"],
        pat=bare_repo["pat"],
        clone_dir=tmp_path / "server_clone",
    )


@pytest.fixture
def auth_client(db: None) -> Client:
    user = User.objects.create_user(username="stageuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


def _seed_items(names: list[str]) -> dict[str, Item]:
    acq = Acquisition.objects.create(
        source="shop",
        obtained_at=datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc),
    )
    return {name: Item.objects.create(name=name, acquisition=acq) for name in names}


def _remote_item_rows(bare_repo: dict) -> dict[str, dict[str, str]]:
    """Parse inventory_item.csv at the remote head, keyed by item name."""
    proc = subprocess.run(
        ["git", "show", "HEAD:inventory_item.csv"],
        cwd=str(bare_repo["remote"]),
        check=True,
        capture_output=True,
        text=True,
    )
    reader = csv.DictReader(io.StringIO(proc.stdout))
    name_header = next(h for h in (reader.fieldnames or []) if h.split(":")[0] == "name")
    return {row[name_header]: row for row in reader}


def test_partial_publish_writes_staged_ops_only(svc: GitSyncService, bare_repo: dict) -> None:
    items = _seed_items(["alpha", "beta", "gamma"])
    svc.publish()

    # Three local changes: update alpha, delete beta, create delta.
    beta_pk = str(items["beta"].pk)
    items["alpha"].name = "alpha-renamed"
    items["alpha"].save()
    items["beta"].delete()
    Item.objects.create(name="delta", acquisition=items["alpha"].acquisition)

    preview = svc.publish_preview()
    assert preview is not None

    # Exclude the deletion of beta — publish only the other two changes.
    result = svc.publish(
        base_commit=preview.base_commit,
        diff_digest=preview.diff_digest,
        excluded=[{"table": "inventory.item", "pk": beta_pk}],
    )
    assert result is not None

    remote = _remote_item_rows(bare_repo)
    assert "alpha-renamed" in remote  # staged update applied
    assert "delta" in remote  # staged create applied
    assert "beta" in remote  # excluded delete NOT applied — row survives

    # The unstaged change reappears in the next preview, and only it.
    next_preview = svc.publish_preview()
    assert next_preview is not None
    item_changes = [ch for ch in next_preview.changes if ch["table"] == "inventory.item"]
    assert len(item_changes) == 1
    rows = item_changes[0]["rows"]
    assert len(rows) == 1
    assert rows[0]["operation"] == "delete"
    assert rows[0]["pk"] == beta_pk


def test_publish_with_everything_excluded_raises_nothing_staged(
    svc: GitSyncService,
) -> None:
    items = _seed_items(["solo"])
    svc.publish()
    items["solo"].name = "solo-renamed"
    items["solo"].save()

    preview = svc.publish_preview()
    all_excluded = [
        {"table": ch["table"], "pk": r["pk"]} for ch in preview.changes for r in ch["rows"]
    ]
    with pytest.raises(NothingStagedException):
        svc.publish(
            base_commit=preview.base_commit,
            diff_digest=preview.diff_digest,
            excluded=all_excluded,
        )


def test_partial_publish_still_enforces_digest(svc: GitSyncService) -> None:
    items = _seed_items(["pinned"])
    svc.publish()
    items["pinned"].name = "pinned-renamed"
    items["pinned"].save()

    preview = svc.publish_preview()
    # Drift after the preview.
    Item.objects.create(name="drift", acquisition=items["pinned"].acquisition)

    with pytest.raises(PreviewStaleException):
        svc.publish(
            base_commit=preview.base_commit,
            diff_digest=preview.diff_digest,
            excluded=[{"table": "inventory.item", "pk": str(items["pinned"].pk)}],
        )


def test_publish_view_passes_exclusions_and_maps_nothing_staged(
    auth_client: Client,
) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    svc = MagicMock()
    svc.publish.side_effect = NothingStagedException("nothing staged")
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(
            PUBLISH_URL,
            {
                "base_commit": "a" * 40,
                "diff_digest": "b" * 64,
                "excluded": [{"table": "inventory.item", "pk": "x"}],
            },
            content_type="application/json",
        )
    assert resp.status_code == 400
    assert resp.json()["error"] == "nothing_staged"
    assert svc.publish.call_args.kwargs["excluded"] == [{"table": "inventory.item", "pk": "x"}]
