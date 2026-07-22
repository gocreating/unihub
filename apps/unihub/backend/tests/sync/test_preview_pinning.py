"""Tests for preview→confirm pinning (spec 015 FR-002) — base_commit + diff_digest."""

from __future__ import annotations

import datetime
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.test import Client

from inventory.models import Acquisition, Item
from sync.models import SyncConfig
from sync.services.git_service import (
    GitSyncService,
    PreviewStaleException,
    SyncPublishData,
)

pytestmark = pytest.mark.django_db

PREVIEW_URL = "/api/v1/sync/publish/preview/"
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
    user = User.objects.create_user(username="pinuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


def _git(cwd: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=str(cwd), check=True, capture_output=True, text=True)
    return proc.stdout.strip()


def _seed_item(name: str = "cup") -> Item:
    acq = Acquisition.objects.create(
        source="shop",
        obtained_at=datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc),
    )
    return Item.objects.create(name=name, acquisition=acq)


# ── Service level ─────────────────────────────────────────────────────────────


def test_preview_carries_base_commit_and_digest(svc: GitSyncService, bare_repo: dict) -> None:
    _seed_item()
    preview = svc.publish_preview()
    assert preview is not None
    remote_head = _git(bare_repo["clone"], "rev-parse", "HEAD")
    assert preview.base_commit == remote_head
    assert len(preview.diff_digest) == 64
    int(preview.diff_digest, 16)
    assert preview.changes


def test_pinned_publish_succeeds_and_applies_previewed_changes(
    svc: GitSyncService, bare_repo: dict
) -> None:
    _seed_item()
    preview = svc.publish_preview()
    result = svc.publish(base_commit=preview.base_commit, diff_digest=preview.diff_digest)
    assert isinstance(result, SyncPublishData)
    # The remote head advanced to the published commit…
    assert _git(bare_repo["remote"], "rev-parse", "HEAD") == result.commit_sha
    # …and there is nothing left to publish.
    assert svc.publish_preview() is None


def test_pinned_publish_rejects_local_db_drift(svc: GitSyncService) -> None:
    item = _seed_item()
    preview = svc.publish_preview()
    # The DB changes between preview and confirm.
    item.name = "changed-after-preview"
    item.save()
    with pytest.raises(PreviewStaleException):
        svc.publish(base_commit=preview.base_commit, diff_digest=preview.diff_digest)


def test_pinned_publish_rejects_remote_drift(svc: GitSyncService, bare_repo: dict) -> None:
    _seed_item()
    preview = svc.publish_preview()
    # The remote moves between preview and confirm.
    work = bare_repo["clone"]
    (work / "foreign.txt").write_text("foreign")
    _git(work, "add", ".")
    _git(work, "commit", "-m", "foreign commit")
    _git(work, "push", "origin", "HEAD")
    with pytest.raises(PreviewStaleException):
        svc.publish(base_commit=preview.base_commit, diff_digest=preview.diff_digest)


def test_unpinned_publish_remains_supported(svc: GitSyncService) -> None:
    _seed_item()
    assert svc.publish() is not None


# ── View level (endpoint contract; service mocked) ────────────────────────────


def test_preview_response_includes_pinning_fields(auth_client: Client) -> None:
    from sync.services.git_service import PublishPreviewData

    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    svc = MagicMock()
    svc.publish_preview.return_value = PublishPreviewData(
        base_commit="a" * 40,
        diff_digest="b" * 64,
        changes=[
            {
                "table": "inventory.item",
                "display_name": "Items",
                "added": 1,
                "modified": 0,
                "deleted": 0,
                "is_new_table": False,
                "rows": [],
            }
        ],
    )
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.get(PREVIEW_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "has_changes"
    assert body["base_commit"] == "a" * 40
    assert body["diff_digest"] == "b" * 64


def test_publish_view_passes_pinning_and_records_local_state(auth_client: Client) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    result = SyncPublishData(commit_sha="c" * 40, tables_exported=["inventory_item"])
    svc = MagicMock()
    svc.publish.return_value = result
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(
            PUBLISH_URL,
            {"base_commit": "a" * 40, "diff_digest": "b" * 64},
            content_type="application/json",
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "published"
    assert svc.publish.call_args.kwargs["base_commit"] == "a" * 40
    assert svc.publish.call_args.kwargs["diff_digest"] == "b" * 64
    config = SyncConfig.objects.get()
    assert config.local_state_commit == "c" * 40
    assert config.last_published_commit == "c" * 40


def test_publish_view_maps_stale_preview_to_409(auth_client: Client) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    svc = MagicMock()
    svc.publish.side_effect = PreviewStaleException("stale")
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(
            PUBLISH_URL,
            {"base_commit": "a" * 40, "diff_digest": "b" * 64},
            content_type="application/json",
        )
    assert resp.status_code == 409
    assert resp.json()["error"] == "preview_stale"
