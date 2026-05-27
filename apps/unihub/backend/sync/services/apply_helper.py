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

    registry = get_registry()
    results = []

    # Read each CSV from the FETCH_HEAD tree without modifying the working tree
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

        csv_bytes = proc.stdout.encode("utf-8")
        diff = compute_diff(descriptor, csv_bytes)
        added = len([r for r in diff if r["action"] == "add"])
        modified = len([r for r in diff if r["action"] == "modify"])
        deleted = len([r for r in diff if r["action"] == "delete"])
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
    """Import all table CSVs from the working tree into the DB."""
    from data_io.registry import get_registry
    from data_io.services.change_preview import apply_diff, compute_diff

    registry = get_registry()
    results = []

    for label, descriptor in registry.items():
        csv_path = clone_dir / _csv_filename(label)
        if not csv_path.exists():
            continue

        csv_bytes = csv_path.read_bytes()
        diff = compute_diff(descriptor, csv_bytes)
        applied = apply_diff(descriptor, diff)
        results.append(
            {
                "table": label,
                "display_name": descriptor.display_name,
                "applied": applied,
            }
        )

    return results
