"""Integration tests for Inventory items (US1)."""

import pytest

BASE = "/api/v1/inventory/items/"


def _create_item(client, **overrides):
    payload = {"name": "Backpack", "item_type": "stockable"}
    payload.update(overrides)
    return client.post(BASE, payload, content_type="application/json")


@pytest.mark.django_db
class TestItems:
    def test_create_item_missing_name_returns_400(self, auth_client):
        resp = auth_client.post(BASE, {"item_type": "stockable"}, content_type="application/json")
        assert resp.status_code == 400

    def test_create_item_negative_weight_returns_400(self, auth_client):
        resp = _create_item(auth_client, weight="-1")
        assert resp.status_code == 400

    def test_create_item_defaults_stockable(self, auth_client):
        resp = auth_client.post(BASE, {"name": "Torch"}, content_type="application/json")
        assert resp.status_code == 201
        assert resp.json()["item_type"] == "stockable"

    def test_update_item_quantity(self, auth_client):
        item = _create_item(auth_client, item_type="consumable", quantity="4").json()
        resp = auth_client.patch(
            f"{BASE}{item['id']}/", {"quantity": "2"}, content_type="application/json"
        )
        assert resp.status_code == 200
        assert resp.json()["quantity"] == "2.0000"

    def test_list_items_excludes_archived(self, auth_client):
        active = _create_item(auth_client, name="Active").json()
        archived = _create_item(auth_client, name="Old").json()
        auth_client.patch(
            f"{BASE}{archived['id']}/",
            {"archived_at": "2026-01-01T00:00:00Z"},
            content_type="application/json",
        )
        resp = auth_client.get(BASE)
        ids = [row["id"] for row in resp.json()["results"]]
        assert active["id"] in ids
        assert archived["id"] not in ids

    def test_archive_item_sets_archived_at(self, auth_client):
        item = _create_item(auth_client).json()
        resp = auth_client.patch(
            f"{BASE}{item['id']}/",
            {"archived_at": "2026-01-01T00:00:00Z"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["archived_at"] is not None

    def test_list_archived_filter_returns_archived(self, auth_client):
        item = _create_item(auth_client, name="Old").json()
        auth_client.patch(
            f"{BASE}{item['id']}/",
            {"archived_at": "2026-01-01T00:00:00Z"},
            content_type="application/json",
        )
        resp = auth_client.get(f"{BASE}?archived=true")
        ids = [row["id"] for row in resp.json()["results"]]
        assert item["id"] in ids

    def test_delete_unreferenced_item_succeeds(self, auth_client):
        item = _create_item(auth_client).json()
        resp = auth_client.delete(f"{BASE}{item['id']}/")
        assert resp.status_code == 204
