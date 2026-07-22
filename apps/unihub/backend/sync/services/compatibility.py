"""Commit compatibility classification for the sync history graph.

A commit is compatible with the current application version exactly when the
importer would accept its snapshot: for every registered-table CSV present in
the commit, the header row passes ``validate_headers`` (missing optional
columns tolerated; malformed, missing-required, or unknown columns are not).
Table files absent from the snapshot are tolerated — the import path skips
them the same way.
"""

from __future__ import annotations

import csv
import io
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class CommitCompatibility:
    """Classification result for one commit."""

    compatible: bool
    reason: str | None


# Header validation depends only on the file CONTENT, so results are memoized
# by (blob sha, table label) — across a 50-commit history page most commits
# share identical blobs and cost nothing to re-classify.
_blob_reason_cache: dict[tuple[str, str], str | None] = {}


def _csv_filename(content_type_label: str) -> str:
    return content_type_label.replace(".", "_") + ".csv"


def _tree_files(clone_dir: Path, sha: str) -> dict[str, str]:
    """Map top-level filename → blob sha for the commit's tree."""
    proc = subprocess.run(
        ["git", "ls-tree", sha],
        cwd=str(clone_dir),
        capture_output=True,
        text=True,
        timeout=30,
    )
    files: dict[str, str] = {}
    if proc.returncode != 0:
        return files
    for line in proc.stdout.splitlines():
        # Format: "<mode> <type> <sha>\t<name>"
        try:
            meta, name = line.split("\t", 1)
            _mode, obj_type, blob_sha = meta.split()
        except ValueError:
            continue
        if obj_type == "blob":
            files[name] = blob_sha
    return files


def _blob_header_reason(clone_dir: Path, blob_sha: str, label: str, descriptor) -> str | None:
    """Return a human-readable problem description for the blob, or None if OK."""
    key = (blob_sha, label)
    if key in _blob_reason_cache:
        return _blob_reason_cache[key]

    from data_io.services.csv_importer import validate_headers

    proc = subprocess.run(
        ["git", "cat-file", "blob", blob_sha],
        cwd=str(clone_dir),
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        reason = f"{label}: snapshot file is unreadable."
    else:
        first_line = proc.stdout.splitlines()[0] if proc.stdout else ""
        headers = next(csv.reader(io.StringIO(first_line)), [])
        issues = validate_headers(headers, descriptor)
        if issues:
            details = "; ".join(issue.message for issue in issues[:3])
            reason = f"{label}: {details}"
        else:
            reason = None

    _blob_reason_cache[key] = reason
    return reason


def classify_commit(clone_dir: Path, sha: str) -> CommitCompatibility:
    """Classify whether the snapshot at ``sha`` can be applied by this app version.

    Args:
        clone_dir: A git working directory containing the commit.
        sha: The commit to classify.

    Returns:
        CommitCompatibility with a human-readable reason when incompatible.
    """
    from data_io.registry import get_registry

    files = _tree_files(clone_dir, sha)
    problems: list[str] = []
    for label, descriptor in get_registry().items():
        blob_sha = files.get(_csv_filename(label))
        if blob_sha is None:
            continue  # table absent from the snapshot — the import path skips it
        reason = _blob_header_reason(clone_dir, blob_sha, label, descriptor)
        if reason:
            problems.append(reason)

    if problems:
        return CommitCompatibility(compatible=False, reason=" | ".join(problems))
    return CommitCompatibility(compatible=True, reason=None)
