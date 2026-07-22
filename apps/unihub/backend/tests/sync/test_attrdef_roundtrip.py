"""Regression: AttributeDefinition.unit_family/emoji must round-trip through data_io.

Discovered during issue #35: the core.attributedefinition TableDescriptor
omitted `unit_family` and `emoji` (added in iterations 26/27 without the
constitution-mandated descriptor update). Every full apply that re-created
definitions from a snapshot therefore reset the families to '' — after which
any import of a dimension value crashed with "Definition has no valid unit
family", turning restores into 400s.
"""

from __future__ import annotations

import csv
import io

import pytest
from django.contrib.contenttypes.models import ContentType

from core.models import AttributeDefinition
from data_io.registry import get_registry
from data_io.services.change_preview import apply_diff, compute_diff
from data_io.services.csv_exporter import export_table
from data_io.services.csv_importer import parse_csv

pytestmark = pytest.mark.django_db


def _weight_definition() -> AttributeDefinition:
    ct = ContentType.objects.get(app_label="inventory", model="item")
    ad = AttributeDefinition.objects.get(content_type=ct, name="weight")
    assert ad.unit_family == "weight", "seeded weight definition must carry its family"
    return ad


def test_export_includes_unit_family_and_emoji() -> None:
    ad = _weight_definition()
    descriptor = get_registry()["core.attributedefinition"]
    text = export_table(descriptor).decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    assert "unit_family:string" in headers
    assert "emoji:string" in headers
    row = next(r for r in reader if r["id:string"] == str(ad.pk))
    assert row["unit_family:string"] == "weight"


def test_recreating_definitions_from_snapshot_preserves_family() -> None:
    """Delete-then-reapply (the full-apply shape) must not reset unit_family."""
    ad = _weight_definition()
    descriptor = get_registry()["core.attributedefinition"]
    text = export_table(descriptor).decode("utf-8")
    parsed, errors = parse_csv(text, descriptor)
    assert errors == []

    AttributeDefinition.objects.all().delete()
    diff = compute_diff(parsed, descriptor, mode="replace")
    apply_diff(diff, descriptor, mode="replace")

    restored = AttributeDefinition.objects.get(pk=ad.pk)
    assert restored.unit_family == "weight"
    assert restored.emoji == ad.emoji


def test_old_snapshot_without_family_columns_still_parses() -> None:
    """Pre-iteration-26 snapshots lack the columns — they stay importable."""
    descriptor = get_registry()["core.attributedefinition"]
    old_headers = (
        "id:string,content_type:string,name:text,data_type:text,"
        "is_system:boolean,display_order:integer,options:text"
    )
    _rows, errors = parse_csv(old_headers + "\n", descriptor)
    assert errors == []
