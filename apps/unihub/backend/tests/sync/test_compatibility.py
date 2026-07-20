"""Tests for commit compatibility classification (spec 015 FR-017/FR-018).

A commit is compatible when every registered-table CSV present in it passes
the importer's header validation — the same tolerance the import path applies
(missing optional columns filled with defaults; absent table files skipped).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from data_io.registry import get_registry
from data_io.services.csv_exporter import export_table
from sync.services.compatibility import classify_commit

pytestmark = pytest.mark.django_db


@pytest.fixture
def work(bare_repo: dict) -> Path:
    """The fixture's working clone — commits crafted here, classified there."""
    return bare_repo["clone"]


def _commit(work: Path, message: str, files: dict[str, str]) -> str:
    for name, content in files.items():
        (work / name).write_text(content, encoding="utf-8")
    subprocess.run(["git", "add", "."], check=True, capture_output=True, cwd=str(work))
    subprocess.run(["git", "commit", "-m", message], check=True, capture_output=True, cwd=str(work))
    proc = subprocess.run(
        ["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True, cwd=str(work)
    )
    return proc.stdout.strip()


def _acquisition_header() -> str:
    descriptor = get_registry()["inventory.acquisition"]
    return export_table(descriptor).decode("utf-8").splitlines()[0]


def test_commit_with_canonical_headers_is_compatible(work: Path) -> None:
    sha = _commit(
        work, "valid snapshot", {"inventory_acquisition.csv": _acquisition_header() + "\n"}
    )
    result = classify_commit(work, sha)
    assert result.compatible is True
    assert result.reason is None


def test_commit_without_table_files_is_compatible(work: Path) -> None:
    sha = _commit(work, "no csvs", {"README2.md": "just docs"})
    assert classify_commit(work, sha).compatible is True


def test_missing_required_column_is_incompatible_with_reason(work: Path) -> None:
    header = _acquisition_header()
    columns = header.split(",")
    without_id = [c for c in columns if not c.startswith("id:")]
    assert len(without_id) == len(columns) - 1
    sha = _commit(
        work, "broken snapshot", {"inventory_acquisition.csv": ",".join(without_id) + "\n"}
    )
    result = classify_commit(work, sha)
    assert result.compatible is False
    assert result.reason is not None
    assert "id" in result.reason


def test_missing_optional_column_is_tolerated(work: Path) -> None:
    header = _acquisition_header()
    columns = header.split(",")
    # legacy_ref is nullable → optional; older snapshots legitimately lack it.
    without_optional = [c for c in columns if not c.startswith("legacy_ref:")]
    assert len(without_optional) == len(columns) - 1
    sha = _commit(
        work, "older snapshot", {"inventory_acquisition.csv": ",".join(without_optional) + "\n"}
    )
    assert classify_commit(work, sha).compatible is True


def test_unknown_column_is_incompatible(work: Path) -> None:
    header = _acquisition_header()
    sha = _commit(
        work,
        "future snapshot",
        {"inventory_acquisition.csv": header + ",from_the_future:string\n"},
    )
    result = classify_commit(work, sha)
    assert result.compatible is False
    assert result.reason is not None
    assert "from_the_future" in result.reason


def test_malformed_header_is_incompatible(work: Path) -> None:
    sha = _commit(work, "garbage snapshot", {"inventory_acquisition.csv": "not a header line\n"})
    result = classify_commit(work, sha)
    assert result.compatible is False
    assert result.reason is not None
