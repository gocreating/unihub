"""Tests for GET /api/v1/sync/history/ — the commit graph payload (spec 015 US3)."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from django.contrib.auth.models import User
from django.test import Client

from sync.models import SyncConfig
from sync.services.crypto import encrypt_pat

pytestmark = pytest.mark.django_db

HISTORY_URL = "/api/v1/sync/history/"


@pytest.fixture
def auth_client(db: None) -> Client:
    user = User.objects.create_user(username="histuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.fixture
def configured(bare_repo: dict, settings, tmp_path: Path) -> dict:
    """A SyncConfig pointing at the bare_repo remote + isolated server clone."""
    settings.SYNC_REPO_DIR = tmp_path / "server_clone"
    config = SyncConfig.objects.create(
        repo_url=bare_repo["repo_url"],
        pat_encrypted=encrypt_pat("dummy"),
    )
    return {"config": config, **bare_repo}


def _git(cwd: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=str(cwd), check=True, capture_output=True, text=True)
    return proc.stdout.strip()


def _push_commits(work: Path, count: int, prefix: str = "c") -> list[str]:
    """Create `count` commits in the working clone, push, return shas oldest-first."""
    shas = []
    for i in range(count):
        (work / f"{prefix}{i}.txt").write_text(str(i))
        _git(work, "add", ".")
        _git(work, "commit", "-m", f"{prefix} commit {i}")
        shas.append(_git(work, "rev-parse", "HEAD"))
    _git(work, "push", "origin", "HEAD")
    return shas


def test_history_not_configured(auth_client: Client) -> None:
    resp = auth_client.get(HISTORY_URL)
    assert resp.status_code == 400
    assert resp.json()["error"] == "not_configured"


def test_history_happy_path(auth_client: Client, configured: dict) -> None:
    shas = _push_commits(configured["clone"], 2)
    resp = auth_client.get(HISTORY_URL)
    assert resp.status_code == 200
    body = resp.json()

    # Newest-first, includes the fixture's init commit at the bottom.
    returned = [c["sha"] for c in body["commits"]]
    assert returned[0] == shas[-1]
    assert body["remote_head"] == shas[-1]
    assert body["has_more"] is False
    assert body["history_rewritten"] is False
    assert isinstance(body["has_local_changes"], bool)

    head = body["commits"][0]
    assert head["is_remote_head"] is True
    assert head["message"] == "c commit 1"
    assert head["parents"] == [shas[0]]
    assert head["author_date"]
    assert head["compatible"] is True
    assert head["incompatible_reason"] is None

    # The fetch recorded the remote head for force-push detection.
    config = SyncConfig.objects.get()
    assert config.last_known_remote_commit == shas[-1]


def test_history_marks_local_state(auth_client: Client, configured: dict) -> None:
    shas = _push_commits(configured["clone"], 2, prefix="l")
    SyncConfig.objects.filter(pk=configured["config"].pk).update(local_state_commit=shas[0])
    resp = auth_client.get(HISTORY_URL)
    flags = {c["sha"]: c["is_local_state"] for c in resp.json()["commits"]}
    assert flags[shas[0]] is True
    assert flags[shas[1]] is False


def test_history_paging(auth_client: Client, configured: dict) -> None:
    shas = _push_commits(configured["clone"], 5, prefix="p")  # + init commit = 6 total

    resp = auth_client.get(HISTORY_URL, {"limit": 2})
    body = resp.json()
    assert len(body["commits"]) == 2
    assert body["has_more"] is True
    assert [c["sha"] for c in body["commits"]] == [shas[4], shas[3]]

    resp2 = auth_client.get(HISTORY_URL, {"limit": 2, "before": shas[3]})
    body2 = resp2.json()
    assert [c["sha"] for c in body2["commits"]] == [shas[2], shas[1]]
    assert body2["has_more"] is True


def test_history_empty_remote(auth_client: Client, settings, tmp_path: Path) -> None:
    remote = tmp_path / "empty.git"
    remote.mkdir()
    subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
    settings.SYNC_REPO_DIR = tmp_path / "server_clone"
    SyncConfig.objects.create(repo_url=f"file://{remote}", pat_encrypted=encrypt_pat("dummy"))

    resp = auth_client.get(HISTORY_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["commits"] == []
    assert body["remote_head"] is None
    assert body["has_more"] is False
    assert body["history_rewritten"] is False


def test_history_git_error(auth_client: Client, settings, tmp_path: Path) -> None:
    settings.SYNC_REPO_DIR = tmp_path / "server_clone"
    SyncConfig.objects.create(
        repo_url=f"file://{tmp_path}/does-not-exist.git", pat_encrypted=encrypt_pat("dummy")
    )
    resp = auth_client.get(HISTORY_URL)
    assert resp.status_code == 500
    assert resp.json()["error"] == "git_error"


def test_history_detects_rewritten_history(auth_client: Client, configured: dict) -> None:
    work = configured["clone"]
    _push_commits(work, 2, prefix="r")

    # First load records the remote head.
    auth_client.get(HISTORY_URL)
    stored = SyncConfig.objects.get().last_known_remote_commit

    # The remote history is rewritten from outside (amend + force-push).
    (work / "rewritten.txt").write_text("rewritten")
    _git(work, "add", ".")
    _git(work, "commit", "--amend", "-m", "rewritten head")
    _git(work, "push", "--force", "origin", "HEAD")
    new_head = _git(work, "rev-parse", "HEAD")
    assert new_head != stored

    resp = auth_client.get(HISTORY_URL)
    body = resp.json()
    assert body["history_rewritten"] is True
    assert body["remote_head"] == new_head
    # The stored marker moves forward so the warning reflects each new fetch.
    assert SyncConfig.objects.get().last_known_remote_commit == new_head


def test_history_flags_incompatible_commit(auth_client: Client, configured: dict) -> None:
    work = configured["clone"]
    (work / "inventory_acquisition.csv").write_text("bogus_column:string\n", encoding="utf-8")
    _git(work, "add", ".")
    _git(work, "commit", "-m", "broken snapshot")
    _git(work, "push", "origin", "HEAD")

    resp = auth_client.get(HISTORY_URL)
    head = resp.json()["commits"][0]
    assert head["compatible"] is False
    assert head["incompatible_reason"]
