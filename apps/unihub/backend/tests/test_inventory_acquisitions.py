"""Integration tests for acquisition payment, items, and sources (US2)."""

import json

import pytest

ITEMS = "/api/v1/inventory/items/"
ACQ = "/api/v1/inventory/acquisitions/"


def _post(client, url, body):
    return client.post(url, json.dumps(body), content_type="application/json")


@pytest.mark.django_db
class TestAcquisitions:
    def test_create_acquisition_with_multiple_items_atomic(self, auth_client):
        resp = _post(
            auth_client,
            ACQ,
            {
                "source": "B&H",
                "obtained_at": "2026-01-04T00:00:00Z",
                "items": [{"name": "Camera"}, {"name": "Lens"}],
            },
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["item_count"] == 2

    def test_cost_factors_net_cost_grouped_by_currency(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Shop",
                "cost_factors": [
                    {"value": "3300", "currency": "USD", "type": "accumulated"},
                    {"value": "-100", "currency": "USD", "type": "discount"},
                    {"value": "50", "currency": "EUR", "type": "shipping"},
                ],
                "items": [{"name": "Thing"}],
            },
        ).json()
        net = {row["currency"]: row["total"] for row in acq["net_cost"]}
        assert net == {"USD": "3200.0000", "EUR": "50.0000"}

    def test_accumulated_factor_auto_derived_when_omitted(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Shop",
                "items": [
                    {"name": "A", "quantity": 2, "sku_price": "10", "sku_price_currency": "USD"},
                    {"name": "B", "quantity": 1, "sku_price": "5", "sku_price_currency": "USD"},
                ],
            },
        ).json()
        assert len(acq["cost_factors"]) == 1
        factor = acq["cost_factors"][0]
        assert factor["type"] == "accumulated"
        assert factor["currency"] == "USD"
        assert acq["net_cost"] == [{"currency": "USD", "total": "25.0000"}]

    def test_update_with_empty_cost_factors_rejected(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "S", "items": [{"name": "X"}]}).json()
        resp = auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps({"cost_factors": []}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_update_replaces_cost_factor_set(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "S", "items": [{"name": "X"}]}).json()
        resp = auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps({"cost_factors": [{"value": "9", "currency": "JPY", "type": "other"}]}),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        updated = resp.json()
        assert len(updated["cost_factors"]) == 1
        assert updated["net_cost"] == [{"currency": "JPY", "total": "9.0000"}]

    def test_acquisition_requires_at_least_one_item(self, auth_client):
        resp = _post(auth_client, ACQ, {"source": "Empty", "items": []})
        assert resp.status_code == 400
        resp2 = _post(auth_client, ACQ, {"source": "Empty2"})
        assert resp2.status_code == 400

    def test_acquisition_no_method_field(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "S", "items": [{"name": "X"}]}).json()
        assert "method" not in acq

    def test_acquisition_request_time_persisted(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {"source": "S", "request_time": "2026-01-01T00:00:00Z", "items": [{"name": "X"}]},
        ).json()
        assert acq["request_time"] == "2026-01-01T00:00:00Z"

    def test_delete_acquisition_cascades_items(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "Shop", "items": [{"name": "Thing"}]}).json()
        item_id = acq["items"][0]["id"]
        auth_client.delete(f"{ACQ}{acq['id']}/")
        assert auth_client.get(f"{ITEMS}{item_id}/").status_code == 404

    def test_item_requires_acquisition_no_direct_post(self, auth_client):
        resp = _post(auth_client, ITEMS, {"name": "Orphan"})
        assert resp.status_code == 405

    def test_item_edit_persists(self, auth_client):
        """FR-021a: editing an item's fields must persist."""
        acq = _post(
            auth_client, ACQ, {"source": "S", "items": [{"name": "Old", "quantity": 1}]}
        ).json()
        item_id = acq["items"][0]["id"]
        resp = auth_client.patch(
            f"{ITEMS}{item_id}/",
            json.dumps({"name": "New", "quantity": 5}),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        fetched = auth_client.get(f"{ITEMS}{item_id}/").json()
        assert fetched["name"] == "New"
        assert fetched["quantity"] == 5

    def test_sources_endpoint_returns_distinct_used_sources(self, auth_client):
        _post(auth_client, ACQ, {"source": "Amazon", "items": [{"name": "A"}]})
        _post(auth_client, ACQ, {"source": "Amazon", "items": [{"name": "B"}]})
        _post(auth_client, ACQ, {"source": "B&H", "items": [{"name": "C"}]})
        sources = auth_client.get(f"{ACQ}sources/").json()
        assert sorted(sources) == ["Amazon", "B&H"]  # distinct

    def test_sources_endpoint_filters_by_q(self, auth_client):
        _post(auth_client, ACQ, {"source": "Amazon", "items": [{"name": "A"}]})
        _post(auth_client, ACQ, {"source": "B&H", "items": [{"name": "C"}]})
        sources = auth_client.get(f"{ACQ}sources/?q=ama").json()
        assert sources == ["Amazon"]
