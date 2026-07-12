"""CSV/ZIP exporter for registered io tables."""

from __future__ import annotations

import csv
import datetime
import io
import json
import zipfile
from decimal import Decimal

from data_io.registry import FieldDescriptor, TableDescriptor


def _serialize_value(field_desc: FieldDescriptor, row: object) -> str:
    """Serialize a single model field value to a CSV string."""
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


def _get_user_attr_fields(descriptor: TableDescriptor) -> list[tuple[str, str]]:
    """Return list of (csv_header, attr_name) for exportable AttributeDefinitions.

    All of the table's definitions participate — including system ones (e.g.
    the seeded inventory item parameters) — EXCEPT definitions whose name
    collides with a concrete system column (e.g. finance Account's
    name/currency mirrors), which would duplicate a CSV header.
    """
    from django.contrib.contenttypes.models import ContentType

    from core.models import AttributeDefinition

    app_label, model_name = descriptor.content_type_label.split(".")
    try:
        ct = ContentType.objects.get(app_label=app_label, model=model_name)
    except ContentType.DoesNotExist:
        return []

    system_names = {f.column_name for f in descriptor.system_fields}
    user_attrs = (
        AttributeDefinition.objects.filter(content_type=ct)
        .exclude(name__in=system_names)
        .order_by("display_order", "name")
    )
    return [(f"[{ad.name}]:{ad.data_type}", ad.name) for ad in user_attrs]


def export_table(descriptor: TableDescriptor) -> bytes:
    """Serialize all rows of a registered table to CSV bytes."""
    system_headers = [f.csv_header for f in descriptor.system_fields]

    user_attr_fields: list[tuple[str, str]] = []
    if descriptor.has_user_attributes:
        user_attr_fields = _get_user_attr_fields(descriptor)

    all_headers = system_headers + [h for h, _ in user_attr_fields]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=all_headers, extrasaction="ignore")
    writer.writeheader()

    rows = descriptor.model_class.objects.all()

    # Prefetch AttributeValues if needed
    av_by_pk: dict[str, dict[str, str]] = {}
    if descriptor.has_user_attributes and user_attr_fields:
        from django.contrib.contenttypes.models import ContentType

        from core.models import AttributeValue

        app_label, model_name = descriptor.content_type_label.split(".")
        try:
            ct = ContentType.objects.get(app_label=app_label, model=model_name)
            for av in AttributeValue.objects.filter(content_type=ct).select_related(
                "attribute_definition"
            ):
                cell = av.value
                # Dimension values carry their entered unit in the cell ("1.5 kg").
                if av.attribute_definition.data_type == "dimension" and av.value_unit:
                    cell = f"{av.value} {av.value_unit}"
                av_by_pk.setdefault(av.object_id, {})[av.attribute_definition.name] = cell
        except ContentType.DoesNotExist:
            pass

    for row in rows:
        row_data: dict[str, str] = {}
        for field_desc in descriptor.system_fields:
            row_data[field_desc.csv_header] = _serialize_value(field_desc, row)
        if descriptor.has_user_attributes:
            pk_val = str(getattr(row, "pk"))
            obj_attrs = av_by_pk.get(pk_val, {})
            for header, attr_name in user_attr_fields:
                row_data[header] = obj_attrs.get(attr_name, "")
        writer.writerow(row_data)

    return output.getvalue().encode("utf-8")


def _zip_entry_name(content_type_label: str) -> str:
    """Convert 'finance.account' → 'finance_account.csv'."""
    return content_type_label.replace(".", "_") + ".csv"


def export_tables(descriptors: list[TableDescriptor]) -> bytes:
    """Serialize multiple tables into a single ZIP archive."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for descriptor in descriptors:
            csv_bytes = export_table(descriptor)
            zf.writestr(_zip_entry_name(descriptor.content_type_label), csv_bytes)
    return buf.getvalue()
