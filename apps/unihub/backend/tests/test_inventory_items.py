"""Integration tests for Inventory items — refined fields (US1)."""

import json

import pytest

from tests.conftest import create_item

ITEMS = "/api/v1/inventory/items/"
ACQ = "/api/v1/inventory/acquisitions/"


def _patch(client, item_id, body):
    return client.patch(f"{ITEMS}{item_id}/", json.dumps(body), content_type="application/json")


@pytest.mark.django_db
class TestItems:
    def test_item_measurement_roundtrip_units(self, auth_client):
        item = create_item(auth_client, name="Cam", weight={"value": "0.658", "unit": "kg"})
        fetched = auth_client.get(f"{ITEMS}{item['id']}/").json()
        assert fetched["weight"] == {"value": "0.658", "unit": "kg"}

    def test_sort_items_by_weight_across_units(self, auth_client):
        create_item(auth_client, name="Heavy", weight={"value": "2", "unit": "kg"})  # 2000 g
        create_item(auth_client, name="Light", weight={"value": "500", "unit": "g"})  # 500 g
        rows = auth_client.get(f"{ITEMS}?ordering=weight_canonical").json()["results"]
        names = [r["name"] for r in rows if r["name"] in ("Heavy", "Light")]
        assert names == ["Light", "Heavy"]  # 500 g sorts before 2000 g

    def test_item_price_cost_currency_persisted(self, auth_client):
        item = create_item(
            auth_client,
            name="Priced",
            price="10",
            price_currency="USD",
            cost="8",
            cost_currency="EUR",
        )
        fetched = auth_client.get(f"{ITEMS}{item['id']}/").json()
        assert fetched["price_currency"] == "USD"
        assert fetched["cost_currency"] == "EUR"

    def test_item_status_rejects_unknown_value(self, auth_client):
        item = create_item(auth_client, name="S")
        resp = _patch(auth_client, item["id"], {"status": "lost"})
        assert resp.status_code == 400

    def test_item_status_accepts_deprecated(self, auth_client):
        item = create_item(auth_client, name="S")
        resp = _patch(auth_client, item["id"], {"status": "deprecated"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "deprecated"

    def test_items_default_sorted_by_acquisition_obtained_at_desc(self, auth_client):
        auth_client.post(
            ACQ,
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
            ACQ,
            json.dumps(
                {
                    "source": "new",
                    "obtained_at": "2026-01-01T00:00:00Z",
                    "items": [{"name": "NewItem"}],
                }
            ),
            content_type="application/json",
        )
        rows = auth_client.get(ITEMS).json()["results"]
        names = [r["name"] for r in rows]
        assert names.index("NewItem") < names.index("OldItem")

    def test_archived_is_filterable_not_excluded_by_default(self, auth_client):
        item = create_item(auth_client, name="Retired")
        _patch(auth_client, item["id"], {"archived_at": "2026-01-01T00:00:00Z"})
        # Default view still includes archived items (no auto-exclusion).
        default_ids = [r["id"] for r in auth_client.get(ITEMS).json()["results"]]
        assert item["id"] in default_ids

    def test_create_item_missing_name_returns_400(self, auth_client):
        resp = auth_client.post(
            ACQ,
            json.dumps({"source": "x", "items": [{"item_type": "stockable"}]}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_delete_item_removes_it(self, auth_client):
        item = create_item(auth_client, name="Gone")
        assert auth_client.delete(f"{ITEMS}{item['id']}/").status_code == 204
