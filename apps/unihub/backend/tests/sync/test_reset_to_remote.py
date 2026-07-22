"""Tests for GitSyncService.reset_to_remote() — the remote-pinned clone base.

The server-side clone is a disposable cache of the remote; the database is the
source of truth. Every sync operation must start from the true remote head, so
reset_to_remote() fetches and hard-resets the clone, discarding stray state.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from sync.services.git_service import GitError, GitSyncService


@pytest.fixture
def svc(bare_repo: dict, tmp_path: Path) -> GitSyncService:
    clone_dir = tmp_path / "svc_clone"
    return GitSyncService(
        repo_url=bare_repo["repo_url"],
        pat=bare_repo["pat"],
        clone_dir=clone_dir,
    )


def _git(cwd: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=str(cwd), check=True, capture_output=True, text=True)
    return proc.stdout.strip()


def _push_remote_commit(bare_repo: dict, filename: str, content: str) -> str:
    """Add a commit to the remote via the fixture's working clone; return its sha."""
    work = bare_repo["clone"]
    (work / filename).write_text(content)
    _git(work, "add", ".")
    _git(work, "commit", "-m", f"add {filename}")
    _git(work, "push", "origin", "HEAD")
    return _git(work, "rev-parse", "HEAD")


def test_reset_to_remote_returns_remote_head_sha(svc: GitSyncService, bare_repo: dict) -> None:
    expected = _git(bare_repo["clone"], "rev-parse", "HEAD")
    sha = svc.reset_to_remote()
    assert sha == expected
    assert _git(svc.clone_dir, "rev-parse", "HEAD") == expected


def test_reset_to_remote_advances_stale_clone(svc: GitSyncService, bare_repo: dict) -> None:
    svc.ensure_clone()  # clone at the initial commit
    new_sha = _push_remote_commit(bare_repo, "newer.txt", "newer")
    sha = svc.reset_to_remote()
    assert sha == new_sha
    assert _git(svc.clone_dir, "rev-parse", "HEAD") == new_sha


def test_reset_to_remote_discards_stray_local_commits(svc: GitSyncService, bare_repo: dict) -> None:
    svc.ensure_clone()
    # Simulate a corrupt state: a local-only commit in the server clone.
    (svc.clone_dir / "stray.txt").write_text("stray")
    _git(svc.clone_dir, "config", "user.email", "t@t")
    _git(svc.clone_dir, "config", "user.name", "t")
    _git(svc.clone_dir, "add", ".")
    _git(svc.clone_dir, "commit", "-m", "stray local commit")

    remote_head = _git(bare_repo["clone"], "rev-parse", "HEAD")
    sha = svc.reset_to_remote()
    assert sha == remote_head
    assert _git(svc.clone_dir, "rev-parse", "HEAD") == remote_head
    assert not (svc.clone_dir / "stray.txt").exists()


def test_reset_to_remote_empty_remote_returns_none(tmp_path: Path) -> None:
    remote = tmp_path / "empty.git"
    remote.mkdir()
    subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
    svc = GitSyncService(
        repo_url=f"file://{remote}", pat="dummy", clone_dir=tmp_path / "empty_clone"
    )
    assert svc.reset_to_remote() is None


def test_reset_to_remote_unreachable_remote_raises(svc: GitSyncService, bare_repo: dict) -> None:
    svc.ensure_clone()
    shutil.rmtree(bare_repo["remote"])
    with pytest.raises(GitError):
        svc.reset_to_remote()
