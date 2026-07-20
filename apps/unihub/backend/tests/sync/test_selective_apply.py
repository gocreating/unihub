"""Tests for the selective-apply engine (spec 015 US4 FR-014, reused by US5 checkout).

Applies only the staged ChangeRecords in registry dependency order, auto-
including the FK closure so the resulting database stays internally
consistent — all decisions driven by registry metadata only (Principle II).
"""

from __future__ import annotations

import csv
import datetime
import io

import pytest

from data_io.registry import get_registry
from data_io.services.change_preview import apply_selected
from data_io.services.csv_exporter import export_table
from inventory.models import Acquisition, Item

pytestmark = pytest.mark.django_db


def _export_rows(label: str) -> dict[str, dict[str, str]]:
    """Current DB rows of a registered table as CSV-keyed dicts, keyed by pk."""
    descriptor = get_registry()[label]
    text = export_table(descriptor).decode("utf-8")
    rows = list(csv.DictReader(io.StringIO(text)))
    pk_header = next(f.csv_header for f in descriptor.system_fields if f.is_pk)
    return {row[pk_header]: row for row in rows}


def _create_records(rows: dict[str, dict[str, str]]) -> list[dict]:
    return [
        {"pk": pk, "operation": "create", "before": None, "after": row, "changed_fields": []}
        for pk, row in rows.items()
    ]


def _delete_records(rows: dict[str, dict[str, str]]) -> list[dict]:
    return [
        {"pk": pk, "operation": "delete", "before": row, "after": None, "changed_fields": []}
        for pk, row in rows.items()
    ]


@pytest.fixture
def snapshot() -> dict:
    """One acquisition + one item captured as CSV rows, then removed from the DB."""
    acq = Acquisition.objects.create(
        source="src",
        obtained_at=datetime.datetime(2021, 1, 1, tzinfo=datetime.timezone.utc),
    )
    item = Item.objects.create(name="thing", acquisition=acq)
    acq_pk, item_pk = str(acq.pk), str(item.pk)
    acq_rows = _export_rows("inventory.acquisition")
    item_rows = _export_rows("inventory.item")
    item.delete()
    acq.delete()
    return {
        "acq_pk": acq_pk,
        "item_pk": item_pk,
        "acq_rows": acq_rows,
        "item_rows": item_rows,
    }


def test_staged_create_auto_includes_its_excluded_parent(snapshot: dict) -> None:
    diffs = {
        "inventory.acquisition": _create_records(snapshot["acq_rows"]),
        "inventory.item": _create_records(snapshot["item_rows"]),
    }
    # The user stages the item but unchecks its acquisition.
    results, auto_included = apply_selected(
        diffs, excluded={("inventory.acquisition", snapshot["acq_pk"])}
    )

    # Both exist — the parent was auto-included to keep the DB consistent.
    assert Item.objects.filter(pk=snapshot["item_pk"]).exists()
    assert Acquisition.objects.filter(pk=snapshot["acq_pk"]).exists()
    assert {"table": "inventory.acquisition", "pk": snapshot["acq_pk"], "operation": "create"} in (
        auto_included
    )
    applied = {r["table"]: r["applied"] for r in results}
    assert applied["inventory.item"] == 1
    assert applied["inventory.acquisition"] == 1


def test_excluded_create_without_dependents_stays_out(snapshot: dict) -> None:
    diffs = {
        "inventory.acquisition": _create_records(snapshot["acq_rows"]),
        "inventory.item": _create_records(snapshot["item_rows"]),
    }
    # The user stages only the acquisition; the item stays unstaged.
    results, auto_included = apply_selected(
        diffs, excluded={("inventory.item", snapshot["item_pk"])}
    )

    assert Acquisition.objects.filter(pk=snapshot["acq_pk"]).exists()
    assert not Item.objects.filter(pk=snapshot["item_pk"]).exists()
    assert auto_included == []
    applied = {r["table"]: r["applied"] for r in results}
    assert applied["inventory.acquisition"] == 1
    assert "inventory.item" not in applied


def test_staged_parent_delete_auto_includes_excluded_child_delete() -> None:
    acq = Acquisition.objects.create(
        source="gone",
        obtained_at=datetime.datetime(2022, 1, 1, tzinfo=datetime.timezone.utc),
    )
    item = Item.objects.create(name="child", acquisition=acq)
    acq_rows = _export_rows("inventory.acquisition")
    item_rows = _export_rows("inventory.item")

    diffs = {
        "inventory.acquisition": _delete_records(acq_rows),
        "inventory.item": _delete_records(item_rows),
    }
    # The user stages the acquisition deletion but unchecks the item deletion.
    _results, auto_included = apply_selected(
        diffs, excluded={("inventory.item", str(item.pk))}
    )

    assert not Acquisition.objects.filter(pk=acq.pk).exists()
    assert not Item.objects.filter(pk=item.pk).exists()
    assert {"table": "inventory.item", "pk": str(item.pk), "operation": "delete"} in auto_included


def test_attribute_value_columns_ride_along(snapshot: dict) -> None:
    """Creates re-applied through the engine restore attribute columns too."""
    from django.contrib.contenttypes.models import ContentType

    from core.models import AttributeDefinition, AttributeValue

    ct = ContentType.objects.get(app_label="inventory", model="item")
    ad = (
        AttributeDefinition.objects.filter(content_type=ct, data_type__in=["text", "string"])
        .order_by("name")
        .first()
    )
    assert ad is not None, "expected a seeded text parameter definition"

    item_rows = dict(snapshot["item_rows"])
    header = f"[{ad.name}]:{ad.data_type}"
    for row in item_rows.values():
        row[header] = "seeded-value"

    diffs = {
        "inventory.acquisition": _create_records(snapshot["acq_rows"]),
        "inventory.item": _create_records(item_rows),
    }
    apply_selected(diffs, excluded=set())

    av = AttributeValue.objects.filter(
        attribute_definition=ad, object_id=snapshot["item_pk"]
    ).first()
    assert av is not None
    assert av.value == "seeded-value"
