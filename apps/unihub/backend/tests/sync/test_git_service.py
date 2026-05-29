"""Tests for GitSyncService — uses a local bare repo to avoid network calls."""

from __future__ import annotations

import subprocess
from pathlib import Path

import os

import pytest

from sync.services.git_service import GitSyncService


@pytest.fixture
def svc(bare_repo: dict, tmp_path: Path) -> GitSyncService:
    """GitSyncService instance pre-pointed at the bare_repo fixture."""
    clone_dir = tmp_path / "svc_clone"
    return GitSyncService(
        repo_url=bare_repo["repo_url"],
        pat=bare_repo["pat"],
        clone_dir=clone_dir,
    )


# ── ensure_clone ──────────────────────────────────────────────────────────────


def test_ensure_clone_creates_directory(svc: GitSyncService, bare_repo: dict) -> None:
    svc.ensure_clone()
    assert svc.clone_dir.exists()
    assert (svc.clone_dir / ".git").exists()


def test_ensure_clone_is_idempotent(svc: GitSyncService) -> None:
    svc.ensure_clone()
    svc.ensure_clone()  # should not raise
    assert svc.clone_dir.exists()


def test_ensure_clone_reclones_on_missing_git_dir(
    svc: GitSyncService, bare_repo: dict
) -> None:
    svc.ensure_clone()
    import shutil
    shutil.rmtree(svc.clone_dir / ".git")
    svc.ensure_clone()
    assert (svc.clone_dir / ".git").exists()


# ── status ────────────────────────────────────────────────────────────────────


def test_status_in_sync(svc: GitSyncService, bare_repo: dict) -> None:
    svc.ensure_clone()
    result = svc.status()
    assert result.status == "in_sync"
    assert result.ahead_count == 0
    assert result.behind_count == 0


def test_status_behind(svc: GitSyncService, bare_repo: dict) -> None:
    svc.ensure_clone()
    # Push a new commit to remote without pulling in the clone
    remote_clone = bare_repo["clone"]
    (remote_clone / "extra.txt").write_text("extra")
    subprocess.run(["git", "add", "."], check=True, capture_output=True, cwd=str(remote_clone))
    subprocess.run(
        ["git", "commit", "-m", "remote commit"],
        check=True, capture_output=True, cwd=str(remote_clone)
    )
    subprocess.run(
        ["git", "push", "origin", "HEAD"],
        check=True, capture_output=True, cwd=str(remote_clone)
    )
    result = svc.status()
    assert result.status == "behind"
    assert result.behind_count == 1


def test_status_ahead(svc: GitSyncService, bare_repo: dict) -> None:
    svc.ensure_clone()
    # Commit locally without pushing
    (svc.clone_dir / "local.txt").write_text("local")
    subprocess.run(
        ["git", "add", "."], check=True, capture_output=True, cwd=str(svc.clone_dir)
    )
    subprocess.run(
        ["git", "commit", "-m", "local commit"],
        check=True, capture_output=True, cwd=str(svc.clone_dir)
    )
    result = svc.status()
    assert result.status == "ahead"
    assert result.ahead_count == 1


# ── publish ───────────────────────────────────────────────────────────────────


def _write_dummy_csv(clone_dir: Path) -> list[str]:
    """Side-effect helper: writes a dummy CSV so git has staged changes."""
    (clone_dir / "finance_account.csv").write_text("id,name\n1,test\n")
    return ["finance_account"]


def test_publish_creates_commit_and_returns_data(
    svc: GitSyncService, bare_repo: dict
) -> None:
    from unittest.mock import patch

    svc.ensure_clone()

    with patch("sync.services.publish_helper.write_csvs_to_clone", side_effect=_write_dummy_csv):
        result = svc.publish()

    assert result is not None
    assert len(result.commit_sha) == 40
    assert result.tables_exported == ["finance_account"]


def test_publish_returns_none_when_no_changes(
    svc: GitSyncService, bare_repo: dict
) -> None:
    from unittest.mock import patch

    svc.ensure_clone()
    # publish once to create a real commit
    with patch("sync.services.publish_helper.write_csvs_to_clone", side_effect=_write_dummy_csv):
        svc.publish()

    # publish again — same file content, nothing new to commit
    with patch("sync.services.publish_helper.write_csvs_to_clone", side_effect=_write_dummy_csv):
        result = svc.publish()

    assert result is None


def test_publish_raises_diverged_on_rejected_push(
    svc: GitSyncService, bare_repo: dict, tmp_path: Path
) -> None:
    from unittest.mock import patch
    from sync.services.git_service import DivergedException

    svc.ensure_clone()

    # Push a new commit from another clone to put remote ahead
    other = tmp_path / "other_clone"
    other_svc = GitSyncService(
        repo_url=bare_repo["repo_url"], pat=bare_repo["pat"], clone_dir=other
    )
    other_svc.ensure_clone()
    other_svc._configure_identity()
    (other / "other.txt").write_text("from other device")
    subprocess.run(["git", "add", "."], check=True, capture_output=True, cwd=str(other))
    subprocess.run(
        ["git", "commit", "-m", "other commit"],
        check=True, capture_output=True, cwd=str(other),
    )
    subprocess.run(
        ["git", "push", bare_repo["repo_url"], "HEAD"],
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        check=True, capture_output=True, cwd=str(other),
    )

    # svc publish should create a local commit and fail to push (non-fast-forward)
    with patch("sync.services.publish_helper.write_csvs_to_clone", side_effect=_write_dummy_csv):
        with pytest.raises(DivergedException):
            svc.publish()


def test_force_publish_pushes_with_force(
    svc: GitSyncService, bare_repo: dict, tmp_path: Path
) -> None:
    from unittest.mock import patch

    svc.ensure_clone()

    # Push a commit from another clone to create divergence
    other = tmp_path / "other_clone2"
    other_svc = GitSyncService(
        repo_url=bare_repo["repo_url"], pat=bare_repo["pat"], clone_dir=other
    )
    other_svc.ensure_clone()
    other_svc._configure_identity()
    (other / "other2.txt").write_text("from other device 2")
    subprocess.run(["git", "add", "."], check=True, capture_output=True, cwd=str(other))
    subprocess.run(
        ["git", "commit", "-m", "other commit 2"],
        check=True, capture_output=True, cwd=str(other),
    )
    subprocess.run(
        ["git", "push", bare_repo["repo_url"], "HEAD"],
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        check=True, capture_output=True, cwd=str(other),
    )

    with patch("sync.services.publish_helper.write_csvs_to_clone", side_effect=_write_dummy_csv):
        result = svc.force_publish()

    assert result is not None
    assert len(result.commit_sha) == 40
