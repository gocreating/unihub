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

    def test_acquisition_cost_discount_tax_refund_net_cost(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Shop",
                "cost": "3300",
                "cost_currency": "USD",
                "discount": "100",
                "tax_refund": "0",
                "items": [{"name": "Thing"}],
            },
        ).json()
        assert acq["net_cost"] == "3200.0000"

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
