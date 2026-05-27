"""Git-based sync service for push/pull operations against a private GitHub repo."""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


@dataclass
class SyncStatusData:
    """Result of a remote status check."""

    status: str  # in_sync | ahead | behind | diverged | no_remote | error
    ahead_count: int
    behind_count: int
    remote_commit: str | None
    error_message: str | None


@dataclass
class SyncPublishData:
    """Result of a successful publish (push) operation."""

    commit_sha: str
    tables_exported: list[str]


class GitSyncService:
    """Manages a local git clone for sync operations.

    All git commands run via subprocess with GIT_TERMINAL_PROMPT=0 to
    prevent interactive credential prompts. The PAT is embedded in the
    remote URL at runtime only and never logged.
    """

    _GIT_ENV = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_ASKPASS": "/bin/true",
    }

    def __init__(self, repo_url: str, pat: str, clone_dir: Path) -> None:
        self.repo_url = repo_url
        self._pat = pat
        self.clone_dir = clone_dir

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _authenticated_url(self) -> str:
        """Embed PAT into the HTTPS URL. Never logged."""
        parsed = urlparse(self.repo_url)
        return parsed._replace(netloc=f"{self._pat}@{parsed.netloc}").geturl()

    def _sanitise(self, text: str) -> str:
        """Strip PAT from any string before surfacing to the user."""
        return text.replace(self._pat, "***")

    def _run(
        self,
        args: list[str],
        *,
        cwd: Path | None = None,
        check: bool = True,
        capture: bool = True,
    ) -> subprocess.CompletedProcess:
        return subprocess.run(
            args,
            cwd=str(cwd or self.clone_dir),
            env=self._GIT_ENV,
            capture_output=capture,
            text=True,
            timeout=60,
            check=check,
        )

    def _configure_identity(self) -> None:
        """Ensure git user.email and user.name are set in the clone."""
        self._run(["git", "config", "user.email", "sync@unihub.local"])
        self._run(["git", "config", "user.name", "unihub"])

    # ── Clone management ──────────────────────────────────────────────────────

    def ensure_clone(self) -> None:
        """Clone the repository if the clone directory is absent or corrupt."""
        git_dir = self.clone_dir / ".git"
        if self.clone_dir.exists() and git_dir.exists():
            return
        if self.clone_dir.exists():
            import shutil
            shutil.rmtree(self.clone_dir)
        self.clone_dir.mkdir(parents=True, exist_ok=True)
        self._run(
            ["git", "clone", self._authenticated_url(), str(self.clone_dir)],
            cwd=self.clone_dir.parent,
        )

    # ── Status ────────────────────────────────────────────────────────────────

    def status(self) -> SyncStatusData:
        """Fetch remote state and return ahead/behind counts."""
        try:
            self.ensure_clone()
            # Fetch to update remote-tracking refs
            fetch = self._run(
                ["git", "fetch", self._authenticated_url(), "--quiet"], check=False
            )
            if fetch.returncode != 0:
                # Empty repo has no HEAD yet — not an error, just no remote commits
                stderr = fetch.stderr.strip()
                if "couldn't find remote ref" in stderr or "does not have any commits" in stderr:
                    return SyncStatusData(
                        status="no_remote",
                        ahead_count=0,
                        behind_count=0,
                        remote_commit=None,
                        error_message=None,
                    )
                return SyncStatusData(
                    status="error",
                    ahead_count=0,
                    behind_count=0,
                    remote_commit=None,
                    error_message=self._sanitise(stderr),
                )

            # Get ahead/behind counts
            counts = self._run(
                ["git", "rev-list", "--left-right", "--count", "HEAD...FETCH_HEAD"],
                check=False,
            )
            if counts.returncode != 0:
                return SyncStatusData(
                    status="no_remote",
                    ahead_count=0,
                    behind_count=0,
                    remote_commit=None,
                    error_message=None,
                )

            parts = counts.stdout.strip().split()
            ahead = int(parts[0]) if parts else 0
            behind = int(parts[1]) if len(parts) > 1 else 0

            remote_sha = self._run(["git", "rev-parse", "FETCH_HEAD"], check=False)
            remote_commit = remote_sha.stdout.strip() if remote_sha.returncode == 0 else None

            if ahead == 0 and behind == 0:
                sync_status = "in_sync"
            elif ahead > 0 and behind == 0:
                sync_status = "ahead"
            elif ahead == 0 and behind > 0:
                sync_status = "behind"
            else:
                sync_status = "diverged"

            return SyncStatusData(
                status=sync_status,
                ahead_count=ahead,
                behind_count=behind,
                remote_commit=remote_commit,
                error_message=None,
            )
        except subprocess.TimeoutExpired:
            return SyncStatusData(
                status="error",
                ahead_count=0,
                behind_count=0,
                remote_commit=None,
                error_message="Git operation timed out.",
            )
        except Exception as exc:
            return SyncStatusData(
                status="error",
                ahead_count=0,
                behind_count=0,
                remote_commit=None,
                error_message=self._sanitise(str(exc)),
            )

    # ── Publish ───────────────────────────────────────────────────────────────

    def publish(self) -> SyncPublishData | None:
        """Export all tables to CSV, commit, push. Returns None if up-to-date.

        Raises:
            DivergedException: if remote has commits the local clone lacks.
        """
        from sync.services.publish_helper import write_csvs_to_clone

        self.ensure_clone()
        self._configure_identity()

        tables_exported = write_csvs_to_clone(self.clone_dir)

        self._run(["git", "add", "-A"])

        diff = self._run(["git", "diff", "--cached", "--quiet"], check=False)
        if diff.returncode == 0:
            return None  # nothing changed

        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self._run(["git", "commit", "-m", f"Sync at {ts}"])

        push = self._run(
            ["git", "push", self._authenticated_url(), "HEAD"], check=False
        )
        if push.returncode != 0:
            if "rejected" in push.stderr or "non-fast-forward" in push.stderr:
                raise DivergedException(self._sanitise(push.stderr))
            raise GitError(self._sanitise(push.stderr))

        sha = self._run(["git", "rev-parse", "HEAD"]).stdout.strip()
        return SyncPublishData(commit_sha=sha, tables_exported=tables_exported)

    def force_publish(self) -> SyncPublishData | None:
        """Like publish() but force-pushes, overwriting the remote."""
        from sync.services.publish_helper import write_csvs_to_clone

        self.ensure_clone()
        self._configure_identity()

        tables_exported = write_csvs_to_clone(self.clone_dir)
        self._run(["git", "add", "-A"])

        diff = self._run(["git", "diff", "--cached", "--quiet"], check=False)
        if diff.returncode == 0:
            return None

        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self._run(["git", "commit", "-m", f"Sync at {ts}"])

        push = self._run(
            ["git", "push", "--force", self._authenticated_url(), "HEAD"], check=False
        )
        if push.returncode != 0:
            raise GitError(self._sanitise(push.stderr))

        sha = self._run(["git", "rev-parse", "HEAD"]).stdout.strip()
        return SyncPublishData(commit_sha=sha, tables_exported=tables_exported)

    # ── Apply ─────────────────────────────────────────────────────────────────

    def apply_preview(self) -> list | None:
        """Fetch latest remote state, return per-table change preview or None if up-to-date."""
        self.ensure_clone()
        fetch = self._run(["git", "fetch", self._authenticated_url(), "--quiet"], check=False)
        if fetch.returncode != 0:
            stderr = fetch.stderr.strip()
            if "couldn't find remote ref" in stderr or "does not have any commits" in stderr:
                return None  # empty remote repo — nothing to apply
            raise GitError(self._sanitise(stderr))

        counts = self._run(
            ["git", "rev-list", "--left-right", "--count", "HEAD...FETCH_HEAD"],
            check=False,
        )
        if counts.returncode != 0:
            return []

        parts = counts.stdout.strip().split()
        behind = int(parts[1]) if len(parts) > 1 else 0
        if behind == 0:
            return None  # already up to date

        # Checkout FETCH_HEAD into a temp tree to read CSVs without modifying HEAD
        from sync.services.apply_helper import preview_from_fetch_head
        return preview_from_fetch_head(self.clone_dir)

    def apply_confirm(self) -> list:
        """Pull latest remote state and import all tables. Returns confirm results."""
        self.ensure_clone()

        pull = self._run(
            ["git", "pull", self._authenticated_url(), "HEAD", "--ff-only"], check=False
        )
        if pull.returncode != 0:
            raise GitError(self._sanitise(pull.stderr))

        from sync.services.apply_helper import import_from_clone
        return import_from_clone(self.clone_dir)


class DivergedException(Exception):
    """Raised when git push is rejected due to diverged history."""


class GitError(Exception):
    """Raised for unexpected git failures."""
