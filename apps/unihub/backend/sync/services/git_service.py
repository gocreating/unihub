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


@dataclass
class PublishPreviewData:
    """A publish preview pinned to the remote base it was computed against.

    ``base_commit`` is the remote head sha the diff used (None for an empty
    remote); ``diff_digest`` is the sha256 over the canonical changes JSON.
    A confirm echoes both so it can only apply exactly what was previewed.
    """

    base_commit: str | None
    diff_digest: str
    changes: list


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
        self._run(["git", "config", "user.name", "unihub-bot"])

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

    def reset_to_remote(self) -> str | None:
        """Fetch the remote head and hard-reset the clone to it.

        The clone is a disposable cache of the remote; the database is the
        source of truth. Discards any stray local-only commits or working-tree
        changes so every sync operation starts from the true remote state.

        Returns:
            The remote head sha, or None when the remote has no commits yet.

        Raises:
            GitError: when the remote cannot be reached or the reset fails.
        """
        self.ensure_clone()
        fetch = self._run(["git", "fetch", self._authenticated_url(), "--quiet"], check=False)
        if fetch.returncode != 0:
            stderr = fetch.stderr.strip()
            if "couldn't find remote ref" in stderr or "does not have any commits" in stderr:
                return None
            raise GitError(self._sanitise(stderr))

        head = self._run(["git", "rev-parse", "--verify", "FETCH_HEAD"], check=False)
        if head.returncode != 0:
            return None  # empty remote — nothing fetched
        sha = head.stdout.strip()

        reset = self._run(["git", "reset", "--hard", sha], check=False)
        if reset.returncode != 0:
            raise GitError(self._sanitise(reset.stderr))
        return sha

    # ── Status ────────────────────────────────────────────────────────────────

    def status(self) -> SyncStatusData:
        """Fetch remote state and return ahead/behind counts."""
        try:
            self.ensure_clone()
            # Fetch to update remote-tracking refs
            fetch = self._run(["git", "fetch", self._authenticated_url(), "--quiet"], check=False)
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

    def _changed_tables(self, all_tables: list[str]) -> list[str]:
        """Return only the tables whose CSV files are staged as changed."""
        from sync.services.publish_helper import _csv_filename

        result = self._run(["git", "diff", "--cached", "--name-only"], check=False)
        changed_files = set(result.stdout.splitlines())
        return [t for t in all_tables if _csv_filename(t) in changed_files]

    @staticmethod
    def _commit_message(tables: list[str]) -> str:
        if not tables:
            return "sync: no tables"
        if len(tables) <= 4:
            return "sync: " + ", ".join(tables)
        return f"sync: {len(tables)} tables ({', '.join(tables[:3])}, …)"

    # ── Publish ───────────────────────────────────────────────────────────────

    def _verify_pinning(self, base_commit: str | None, diff_digest: str | None) -> None:
        """Verify a pinned confirm still matches its preview.

        Assumes the clone has just been reset to the remote head.

        Raises:
            PreviewStaleException: when the remote moved or the local dataset
                changed since the preview was computed.
        """
        if diff_digest is None:
            return
        from sync.services.digest import diff_digest as compute_digest
        from sync.services.publish_helper import preview_publish_against_head

        current_base = self._run(["git", "rev-parse", "--verify", "HEAD"], check=False)
        actual_base = current_base.stdout.strip() if current_base.returncode == 0 else None
        if actual_base != base_commit:
            raise PreviewStaleException("The remote moved since the preview was computed.")
        changes = preview_publish_against_head(self.clone_dir)
        if compute_digest(changes) != diff_digest:
            raise PreviewStaleException("The dataset changed since the preview was computed.")

    def publish(
        self,
        base_commit: str | None = None,
        diff_digest: str | None = None,
    ) -> SyncPublishData | None:
        """Export all tables to CSV on the remote-head base, commit, push.

        The clone is reset to the remote head first, so the commit is always a
        fast-forward of the true remote state. When ``diff_digest`` is given,
        the publish is pinned: the diff is recomputed and must match the
        previewed one exactly.

        Returns:
            None if up-to-date, else the publish result.

        Raises:
            PreviewStaleException: pinned publish no longer matches its preview.
            DivergedException: the push was rejected (a race with another push).
        """
        from sync.services.publish_helper import write_csvs_to_clone

        self.reset_to_remote()
        self._configure_identity()
        self._verify_pinning(base_commit, diff_digest)

        tables_exported = write_csvs_to_clone(self.clone_dir)

        self._run(["git", "add", "-A"])

        diff = self._run(["git", "diff", "--cached", "--quiet"], check=False)
        if diff.returncode == 0:
            return None  # nothing changed

        changed = self._changed_tables(tables_exported)
        self._run(["git", "commit", "-m", self._commit_message(changed)])

        push = self._run(["git", "push", self._authenticated_url(), "HEAD"], check=False)
        if push.returncode != 0:
            if "rejected" in push.stderr or "non-fast-forward" in push.stderr:
                raise DivergedException(self._sanitise(push.stderr))
            raise GitError(self._sanitise(push.stderr))

        sha = self._run(["git", "rev-parse", "HEAD"]).stdout.strip()
        return SyncPublishData(commit_sha=sha, tables_exported=changed)

    def force_publish(
        self,
        base_commit: str | None = None,
        diff_digest: str | None = None,
    ) -> SyncPublishData | None:
        """Like publish() but force-pushes, overwriting the remote."""
        from sync.services.publish_helper import write_csvs_to_clone

        self.reset_to_remote()
        self._configure_identity()
        self._verify_pinning(base_commit, diff_digest)

        tables_exported = write_csvs_to_clone(self.clone_dir)
        self._run(["git", "add", "-A"])

        diff = self._run(["git", "diff", "--cached", "--quiet"], check=False)
        if diff.returncode == 0:
            return None

        changed = self._changed_tables(tables_exported)
        self._run(["git", "commit", "-m", self._commit_message(changed)])

        push = self._run(["git", "push", "--force", self._authenticated_url(), "HEAD"], check=False)
        if push.returncode != 0:
            raise GitError(self._sanitise(push.stderr))

        sha = self._run(["git", "rev-parse", "HEAD"]).stdout.strip()
        return SyncPublishData(commit_sha=sha, tables_exported=changed)

    # ── Apply ─────────────────────────────────────────────────────────────────

    def publish_preview(self) -> PublishPreviewData | None:
        """Compute the per-table publish diff against the true remote head.

        The clone is reset to the remote head first — a stale clone must never
        contribute rows to the diff (issue #35 P1 bug).

        Returns:
            None when the dataset matches the remote head, else the preview
            with its pinning fields.
        """
        from sync.services.digest import diff_digest
        from sync.services.publish_helper import preview_publish_against_head

        base = self.reset_to_remote()
        changes = preview_publish_against_head(self.clone_dir)
        if not changes:
            return None
        return PublishPreviewData(
            base_commit=base, diff_digest=diff_digest(changes), changes=changes
        )

    def apply_preview(self) -> list | None:
        """Reset to the remote head, return per-table change preview or None if up-to-date.

        Always diffs the remote snapshot against the local DB — commit history
        alone cannot tell whether the DB matches the latest snapshot.
        """
        if self.reset_to_remote() is None:
            return None  # empty remote repo — nothing to apply

        from sync.services.apply_helper import preview_from_fetch_head

        changes = preview_from_fetch_head(self.clone_dir)
        return changes if changes else None

    def apply_confirm(self) -> list:
        """Reset to the remote head and import all tables. Returns confirm results."""
        if self.reset_to_remote() is None:
            return []  # empty remote repo — nothing to import

        from sync.services.apply_helper import import_from_clone

        return import_from_clone(self.clone_dir)


class DivergedException(Exception):
    """Raised when git push is rejected due to diverged history."""


class PreviewStaleException(Exception):
    """Raised when a pinned confirm no longer matches its preview."""


class GitError(Exception):
    """Raised for unexpected git failures."""
