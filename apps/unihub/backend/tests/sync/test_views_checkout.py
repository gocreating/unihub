"""Tests for checkout preview/confirm (spec 015 US5, FR-015..FR-020).

Checkout restores the local dataset to any compatible commit's snapshot via a
pinned, stageable preview. The legacy apply endpoints are superseded.
"""

from __future__ import annotations

import datetime
import subprocess
from pathlib import Path

import pytest
from django.contrib.auth.models import User
from django.test import Client

from inventory.models import Acquisition, Item
from sync.models import SyncConfig
from sync.services.crypto import encrypt_pat
from sync.services.git_service import GitSyncService

pytestmark = pytest.mark.django_db

PREVIEW_URL = "/api/v1/sync/checkout/preview/"
CONFIRM_URL = "/api/v1/sync/checkout/confirm/"


@pytest.fixture
def auth_client(db: None) -> Client:
    user = User.objects.create_user(username="checkoutuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.fixture
def configured(bare_repo: dict, settings, tmp_path: Path) -> dict:
    settings.SYNC_REPO_DIR = tmp_path / "server_clone"
    config = SyncConfig.objects.create(
        repo_url=bare_repo["repo_url"],
        pat_encrypted=encrypt_pat("dummy"),
    )
    seeder = GitSyncService(
        repo_url=bare_repo["repo_url"],
        pat=bare_repo["pat"],
        clone_dir=tmp_path / "seed_clone",
    )
    return {"config": config, "seeder": seeder, **bare_repo}


def _git(cwd: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=str(cwd), check=True, capture_output=True, text=True)
    return proc.stdout.strip()


def _seed_item(name: str) -> Item:
    acq = Acquisition.objects.create(
        source=f"src-{name}",
        obtained_at=datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc),
    )
    return Item.objects.create(name=name, acquisition=acq)


def _two_commits(configured: dict) -> tuple[str, str]:
    """C1 = snapshot with alpha; C2 = snapshot with alpha+beta (current DB)."""
    seeder: GitSyncService = configured["seeder"]
    _seed_item("alpha")
    seeder.publish()
    c1 = _git(seeder.clone_dir, "rev-parse", "HEAD")
    _seed_item("beta")
    seeder.publish()
    c2 = _git(seeder.clone_dir, "rev-parse", "HEAD")
    return c1, c2


def test_checkout_preview_of_older_commit(auth_client: Client, configured: dict) -> None:
    c1, c2 = _two_commits(configured)

    resp = auth_client.get(PREVIEW_URL, {"commit": c1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "has_changes"
    assert body["base_commit"] == c1
    assert len(body["diff_digest"]) == 64

    item_changes = [ch for ch in body["changes"] if ch["table"] == "inventory.item"]
    assert len(item_changes) == 1
    # Restoring C1 deletes beta locally (replace semantics).
    assert item_changes[0]["deleted"] == 1
    beta_pk = str(Item.objects.get(name="beta").pk)
    assert [r["pk"] for r in item_changes[0]["rows"] if r["operation"] == "delete"] == [beta_pk]


def test_checkout_preview_up_to_date_at_matching_commit(
    auth_client: Client, configured: dict
) -> None:
    _c1, c2 = _two_commits(configured)
    resp = auth_client.get(PREVIEW_URL, {"commit": c2})
    assert resp.status_code == 200
    assert resp.json()["status"] == "up_to_date"


def test_checkout_preview_unknown_commit(auth_client: Client, configured: dict) -> None:
    _two_commits(configured)
    resp = auth_client.get(PREVIEW_URL, {"commit": "f" * 40})
    assert resp.status_code == 400
    assert resp.json()["error"] == "unknown_commit"


def test_checkout_preview_missing_commit_param(auth_client: Client, configured: dict) -> None:
    resp = auth_client.get(PREVIEW_URL)
    assert resp.status_code == 400


def test_checkout_rejects_incompatible_commit(auth_client: Client, configured: dict) -> None:
    _two_commits(configured)
    work = configured["clone"]
    _git(work, "pull", "origin", "HEAD")
    (work / "inventory_acquisition.csv").write_text("bogus:string\n", encoding="utf-8")
    _git(work, "add", ".")
    _git(work, "commit", "-m", "broken")
    _git(work, "push", "origin", "HEAD")
    c3 = _git(work, "rev-parse", "HEAD")

    resp = auth_client.get(PREVIEW_URL, {"commit": c3})
    assert resp.status_code == 409
    assert resp.json()["error"] == "incompatible_commit"
    assert resp.json()["reason"]

    confirm = auth_client.post(
        CONFIRM_URL,
        {"commit": c3, "diff_digest": "b" * 64, "excluded": []},
        content_type="application/json",
    )
    assert confirm.status_code == 409
    assert confirm.json()["error"] == "incompatible_commit"


def test_full_checkout_restores_snapshot_and_marks_local_state(
    auth_client: Client, configured: dict
) -> None:
    c1, _c2 = _two_commits(configured)

    preview = auth_client.get(PREVIEW_URL, {"commit": c1}).json()
    resp = auth_client.post(
        CONFIRM_URL,
        {"commit": c1, "diff_digest": preview["diff_digest"], "excluded": []},
        content_type="application/json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "applied"
    assert body["auto_included"] == []

    # The DB now matches C1: beta (and its acquisition) are gone, alpha remains.
    assert Item.objects.filter(name="alpha").exists()
    assert not Item.objects.filter(name="beta").exists()

    config = SyncConfig.objects.get()
    assert config.local_state_commit == c1
    assert config.last_applied_commit == c1
    assert config.last_applied_at is not None


def test_partial_checkout_applies_staged_subset_only(auth_client: Client, configured: dict) -> None:
    c1, _c2 = _two_commits(configured)
    gamma = _seed_item("gamma")  # local-only, not in any snapshot
    gamma_ref = {"table": "inventory.item", "pk": str(gamma.pk)}
    gamma_acq_ref = {"table": "inventory.acquisition", "pk": str(gamma.acquisition.pk)}

    preview = auth_client.get(PREVIEW_URL, {"commit": c1}).json()
    resp = auth_client.post(
        CONFIRM_URL,
        {
            "commit": c1,
            "diff_digest": preview["diff_digest"],
            "excluded": [gamma_ref, gamma_acq_ref],
        },
        content_type="application/json",
    )
    assert resp.status_code == 200

    # beta was staged away; gamma survived because it was excluded.
    assert not Item.objects.filter(name="beta").exists()
    assert Item.objects.filter(name="gamma").exists()

    # A partial checkout leaves the DB between snapshots — no local-state claim.
    assert SyncConfig.objects.get().local_state_commit != c1


def test_checkout_confirm_rejects_stale_digest(auth_client: Client, configured: dict) -> None:
    c1, _c2 = _two_commits(configured)
    preview = auth_client.get(PREVIEW_URL, {"commit": c1}).json()

    _seed_item("drift")  # DB changes after the preview

    resp = auth_client.post(
        CONFIRM_URL,
        {"commit": c1, "diff_digest": preview["diff_digest"], "excluded": []},
        content_type="application/json",
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "preview_stale"


def test_checkout_confirm_rejects_nothing_staged(auth_client: Client, configured: dict) -> None:
    c1, _c2 = _two_commits(configured)
    preview = auth_client.get(PREVIEW_URL, {"commit": c1}).json()
    all_refs = [
        {"table": ch["table"], "pk": r["pk"]} for ch in preview["changes"] for r in ch["rows"]
    ]
    resp = auth_client.post(
        CONFIRM_URL,
        {"commit": c1, "diff_digest": preview["diff_digest"], "excluded": all_refs},
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "nothing_staged"


def test_legacy_apply_endpoints_are_gone(auth_client: Client, configured: dict) -> None:
    assert auth_client.get("/api/v1/sync/apply/preview/").status_code == 404
    assert (
        auth_client.post(
            "/api/v1/sync/apply/confirm/", {}, content_type="application/json"
        ).status_code
        == 404
    )
