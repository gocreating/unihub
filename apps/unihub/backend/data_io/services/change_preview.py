"""Change preview: diff CSV rows against DB, and apply diffs in transactions."""

from __future__ import annotations

import datetime
import json
from decimal import Decimal
from typing import Any

from django.db import transaction

from data_io.registry import FieldDescriptor, TableDescriptor


def _serialize_db_value(field_desc: FieldDescriptor, row: object) -> str:
    """Serialize a DB row field value to the same string format as CSV export."""
    if field_desc.use_natural_key:
        related = getattr(row, field_desc.column_name, None)
        if related is None:
            return ""
        return f"{related.app_label}.{related.model}"

    val = getattr(row, field_desc.column_name, None)

    if field_desc.is_json:
        if val is None:
            return ""
        return json.dumps(val)

    if val is None:
        return ""
    if isinstance(val, datetime.datetime):
        return val.isoformat().replace("+00:00", "Z")
    if isinstance(val, datetime.date):
        return val.isoformat()
    if isinstance(val, Decimal):
        return str(val)
    if isinstance(val, bool):
        return "true" if val else "false"
    return str(val)


def _row_to_dict(descriptor: TableDescriptor, row: object) -> dict[str, str]:
    """Convert a model row to a CSV-keyed dict for diffing."""
    result: dict[str, str] = {}
    for field_desc in descriptor.system_fields:
        result[field_desc.csv_header] = _serialize_db_value(field_desc, row)
    return result


def _get_pk_header(descriptor: TableDescriptor) -> str:
    pk_field = next((f for f in descriptor.system_fields if f.is_pk), None)
    if pk_field is None:
        raise ValueError(f"No PK field defined for table '{descriptor.content_type_label}'")
    return pk_field.csv_header


def compute_diff(
    parsed_rows: list[dict[str, str]],
    descriptor: TableDescriptor,
    mode: str,
) -> list[dict[str, Any]]:
    """Compare CSV rows against current DB rows and produce ChangeRecords.

    Args:
        parsed_rows: Output from parse_csv (list of header→value dicts).
        descriptor: The registered TableDescriptor.
        mode: "upsert" or "replace".

    Returns:
        List of ChangeRecord dicts with keys: pk, operation, before, after, changed_fields.
    """
    pk_header = _get_pk_header(descriptor)

    # Load current DB state keyed by PK string
    db_rows: dict[str, dict[str, str]] = {}
    for db_row in descriptor.model_class.objects.all():
        pk_val = str(getattr(db_row, descriptor.model_class._meta.pk.name))  # type: ignore[union-attr]
        db_rows[pk_val] = _row_to_dict(descriptor, db_row)

    records: list[dict[str, Any]] = []
    csv_pks: set[str] = set()

    for csv_row in parsed_rows:
        pk_val = csv_row.get(pk_header, "")
        csv_pks.add(pk_val)

        if pk_val not in db_rows:
            # CREATE
            records.append(
                {
                    "pk": pk_val,
                    "operation": "create",
                    "before": None,
                    "after": dict(csv_row),
                    "changed_fields": [],
                }
            )
        else:
            # Compare
            db_row_dict = db_rows[pk_val]
            changed: list[str] = []
            before: dict[str, str] = {}
            after: dict[str, str] = {}

            for header in csv_row:
                csv_val = csv_row[header]
                db_val = db_row_dict.get(header, "")
                if csv_val != db_val:
                    changed.append(header)
                    before[header] = db_val
                    after[header] = csv_val

            if changed:
                records.append(
                    {
                        "pk": pk_val,
                        "operation": "update",
                        "before": before,
                        "after": after,
                        "changed_fields": changed,
                    }
                )
            # else: unchanged — skip

    # DELETE: DB rows not in CSV (replace mode only)
    if mode == "replace":
        for db_pk, db_row_dict in db_rows.items():
            if db_pk not in csv_pks:
                records.append(
                    {
                        "pk": db_pk,
                        "operation": "delete",
                        "before": db_row_dict,
                        "after": None,
                        "changed_fields": [],
                    }
                )

    return records


def _parse_field_value_for_db(field_desc: FieldDescriptor, raw_value: str) -> Any:
    """Convert a raw CSV string to the appropriate Python type for DB insertion."""
    if raw_value == "":
        return None if field_desc.nullable else raw_value

    if field_desc.is_json:
        try:
            return json.loads(raw_value)
        except (json.JSONDecodeError, ValueError):
            return []

    if field_desc.data_type == "boolean":
        return raw_value.lower() in ("true", "1", "yes")
    if field_desc.data_type in ("integer",):
        try:
            return int(raw_value)
        except ValueError:
            return 0
    if field_desc.data_type in ("decimal",):
        return Decimal(raw_value)
    if field_desc.data_type in ("datetime",):
        # Parse ISO datetime
        raw = raw_value.replace("Z", "+00:00")
        return datetime.datetime.fromisoformat(raw)
    if field_desc.data_type in ("date",):
        return datetime.date.fromisoformat(raw_value)
    if field_desc.use_natural_key and field_desc.fk_content_type_label == "contenttypes.contenttype":
        from django.contrib.contenttypes.models import ContentType

        app_label, model_name = raw_value.split(".")
        return ContentType.objects.get(app_label=app_label, model=model_name)
    return raw_value


def _build_model_kwargs(
    csv_row: dict[str, str], descriptor: TableDescriptor, exclude_pk: bool = False
) -> dict[str, Any]:
    """Build kwargs for Model.objects.create() or .update() from a CSV row."""
    kwargs: dict[str, Any] = {}
    for field_desc in descriptor.system_fields:
        if exclude_pk and field_desc.is_pk:
            continue
        raw = csv_row.get(field_desc.csv_header, "")
        parsed = _parse_field_value_for_db(field_desc, raw)
        if field_desc.use_natural_key and field_desc.fk_content_type_label == "contenttypes.contenttype":
            kwargs[field_desc.column_name] = parsed
        else:
            kwargs[field_desc.column_name] = parsed
    return kwargs


def _upsert_attribute_values(
    descriptor: TableDescriptor,
    pk_val: str,
    csv_row: dict[str, str],
) -> None:
    """Upsert AttributeValues for user-defined attribute columns in the CSV row."""
    from django.contrib.contenttypes.models import ContentType

    from core.models import AttributeDefinition, AttributeValue

    app_label, model_name = descriptor.content_type_label.split(".")
    try:
        ct = ContentType.objects.get(app_label=app_label, model=model_name)
    except ContentType.DoesNotExist:
        return

    for header, value in csv_row.items():
        if not (header.startswith("[") and "]:" in header):
            continue
        attr_name = header.split("]:")[0][1:]
        try:
            ad = AttributeDefinition.objects.get(content_type=ct, name=attr_name, is_system=False)
        except AttributeDefinition.DoesNotExist:
            continue
        AttributeValue.objects.update_or_create(
            attribute_definition=ad,
            content_type=ct,
            object_id=pk_val,
            defaults={"value": value},
        )


def apply_diff(
    change_records: list[dict[str, Any]],
    descriptor: TableDescriptor,
    mode: str,
) -> dict[str, int]:
    """Apply change records to the database inside a transaction.

    Returns:
        Dict with keys: created, updated, deleted.
    """
    pk_field = next(f for f in descriptor.system_fields if f.is_pk)
    created = updated = deleted = 0

    with transaction.atomic():
        for record in change_records:
            operation = record["operation"]
            pk_val = record["pk"]

            if operation == "create":
                csv_row = record["after"]
                kwargs = _build_model_kwargs(csv_row, descriptor, exclude_pk=False)
                descriptor.model_class.objects.create(**kwargs)
                if descriptor.has_user_attributes:
                    _upsert_attribute_values(descriptor, pk_val, csv_row)
                created += 1

            elif operation == "update":
                # "after" contains only changed fields — build update kwargs from them only
                changed_after = record.get("after", {}) or {}
                update_kwargs: dict[str, Any] = {}
                for field_desc in descriptor.system_fields:
                    if field_desc.is_pk:
                        continue
                    if field_desc.csv_header in changed_after:
                        update_kwargs[field_desc.column_name] = _parse_field_value_for_db(
                            field_desc, changed_after[field_desc.csv_header]
                        )
                descriptor.model_class.objects.filter(
                    **{pk_field.column_name: pk_val}
                ).update(**update_kwargs)
                if descriptor.has_user_attributes:
                    _upsert_attribute_values(descriptor, pk_val, changed_after)
                updated += 1

            elif operation == "delete":
                descriptor.model_class.objects.filter(
                    **{pk_field.column_name: pk_val}
                ).delete()
                deleted += 1

    return {"created": created, "updated": updated, "deleted": deleted}
