"""CSV parser and validator for import operations."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass

from data_io.registry import FieldDescriptor, TableDescriptor


@dataclass
class ValidationIssue:
    """A validation error found during CSV parsing."""

    row: int  # 0 = header row issue, 1+ = data row
    column: str | None
    message: str


# Valid header pattern: "name:type" or "[name]:type"
_HEADER_RE = re.compile(r"^(\[.+\]|[^\[].+):(\w+)$")


def _expected_system_header_set(descriptor: TableDescriptor) -> set[str]:
    return {f.csv_header for f in descriptor.system_fields}


def _get_user_attr_header_set(descriptor: TableDescriptor) -> set[str]:
    """Return set of valid user-defined attribute CSV headers for this table."""
    if not descriptor.has_user_attributes:
        return set()
    from django.contrib.contenttypes.models import ContentType

    from core.models import AttributeDefinition

    app_label, model_name = descriptor.content_type_label.split(".")
    try:
        ct = ContentType.objects.get(app_label=app_label, model=model_name)
    except ContentType.DoesNotExist:
        return set()
    return {
        f"[{ad.name}]:{ad.data_type}"
        for ad in AttributeDefinition.objects.filter(content_type=ct, is_system=False)
    }


def _validate_fk_value(
    field_desc: FieldDescriptor,
    value: str,
    row_num: int,
    allowed_fk_pks: dict[str, set[str]] | None = None,
) -> ValidationIssue | None:
    """Check that a FK reference value exists in the target table.

    allowed_fk_pks maps content_type_label → set of PKs that are being
    imported in the same batch and should be treated as valid references
    even before they are written to the database.
    """
    if not value:
        return None
    fk_label: str = field_desc.fk_content_type_label  # type: ignore[assignment]

    # Accept if the PK is present in the batch being imported
    if allowed_fk_pks and fk_label in allowed_fk_pks and value in allowed_fk_pks[fk_label]:
        return None

    app_label, model_name = fk_label.split(".")
    from django.apps import apps

    try:
        model = apps.get_model(app_label, model_name)
        if not model.objects.filter(pk=value).exists():
            return ValidationIssue(
                row=row_num,
                column=field_desc.csv_header,
                message=f"Referenced {fk_label} '{value}' does not exist.",
            )
    except LookupError:
        pass
    return None


def parse_csv(
    csv_text: str,
    descriptor: TableDescriptor,
    allowed_fk_pks: dict[str, set[str]] | None = None,
) -> tuple[list[dict[str, str]], list[ValidationIssue]]:
    """Parse CSV text against a TableDescriptor.

    Returns:
        (parsed_rows, errors) — rows is empty when there are validation errors.
    """
    errors: list[ValidationIssue] = []
    reader = csv.DictReader(io.StringIO(csv_text))
    headers: list[str] = list(reader.fieldnames or [])

    # ── Validate header format ─────────────────────────────────────────────────
    for header in headers:
        if not _HEADER_RE.match(header):
            errors.append(
                ValidationIssue(
                    row=0,
                    column=header,
                    message=f"Invalid header format '{header}'. Expected 'name:type' or '[name]:type'.",
                )
            )

    if errors:
        return [], errors

    # ── Build column-name → canonical registry header mapping ─────────────────
    # Maps the bare column name (e.g. "symbol") to the registry's full header
    # (e.g. "symbol:string").  This lets us accept CSVs exported before a data
    # type was renamed (e.g. "symbol:text" → "symbol:string") without error.
    col_name_to_reg_header: dict[str, str] = {}
    for fd in descriptor.system_fields:
        bare = fd.csv_header.split(":")[0]
        col_name_to_reg_header[bare] = fd.csv_header
    for ua_header in _get_user_attr_header_set(descriptor):
        bare = ua_header.split(":")[0]
        col_name_to_reg_header[bare] = ua_header

    # ── Check all *required* system columns are present ────────────────────────
    # Optional fields (optional=True on FieldDescriptor) may be absent in older
    # exported CSVs produced before those fields were added to the data model.
    # Missing optional columns are silently filled with default_value on import.
    # Presence is checked by column name only (type suffix may differ in old CSVs).
    csv_col_names = {h.split(":")[0] for h in headers}

    for fd in descriptor.system_fields:
        bare = fd.csv_header.split(":")[0]
        if not fd.optional and bare not in csv_col_names:
            errors.append(
                ValidationIssue(
                    row=0, column=None, message=f"Missing required column: {fd.csv_header}."
                )
            )

    if errors:
        return [], errors

    # ── Check for unknown columns (not in system fields or user attrs) ─────────
    for header in headers:
        bare = header.split(":")[0]
        if bare not in col_name_to_reg_header:
            errors.append(
                ValidationIssue(
                    row=0,
                    column=header,
                    message=f"Unknown column '{header}' not found in table schema.",
                )
            )

    if errors:
        return [], errors

    # ── Find PK field ──────────────────────────────────────────────────────────
    pk_field = next((f for f in descriptor.system_fields if f.is_pk), None)
    pk_header = pk_field.csv_header if pk_field else None

    # ── FK fields ─────────────────────────────────────────────────────────────
    fk_fields = [
        f
        for f in descriptor.system_fields
        if f.is_fk
        and f.fk_content_type_label
        and f.fk_content_type_label != "contenttypes.contenttype"
    ]

    # ── Parse data rows ────────────────────────────────────────────────────────
    rows: list[dict[str, str]] = []
    seen_pks: set[str] = set()

    for row_num, row in enumerate(reader, start=1):
        row_errors: list[ValidationIssue] = []

        # Duplicate PK check — use bare column name to handle any type-suffix change
        if pk_header:
            pk_col = pk_header.split(":")[0]
            pk_val = next((v for k, v in row.items() if k.split(":")[0] == pk_col), "")
            if pk_val and pk_val in seen_pks:
                row_errors.append(
                    ValidationIssue(
                        row=row_num,
                        column=pk_header,
                        message=f"Duplicate primary key '{pk_val}' in CSV.",
                    )
                )
            elif pk_val:
                seen_pks.add(pk_val)

        # FK existence validation — use bare column name for header-agnostic lookup
        for fk_field in fk_fields:
            fk_col = fk_field.csv_header.split(":")[0]
            val = next((v for k, v in row.items() if k.split(":")[0] == fk_col), "")
            issue = _validate_fk_value(fk_field, val, row_num, allowed_fk_pks=allowed_fk_pks)
            if issue:
                row_errors.append(issue)

        errors.extend(row_errors)
        # Normalize row keys to use the registry's canonical headers so that
        # downstream code can use field_desc.csv_header for lookups regardless
        # of what type suffix appeared in the original CSV (e.g. "symbol:text"
        # is remapped to "symbol:string" if the registry now uses "string").
        normalized_row: dict[str, str] = {}
        for k, v in row.items():
            bare = k.split(":")[0]
            canonical = col_name_to_reg_header.get(bare, k)
            normalized_row[canonical] = v
        rows.append(normalized_row)

    if errors:
        return [], errors

    return rows, []
