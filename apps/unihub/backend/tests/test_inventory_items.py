"""Integration tests for Inventory items — iteration-3 fields (US1)."""

import json

import pytest

from tests.conftest import create_item

ITEMS = "/api/v1/inventory/items/"


def _patch(client, item_id, body):
    return client.patch(f"{ITEMS}{item_id}/", json.dumps(body), content_type="application/json")


@pytest.mark.django_db
class TestItems:
    def test_item_sku_price_and_total_price(self, auth_client):
        item = create_item(auth_client, name="P", sku_price="10", quantity="3")
        fetched = auth_client.get(f"{ITEMS}{item['id']}/").json()
        assert fetched["sku_price"] == "10.0000"
        assert fetched["total_price"] == "30.0000"  # 10 × 3

    def test_item_quantity_defaults_to_one(self, auth_client):
        item = create_item(auth_client, name="Q")  # no quantity given
        assert auth_client.get(f"{ITEMS}{item['id']}/").json()["quantity"] == "1.0000"

    def test_item_volume_roundtrip_units(self, auth_client):
        item = create_item(auth_client, name="V", volume={"value": "1.2", "unit": "L"})
        assert auth_client.get(f"{ITEMS}{item['id']}/").json()["volume"] == {
            "value": "1.2",
            "unit": "L",
        }

    def test_deprecate_sets_status_deprecated(self, auth_client):
        item = create_item(auth_client, name="D")
        assert item["status"] == "active"
        resp = _patch(auth_client, item["id"], {"deprecate_time": "2026-01-01T00:00:00Z"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "deprecated"

    def test_restore_clears_deprecate_time(self, auth_client):
        item = create_item(auth_client, name="R")
        _patch(auth_client, item["id"], {"deprecate_time": "2026-01-01T00:00:00Z"})
        resp = _patch(auth_client, item["id"], {"deprecate_time": None})
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        assert resp.json()["deprecate_time"] is None

    def test_status_is_read_only(self, auth_client):
        item = create_item(auth_client, name="S")
        # Writing status directly is ignored (derived from deprecate_time).
        resp = _patch(auth_client, item["id"], {"status": "deprecated"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_item_has_no_model_serial_cost_fields(self, auth_client):
        item = create_item(auth_client, name="F")
        for gone in ("model", "serial_number", "cost", "cost_currency", "price"):
            assert gone not in item

    def test_items_default_sorted_by_acquisition_obtained_at_desc(self, auth_client):
        auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps(
                {
                    "source": "old",
                    "obtained_at": "2020-01-01T00:00:00Z",
                    "items": [{"name": "OldItem"}],
                }
            ),
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps(
                {
                    "source": "new",
                    "obtained_at": "2026-01-01T00:00:00Z",
                    "items": [{"name": "NewItem"}],
                }
            ),
            content_type="application/json",
        )
        names = [r["name"] for r in auth_client.get(ITEMS).json()["results"]]
        assert names.index("NewItem") < names.index("OldItem")

    def test_create_item_missing_name_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps({"source": "x", "items": [{"item_type": "stockable"}]}),
            content_type="application/json",
        )
        assert resp.status_code == 400
