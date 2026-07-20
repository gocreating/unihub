"""Regression tests for spec 015 FR-001..FR-004 — previews cover the COMPLETE dataset.

Reproduces the issue #35 P1 bug: the publish preview reported 1000+ phantom
``inventory.item`` deletions. The preview must always be computed against the
true remote head over the full, unfiltered dataset — a stale server-side clone
must never fabricate deletions for rows that still exist locally.
"""

from __future__ import annotations

import datetime
import subprocess
from pathlib import Path

import pytest

from inventory.models import Acquisition, Item
from sync.services.git_service import GitSyncService

pytestmark = pytest.mark.django_db


@pytest.fixture
def svc(bare_repo: dict, tmp_path: Path) -> GitSyncService:
    return GitSyncService(
        repo_url=bare_repo["repo_url"],
        pat=bare_repo["pat"],
        clone_dir=tmp_path / "server_clone",
    )


def _git(cwd: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=str(cwd), check=True, capture_output=True, text=True)
    return proc.stdout.strip()


def _seed_multi_year_items(years: list[int]) -> list[Item]:
    """One acquisition + item per year — most fall OUTSIDE the catalog's
    default view filter (obtained this year OR no obtained date)."""
    items = []
    for year in years:
        acq = Acquisition.objects.create(
            source=f"shop-{year}",
            obtained_at=datetime.datetime(year, 6, 1, tzinfo=datetime.timezone.utc),
        )
        items.append(Item.objects.create(name=f"item-{year}", acquisition=acq))
    return items


def test_unchanged_multi_year_dataset_previews_up_to_date(svc: GitSyncService) -> None:
    """FR-004: multi-year data + default catalog filter present → zero phantom rows."""
    _seed_multi_year_items(list(range(2015, 2027)))
    svc.publish()
    assert svc.publish_preview() is None


def test_single_change_previews_exactly_that_row_and_no_deletions(
    svc: GitSyncService,
) -> None:
    items = _seed_multi_year_items(list(range(2015, 2027)))
    svc.publish()

    items[0].name = "renamed-item"
    items[0].save()

    preview = svc.publish_preview()
    assert preview is not None
    changes = preview.changes
    assert all(ch["deleted"] == 0 for ch in changes)
    item_changes = [ch for ch in changes if ch["table"] == "inventory.item"]
    assert len(item_changes) == 1
    rows = item_changes[0]["rows"]
    assert len(rows) == 1
    assert rows[0]["operation"] == "update"
    assert rows[0]["pk"] == str(items[0].pk)


def test_stale_clone_must_not_fabricate_deletions(svc: GitSyncService) -> None:
    """THE bug: a stale server-clone HEAD showed rows absent from the DB as
    mass deletions even though the DB matched the actual remote head."""
    items = _seed_multi_year_items([2015, 2020, 2026])
    svc.publish()
    c1 = _git(svc.clone_dir, "rev-parse", "HEAD")

    # The user legitimately deletes one item and publishes again (remote → C2).
    items[1].delete()
    svc.publish()
    c2 = _git(svc.clone_dir, "rev-parse", "HEAD")
    assert c1 != c2

    # Corrupt state: the server clone is later left stale at C1.
    _git(svc.clone_dir, "reset", "--hard", c1)

    # The DB matches the true remote head (C2) — the preview must say so and
    # must NOT report the C1-only row as a deletion.
    assert svc.publish_preview() is None


def test_preview_reflects_foreign_remote_commit(svc: GitSyncService, bare_repo: dict) -> None:
    """A commit pushed from another device must be part of the preview base."""
    _seed_multi_year_items([2015, 2026])
    svc.publish()

    # Another device removes one item row from the remote CSV.
    work = bare_repo["clone"]
    _git(work, "pull", "origin", "HEAD")
    csv_path = work / "inventory_item.csv"
    lines = csv_path.read_text(encoding="utf-8").splitlines(keepends=True)
    assert len(lines) >= 3  # header + 2 items
    csv_path.write_text("".join(lines[:-1]), encoding="utf-8")
    _git(work, "add", ".")
    _git(work, "commit", "-m", "remove one item on another device")
    _git(work, "push", "origin", "HEAD")

    preview = svc.publish_preview()
    assert preview is not None
    item_changes = [ch for ch in preview.changes if ch["table"] == "inventory.item"]
    assert len(item_changes) == 1
    # The locally-present row missing from the new remote head is re-added…
    assert item_changes[0]["added"] == 1
    # …and nothing is ever deleted for rows that still exist locally.
    assert all(ch["deleted"] == 0 for ch in preview.changes)


def test_pull_preview_covers_full_dataset(svc: GitSyncService, bare_repo: dict) -> None:
    """US1 scenario 5 — the pull direction also diffs the complete dataset."""
    items = _seed_multi_year_items([2015, 2020, 2026])
    svc.publish()
    assert svc.apply_preview() is None  # in sync

    # Another device removes one item row from the remote CSV.
    work = bare_repo["clone"]
    _git(work, "pull", "origin", "HEAD")
    csv_path = work / "inventory_item.csv"
    lines = csv_path.read_text(encoding="utf-8").splitlines(keepends=True)
    csv_path.write_text("".join(lines[:-1]), encoding="utf-8")
    _git(work, "add", ".")
    _git(work, "commit", "-m", "remove one item remotely")
    _git(work, "push", "origin", "HEAD")

    changes = svc.apply_preview()
    assert changes is not None
    item_changes = [ch for ch in changes if ch["table"] == "inventory.item"]
    assert len(item_changes) == 1
    assert item_changes[0]["deleted"] == 1  # applying remote would delete it locally
    deleted_pks = {r["pk"] for r in item_changes[0]["rows"] if r["operation"] == "delete"}
    assert deleted_pks <= {str(i.pk) for i in items}
