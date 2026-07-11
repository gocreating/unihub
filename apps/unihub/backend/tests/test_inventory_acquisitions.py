"""Integration tests for Inventory acquisitions (US2)."""

import pytest

ITEMS = "/api/v1/inventory/items/"
ACQ = "/api/v1/inventory/acquisitions/"


def _item(client, name="Camera", cost=None):
    payload = {"name": name, "item_type": "stockable"}
    if cost is not None:
        payload["cost"] = cost
    return client.post(ITEMS, payload, content_type="application/json").json()


@pytest.mark.django_db
class TestAcquisitions:
    def test_create_acquisition_links_items(self, auth_client):
        a = _item(auth_client, "A", cost="100")
        b = _item(auth_client, "B", cost="50")
        resp = auth_client.post(
            ACQ,
            {"source": "B&H", "method": "purchase", "item_ids": [a["id"], b["id"]]},
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.json()["item_count"] == 2

    def test_acquisition_total_item_cost(self, auth_client):
        a = _item(auth_client, "A", cost="100")
        b = _item(auth_client, "B", cost="50")
        acq = auth_client.post(
            ACQ, {"item_ids": [a["id"], b["id"]]}, content_type="application/json"
        ).json()
        assert acq["total_item_cost"] == "150.0000"

    def test_acquisition_has_arrived_flag(self, auth_client):
        pending = auth_client.post(ACQ, {"source": "Shop"}, content_type="application/json").json()
        assert pending["has_arrived"] is False
        arrived = auth_client.post(
            ACQ,
            {"source": "Shop", "arrived_at": "2026-01-02T00:00:00Z"},
            content_type="application/json",
        ).json()
        assert arrived["has_arrived"] is True

    def test_delete_acquisition_preserves_items(self, auth_client):
        a = _item(auth_client, "A")
        acq = auth_client.post(ACQ, {"item_ids": [a["id"]]}, content_type="application/json").json()
        auth_client.delete(f"{ACQ}{acq['id']}/")
        resp = auth_client.get(f"{ITEMS}{a['id']}/")
        assert resp.status_code == 200
        assert resp.json()["origin_known"] is False

    def test_remove_item_link_preserves_item(self, auth_client):
        a = _item(auth_client, "A")
        acq = auth_client.post(ACQ, {"item_ids": [a["id"]]}, content_type="application/json").json()
        auth_client.patch(f"{ACQ}{acq['id']}/", {"item_ids": []}, content_type="application/json")
        assert auth_client.get(f"{ITEMS}{a['id']}/").json()["origin_known"] is False

    def test_item_without_acquisition_origin_unknown(self, auth_client):
        a = _item(auth_client, "Lonely")
        assert auth_client.get(f"{ITEMS}{a['id']}/").json()["origin_known"] is False

    def test_optional_method_blank_allowed(self, auth_client):
        resp = auth_client.post(ACQ, {"source": "Grandma"}, content_type="application/json")
        assert resp.status_code == 201
        assert resp.json()["method"] == ""
