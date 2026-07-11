"""Integration tests for acquisition-first item creation (US2)."""

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
                "method": "purchase",
                "obtained_at": "2026-01-04T00:00:00Z",
                "items": [
                    {"name": "Camera", "cost": "2200", "cost_currency": "USD"},
                    {"name": "Lens", "cost": "1100", "cost_currency": "USD"},
                ],
            },
        )
        assert resp.status_code == 201, resp.content
        body = resp.json()
        assert body["item_count"] == 2
        assert {i["name"] for i in body["items"]} == {"Camera", "Lens"}

    def test_create_acquisition_item_missing_name_rolls_back(self, auth_client):
        before = auth_client.get(ACQ).json()["count"]
        resp = _post(
            auth_client,
            ACQ,
            {"source": "X", "items": [{"name": "Ok"}, {"item_type": "stockable"}]},
        )
        assert resp.status_code == 400
        after = auth_client.get(ACQ).json()["count"]
        assert after == before  # transactional: nothing created

    def test_item_requires_acquisition_no_direct_post(self, auth_client):
        resp = _post(auth_client, ITEMS, {"name": "Orphan", "item_type": "stockable"})
        assert resp.status_code == 405  # POST not allowed on items

    def test_delete_acquisition_cascades_items(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "Shop", "items": [{"name": "Thing"}]}).json()
        item_id = acq["items"][0]["id"]
        auth_client.delete(f"{ACQ}{acq['id']}/")
        assert auth_client.get(f"{ITEMS}{item_id}/").status_code == 404

    def test_acquisition_total_cost_grouped_by_currency(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Trip",
                "items": [
                    {"name": "A", "cost": "100", "cost_currency": "USD"},
                    {"name": "B", "cost": "50", "cost_currency": "USD"},
                    {"name": "C", "cost": "30", "cost_currency": "EUR"},
                ],
            },
        ).json()
        totals = {row["currency"]: row["total"] for row in acq["total_item_cost"]}
        assert totals["USD"] == "150.0000"
        assert totals["EUR"] == "30.0000"

    def test_blank_method_acquisition_reads_unknown_origin(self, auth_client):
        acq = _post(auth_client, ACQ, {"items": [{"name": "Heirloom"}]}).json()
        assert acq["method"] == ""
        item = auth_client.get(f"{ITEMS}{acq['items'][0]['id']}/").json()
        assert item["acquisition"]["method"] == ""

    def test_append_item_via_patch(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "S", "items": [{"name": "One"}]}).json()
        auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps({"items": [{"name": "Two"}]}),
            content_type="application/json",
        )
        assert auth_client.get(f"{ACQ}{acq['id']}/").json()["item_count"] == 2
