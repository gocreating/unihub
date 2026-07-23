"""Helpers for reading remote CSVs from the git clone and importing them."""

from __future__ import annotations

import subprocess
from pathlib import Path


def _csv_filename(content_type_label: str) -> str:
    return content_type_label.replace(".", "_") + ".csv"


def _batch_pks(raw_csvs: dict[str, str]) -> dict[str, set[str]]:
    """Collect each table's pks from the raw snapshot CSVs.

    Passed to parse_csv as allowed_fk_pks so rows may reference parents that
    only exist elsewhere in the same snapshot (not yet in the DB).
    """
    import csv
    import io

    from data_io.registry import get_registry

    registry = get_registry()
    allowed: dict[str, set[str]] = {}
    for label, text in raw_csvs.items():
        descriptor = registry[label]
        pk_bare = next(
            (f.csv_header.split(":")[0] for f in descriptor.system_fields if f.is_pk), None
        )
        if pk_bare is None:
            continue
        reader = csv.DictReader(io.StringIO(text))
        pk_header = next((h for h in (reader.fieldnames or []) if h.split(":")[0] == pk_bare), None)
        if pk_header is None:
            continue
        allowed[label] = {row[pk_header] for row in reader if row.get(pk_header)}
    return allowed


def preview_from_commit(clone_dir: Path, ref: str) -> list:
    """Diff the snapshot at ``ref`` against the local DB (replace semantics).

    Args:
        clone_dir: The server clone containing the ref.
        ref: Any commit-ish (sha, FETCH_HEAD, …).

    Returns:
        Per-table change dicts describing what applying the snapshot would do
        locally. Tables absent from the snapshot are left untouched.
    """
    from data_io.registry import get_registry
    from data_io.services.change_preview import compute_diff
    from data_io.services.csv_importer import parse_csv

    registry = get_registry()

    raw_csvs: dict[str, str] = {}
    for label in registry:
        proc = subprocess.run(
            ["git", "show", f"{ref}:{_csv_filename(label)}"],
            cwd=str(clone_dir),
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode == 0:
            raw_csvs[label] = proc.stdout

    allowed_fk_pks = _batch_pks(raw_csvs)

    results = []
    for label, text in raw_csvs.items():
        descriptor = registry[label]
        parsed_rows, errors = parse_csv(text, descriptor, allowed_fk_pks=allowed_fk_pks)
        if errors:
            continue

        diff = compute_diff(parsed_rows, descriptor, mode="replace")
        added = len([r for r in diff if r["operation"] == "create"])
        modified = len([r for r in diff if r["operation"] == "update"])
        deleted = len([r for r in diff if r["operation"] == "delete"])
        if added + modified + deleted == 0:
            continue

        results.append(
            {
                "table": label,
                "display_name": descriptor.display_name,
                "added": added,
                "modified": modified,
                "deleted": deleted,
                "rows": diff,
            }
        )

    return results


def preview_from_fetch_head(clone_dir: Path) -> list:
    """Read CSVs from the FETCH_HEAD tree and return per-table change previews."""
    return preview_from_commit(clone_dir, "FETCH_HEAD")


def import_from_clone(clone_dir: Path, acting_user: object | None = None) -> list:
    """Import all table CSVs from the working tree into the DB.

    Uses truncate-then-reinsert within a single transaction so that cross-device
    NanoID mismatches don't cause unique-constraint violations on secondary keys.
    Tables are deleted in reverse dependency order and reinserted in forward order.

    Args:
        clone_dir: The server clone whose working tree holds the CSVs.
        acting_user: The user performing the import; stamped into tables that
            declare an ``owner_field`` (their owner column is never in the CSV).
    """
    from data_io.registry import get_registry, topo_sort
    from data_io.services.change_preview import apply_diff, compute_diff
    from data_io.services.csv_importer import parse_csv
    from django.db import transaction

    registry = get_registry()

    table_items: list[tuple] = []
    for label, descriptor in registry.items():
        csv_path = clone_dir / _csv_filename(label)
        if not csv_path.exists():
            continue
        parsed_rows, errors = parse_csv(csv_path.read_text(encoding="utf-8"), descriptor)
        if errors:
            continue
        table_items.append((label, descriptor, parsed_rows))

    if not table_items:
        return []

    labels = [item[0] for item in table_items]
    sorted_labels = topo_sort(labels)
    data_map = {item[0]: (item[1], item[2]) for item in table_items}

    results = []

    with transaction.atomic():
        # Phase 1: delete in reverse dep order (children before parents)
        for label in reversed(sorted_labels):
            desc, _ = data_map[label]
            desc.model_class.objects.all().delete()

        # Phase 2: reinsert in dep order; truncated DB means compute_diff marks
        # all remote rows as "create", so no secondary unique-key conflicts
        for label in sorted_labels:
            desc, parsed_rows = data_map[label]
            diff = compute_diff(parsed_rows, desc, mode="replace")
            counts = apply_diff(diff, desc, mode="replace", acting_user=acting_user)
            results.append(
                {
                    "table": label,
                    "display_name": desc.display_name,
                    "applied": counts.get("created", 0)
                    + counts.get("updated", 0)
                    + counts.get("deleted", 0),
                }
            )

    return results
