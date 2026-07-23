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
        return format(val.normalize(), "f")
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
    header_to_field = {f.csv_header: f for f in descriptor.system_fields}

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
                # Normalize decimal strings so "2030.0000" == "2030"
                field_desc = header_to_field.get(header)
                if field_desc and field_desc.data_type == "decimal" and csv_val:
                    try:
                        csv_val = format(Decimal(csv_val).normalize(), "f")
                    except Exception:
                        pass
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
    if (
        field_desc.use_natural_key
        and field_desc.fk_content_type_label == "contenttypes.contenttype"
    ):
        from django.contrib.contenttypes.models import ContentType

        app_label, model_name = raw_value.split(".")
        return ContentType.objects.get(app_label=app_label, model=model_name)
    return raw_value


_MISSING = object()  # sentinel for absent optional CSV columns


def _build_model_kwargs(
    csv_row: dict[str, str], descriptor: TableDescriptor, exclude_pk: bool = False
) -> dict[str, Any]:
    """Build kwargs for Model.objects.create() or .update() from a CSV row.

    For optional fields absent from an older CSV, ``default_value`` is used
    so that importing pre-fix exports does not fail or corrupt data.
    """
    kwargs: dict[str, Any] = {}
    for field_desc in descriptor.system_fields:
        if exclude_pk and field_desc.is_pk:
            continue
        raw = csv_row.get(field_desc.csv_header, _MISSING)
        if raw is _MISSING:
            # Column absent from CSV — use the registered default for optional fields.
            if field_desc.optional:
                kwargs[field_desc.column_name] = field_desc.default_value
            # Required fields absent from CSV should have been caught by parse_csv;
            # skip silently here to avoid a KeyError.
            continue
        parsed = _parse_field_value_for_db(field_desc, raw)
        kwargs[field_desc.column_name] = parsed
    return kwargs


def _upsert_attribute_values(
    descriptor: TableDescriptor,
    pk_val: str,
    csv_row: dict[str, str],
) -> None:
    """Upsert AttributeValues for attribute columns in the CSV row.

    Applies to any of the table's definitions (system parameters included).
    Dimension cells arrive as "<value> <unit>"; the canonical numeric fields
    are recomputed on the way in via core.attributes.compute_value_fields.
    """
    from django.contrib.contenttypes.models import ContentType

    from core.attributes import compute_value_fields
    from core.models import AttributeDefinition, AttributeValue

    app_label, model_name = descriptor.content_type_label.split(".")
    try:
        ct = ContentType.objects.get(app_label=app_label, model=model_name)
    except ContentType.DoesNotExist:
        return

    for header, raw in csv_row.items():
        if not (header.startswith("[") and "]:" in header):
            continue
        attr_name = header.split("]:")[0][1:]
        try:
            ad = AttributeDefinition.objects.get(content_type=ct, name=attr_name)
        except AttributeDefinition.DoesNotExist:
            continue
        cell = (raw or "").strip()
        if not cell:
            # Blank cell = no value for this key on this row.
            AttributeValue.objects.filter(
                attribute_definition=ad, content_type=ct, object_id=pk_val
            ).delete()
            continue
        unit = ""
        if ad.data_type == "dimension" and " " in cell:
            cell, unit = cell.rsplit(" ", 1)
        value, value_unit, value_number, value_number_max = compute_value_fields(ad, cell, unit)
        AttributeValue.objects.update_or_create(
            attribute_definition=ad,
            content_type=ct,
            object_id=pk_val,
            defaults={
                "value": value,
                "value_unit": value_unit,
                "value_number": value_number,
                "value_number_max": value_number_max,
            },
        )


def _has_auto_now(model_class: type, attname: str) -> bool:
    """Return True if the field has auto_now=True or auto_now_add=True.

    These fields are overwritten by Django's pre_save() on create/save and
    require a two-step import to preserve the original value.
    """
    try:
        field = model_class._meta.get_field(attname)
        return getattr(field, "auto_now", False) or getattr(field, "auto_now_add", False)
    except Exception:
        return False


def _fk_fields(descriptor: TableDescriptor) -> list[FieldDescriptor]:
    """Real FK fields (contenttype natural keys excluded)."""
    return [
        f
        for f in descriptor.system_fields
        if f.is_fk
        and f.fk_content_type_label
        and f.fk_content_type_label != "contenttypes.contenttype"
    ]


def _dependency_closure(
    diffs_by_table: dict[str, list[dict[str, Any]]],
    staged: set[tuple[str, str]],
) -> list[dict[str, Any]]:
    """Grow ``staged`` in place with the FK closure; return the auto-included refs.

    Two rules, both driven purely by registry metadata (Principle II):
    - A staged create/update referencing a row that only exists among the
      diff's UNSTAGED creates pulls that create in (transitively).
    - A staged delete whose child rows are also deleted in the diff pulls
      those child deletes in, so the parent delete cannot orphan or silently
      cascade over rows the user never confirmed seeing applied.
    """
    from data_io.registry import get_registry

    registry = get_registry()
    record_index = {
        (label, record["pk"]): record
        for label, records in diffs_by_table.items()
        for record in records
    }

    auto_included: list[dict[str, Any]] = []
    queue = list(staged)
    while queue:
        label, pk = queue.pop()
        record = record_index[(label, pk)]
        descriptor = registry.get(label)
        if descriptor is None:
            continue

        if record["operation"] in ("create", "update"):
            after = record.get("after") or {}
            for fd in _fk_fields(descriptor):
                value = after.get(fd.csv_header, "")
                dep = (fd.fk_content_type_label, value)
                if (
                    value
                    and dep in record_index
                    and dep not in staged
                    and record_index[dep]["operation"] == "create"
                ):
                    staged.add(dep)
                    queue.append(dep)
                    auto_included.append({"table": dep[0], "pk": value, "operation": "create"})

        elif record["operation"] == "delete":
            for child_label, child_desc in registry.items():
                for fd in _fk_fields(child_desc):
                    if fd.fk_content_type_label != label:
                        continue
                    for child_rec in diffs_by_table.get(child_label, []):
                        if child_rec["operation"] != "delete":
                            continue
                        before = child_rec.get("before") or {}
                        dep = (child_label, child_rec["pk"])
                        if before.get(fd.csv_header, "") == pk and dep not in staged:
                            staged.add(dep)
                            queue.append(dep)
                            auto_included.append(
                                {
                                    "table": dep[0],
                                    "pk": child_rec["pk"],
                                    "operation": "delete",
                                }
                            )

    return auto_included


def apply_selected(
    diffs_by_table: dict[str, list[dict[str, Any]]],
    excluded: set[tuple[str, str]],
    acting_user: Any | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Apply only the staged ChangeRecords, in registry dependency order.

    Args:
        diffs_by_table: content_type_label → full ChangeRecord list.
        excluded: (label, pk) refs the user unchecked.
        acting_user: The user performing the apply; stamped into any table
            that declares an ``owner_field``.

    Returns:
        (results, auto_included) — per-table applied counts, and the refs the
        FK closure added back to keep the database internally consistent.
    """
    from data_io.registry import get_registry, topo_sort

    registry = get_registry()
    staged: set[tuple[str, str]] = {
        (label, record["pk"]) for label, records in diffs_by_table.items() for record in records
    } - set(excluded)

    auto_included = _dependency_closure(diffs_by_table, staged)

    order = topo_sort(list(diffs_by_table.keys()))
    applied_counts: dict[str, int] = {}

    with transaction.atomic():
        # Creates/updates parents-first…
        for label in order:
            records = [
                r
                for r in diffs_by_table.get(label, [])
                if (label, r["pk"]) in staged and r["operation"] != "delete"
            ]
            if records:
                counts = apply_diff(
                    records, registry[label], mode="replace", acting_user=acting_user
                )
                applied_counts[label] = applied_counts.get(label, 0) + sum(counts.values())
        # …deletes children-first.
        for label in reversed(order):
            records = [
                r
                for r in diffs_by_table.get(label, [])
                if (label, r["pk"]) in staged and r["operation"] == "delete"
            ]
            if records:
                counts = apply_diff(
                    records, registry[label], mode="replace", acting_user=acting_user
                )
                applied_counts[label] = applied_counts.get(label, 0) + sum(counts.values())

    results = [
        {
            "table": label,
            "display_name": registry[label].display_name,
            "applied": count,
        }
        for label, count in applied_counts.items()
    ]
    return results, auto_included


def apply_diff(
    change_records: list[dict[str, Any]],
    descriptor: TableDescriptor,
    mode: str,
    acting_user: Any | None = None,
) -> dict[str, int]:
    """Apply change records to the database inside a transaction.

    Args:
        change_records: ChangeRecord dicts from ``compute_diff``.
        descriptor: The registered TableDescriptor.
        mode: "upsert" or "replace".
        acting_user: The user performing the import. Required when the
            descriptor declares an ``owner_field`` and creates are present —
            created rows are stamped with this user (the owner column is never
            part of the CSV).

    Returns:
        Dict with keys: created, updated, deleted.

    Raises:
        ValueError: If the descriptor declares an ``owner_field`` but no
            acting user was provided for create operations.
    """
    pk_field = next(f for f in descriptor.system_fields if f.is_pk)
    created = updated = deleted = 0

    if (
        descriptor.owner_field
        and acting_user is None
        and any(r["operation"] == "create" for r in change_records)
    ):
        raise ValueError(
            f"Importing '{descriptor.content_type_label}' requires an acting user "
            f"to stamp its '{descriptor.owner_field}' field."
        )

    with transaction.atomic():
        for record in change_records:
            operation = record["operation"]
            pk_val = record["pk"]

            if operation == "create":
                csv_row = record["after"]
                kwargs = _build_model_kwargs(csv_row, descriptor, exclude_pk=False)
                if descriptor.owner_field:
                    kwargs[descriptor.owner_field] = acting_user

                # Identify auto_now and auto_now_add fields.  Django's pre_save
                # hooks overwrite these values during objects.create(), so we
                # must restore the original values with a follow-up .update()
                # call that bypasses the pre_save hooks entirely.
                auto_ts_fields = [
                    fd
                    for fd in descriptor.system_fields
                    if fd.data_type == "datetime"
                    and not fd.is_pk
                    and fd.csv_header in csv_row
                    and csv_row.get(fd.csv_header, "") != ""
                    and _has_auto_now(descriptor.model_class, fd.column_name)
                ]
                # Remove auto-timestamp kwargs before create — they'd be ignored anyway.
                ts_update_kwargs = {}
                for fd in auto_ts_fields:
                    if fd.column_name in kwargs and kwargs[fd.column_name] is not None:
                        ts_update_kwargs[fd.column_name] = kwargs.pop(fd.column_name)

                descriptor.model_class.objects.create(**kwargs)

                # Step 2: restore original timestamps via .update() which bypasses auto_now.
                if ts_update_kwargs:
                    pk_field_obj = next(f for f in descriptor.system_fields if f.is_pk)
                    descriptor.model_class.objects.filter(
                        **{pk_field_obj.column_name: pk_val}
                    ).update(**ts_update_kwargs)

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
                descriptor.model_class.objects.filter(**{pk_field.column_name: pk_val}).update(
                    **update_kwargs
                )
                if descriptor.has_user_attributes:
                    _upsert_attribute_values(descriptor, pk_val, changed_after)
                updated += 1

            elif operation == "delete":
                descriptor.model_class.objects.filter(**{pk_field.column_name: pk_val}).delete()
                deleted += 1

    return {"created": created, "updated": updated, "deleted": deleted}
