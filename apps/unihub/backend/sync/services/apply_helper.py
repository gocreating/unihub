"""Helpers for reading remote CSVs from the git clone and importing them."""

from __future__ import annotations

import subprocess
from pathlib import Path


def _csv_filename(content_type_label: str) -> str:
    return content_type_label.replace(".", "_") + ".csv"


def preview_from_fetch_head(clone_dir: Path) -> list:
    """Read CSVs from FETCH_HEAD tree and return per-table change previews."""
    from data_io.registry import get_registry
    from data_io.services.change_preview import compute_diff
    from data_io.services.csv_importer import parse_csv

    registry = get_registry()
    results = []

    for label, descriptor in registry.items():
        filename = _csv_filename(label)
        proc = subprocess.run(
            ["git", "show", f"FETCH_HEAD:{filename}"],
            cwd=str(clone_dir),
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode != 0:
            continue  # table not present in remote snapshot

        parsed_rows, errors = parse_csv(proc.stdout, descriptor)
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


def import_from_clone(clone_dir: Path) -> list:
    """Import all table CSVs from the working tree into the DB.

    Uses truncate-then-reinsert within a single transaction so that cross-device
    NanoID mismatches don't cause unique-constraint violations on secondary keys.
    Tables are deleted in reverse dependency order and reinserted in forward order.
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
            counts = apply_diff(diff, desc, mode="replace")
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
