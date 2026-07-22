"""Helpers for exporting DB tables to CSVs inside the git clone."""

from __future__ import annotations

import subprocess
from pathlib import Path


def _csv_filename(content_type_label: str) -> str:
    """Convert 'finance.account' → 'finance_account.csv'."""
    return content_type_label.replace(".", "_") + ".csv"


def write_csvs_to_clone(clone_dir: Path, excluded: set[tuple[str, str]] | None = None) -> list[str]:
    """Export all registered tables as CSV files into clone_dir.

    With ``excluded`` refs, the written CSVs are hybrids: the full local
    export with each excluded row reverted to its state at the clone's HEAD
    (excluded update → HEAD version kept; excluded create → row dropped;
    excluded delete → HEAD row restored). Unstaged changes therefore remain
    local-only and reappear in the next preview.

    Returns:
        The list of content_type_labels that were written.
    """
    from data_io.registry import get_registry
    from data_io.services.csv_exporter import export_table

    registry = get_registry()
    exported: list[str] = []

    for label, descriptor in registry.items():
        csv_bytes = export_table(descriptor)
        excluded_pks = {pk for (table, pk) in excluded or set() if table == label}
        if excluded_pks:
            csv_bytes = _revert_excluded_rows(clone_dir, label, descriptor, csv_bytes, excluded_pks)
        dest = clone_dir / _csv_filename(label)
        dest.write_bytes(csv_bytes)
        exported.append(label)

    return exported


def _revert_excluded_rows(
    clone_dir: Path,
    label: str,
    descriptor,
    local_csv: bytes,
    excluded_pks: set[str],
) -> bytes:
    """Return the local CSV with each excluded pk reverted to the HEAD version."""
    import csv
    import io

    from data_io.services.change_preview import _get_pk_header

    pk_header = _get_pk_header(descriptor)

    local_reader = csv.DictReader(io.StringIO(local_csv.decode("utf-8")))
    local_headers = list(local_reader.fieldnames or [])
    local_rows = list(local_reader)

    head_rows: dict[str, dict[str, str]] = {}
    proc = subprocess.run(
        ["git", "show", f"HEAD:{_csv_filename(label)}"],
        cwd=str(clone_dir),
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode == 0:
        head_reader = csv.DictReader(io.StringIO(proc.stdout))
        head_bare = {h.split(":")[0]: h for h in (head_reader.fieldnames or [])}
        for row in head_reader:
            # Re-key the HEAD row onto the local export's headers (bare-name
            # match tolerates type-suffix renames between snapshots).
            mapped = {lh: row.get(head_bare.get(lh.split(":")[0], lh), "") for lh in local_headers}
            head_rows[mapped.get(pk_header, "")] = mapped

    output_rows: list[dict[str, str]] = []
    seen_pks: set[str] = set()
    for row in local_rows:
        pk = row.get(pk_header, "")
        seen_pks.add(pk)
        if pk in excluded_pks:
            head_version = head_rows.get(pk)
            if head_version is not None:
                output_rows.append(head_version)  # excluded update → HEAD version
            # excluded create → drop the row entirely
        else:
            output_rows.append(row)

    # Excluded deletes: rows present at HEAD but locally gone are restored.
    for pk in excluded_pks - seen_pks:
        head_version = head_rows.get(pk)
        if head_version is not None:
            output_rows.append(head_version)

    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=local_headers, extrasaction="ignore")
    writer.writeheader()
    for row in output_rows:
        writer.writerow(row)
    return out.getvalue().encode("utf-8")


def _diff_row_sets(
    local_rows: dict[str, dict[str, str]],
    head_rows: dict[str, dict[str, str]],
) -> list[dict]:
    """Compute publish-direction ChangeRecords between local DB and HEAD commit.

    local_rows: current DB state (what will be pushed to remote)
    head_rows:  last committed state on remote (what is currently there)

    create = record in local but not in HEAD  (will be added to remote)
    update = record in both with changed fields  (will be updated on remote)
    delete = record in HEAD but not in local  (will be removed from remote)
    """
    records: list[dict] = []
    local_pks = set(local_rows)
    head_pks = set(head_rows)

    for pk in local_pks - head_pks:
        records.append(
            {
                "pk": pk,
                "operation": "create",
                "before": None,
                "after": dict(local_rows[pk]),
                "changed_fields": [],
            }
        )

    for pk in local_pks & head_pks:
        src = local_rows[pk]
        tgt = head_rows[pk]
        changed = [h for h in src if src[h] != tgt.get(h, "")]
        if changed:
            records.append(
                {
                    "pk": pk,
                    "operation": "update",
                    "before": {h: tgt.get(h, "") for h in changed},
                    "after": {h: src[h] for h in changed},
                    "changed_fields": changed,
                }
            )

    for pk in head_pks - local_pks:
        records.append(
            {
                "pk": pk,
                "operation": "delete",
                "before": dict(head_rows[pk]),
                "after": None,
                "changed_fields": [],
            }
        )

    return records


def preview_publish_against_head(clone_dir: Path) -> list[dict]:
    """Compute per-table change summary of what would be published.

    Compares the current DB state against the last committed HEAD in the
    local clone, without staging or committing anything.

    Returns a list of dicts with keys: table, display_name, added, modified,
    deleted, is_new_table, rows.  Only tables with at least one change (or
    that are new to the remote) are included.  Returns an empty list when
    nothing has changed.
    """
    from data_io.registry import get_registry
    from data_io.services.change_preview import _get_pk_header
    from data_io.services.csv_exporter import export_table
    from data_io.services.csv_importer import parse_csv

    registry = get_registry()
    results: list[dict] = []

    for label, descriptor in registry.items():
        filename = _csv_filename(label)

        # ── Local DB state ─────────────────────────────────────────────────
        local_csv = export_table(descriptor).decode("utf-8")
        local_parsed, local_errors = parse_csv(local_csv, descriptor)
        if local_errors:
            continue

        pk_header = _get_pk_header(descriptor)
        local_rows: dict[str, dict[str, str]] = {r[pk_header]: r for r in local_parsed}

        # ── Last committed HEAD state ───────────────────────────────────────
        proc = subprocess.run(
            ["git", "show", f"HEAD:{filename}"],
            cwd=str(clone_dir),
            capture_output=True,
            text=True,
            timeout=30,
        )
        # table_is_new: file absent from HEAD means git will commit a new CSV,
        # even if the table is currently empty — always include in the preview.
        table_is_new = proc.returncode != 0
        if table_is_new:
            head_rows: dict[str, dict[str, str]] = {}
        else:
            head_parsed, head_errors = parse_csv(proc.stdout, descriptor)
            head_rows = {} if head_errors else {r[pk_header]: r for r in head_parsed}

        # ── Row-level diff ─────────────────────────────────────────────────
        rows = _diff_row_sets(local_rows, head_rows)
        added = sum(1 for r in rows if r["operation"] == "create")
        modified = sum(1 for r in rows if r["operation"] == "update")
        deleted = sum(1 for r in rows if r["operation"] == "delete")

        # Skip tables with no changes that already exist on the remote.
        # New tables are always included — git will commit the new CSV file
        # even when the table is currently empty.
        if added + modified + deleted == 0 and not table_is_new:
            continue

        results.append(
            {
                "table": label,
                "display_name": descriptor.display_name,
                "added": added,
                "modified": modified,
                "deleted": deleted,
                "is_new_table": table_is_new,
                "rows": rows,
            }
        )

    return results
