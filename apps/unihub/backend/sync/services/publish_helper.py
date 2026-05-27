"""Helpers for exporting DB tables to CSVs inside the git clone."""

from __future__ import annotations

from pathlib import Path


def _csv_filename(content_type_label: str) -> str:
    """Convert 'finance.account' → 'finance_account.csv'."""
    return content_type_label.replace(".", "_") + ".csv"


def write_csvs_to_clone(clone_dir: Path) -> list[str]:
    """Export all registered tables as CSV files into clone_dir.

    Returns the list of content_type_labels that were written.
    """
    from data_io.registry import get_registry
    from data_io.services.csv_exporter import export_table

    registry = get_registry()
    exported: list[str] = []

    for label, descriptor in registry.items():
        csv_bytes = export_table(descriptor)
        dest = clone_dir / _csv_filename(label)
        dest.write_bytes(csv_bytes)
        exported.append(label)

    return exported
