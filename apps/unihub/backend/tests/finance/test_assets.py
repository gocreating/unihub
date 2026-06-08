"""
Failing tests for the Asset API (written before implementation — TDD).
Tests require a real database — no mocks for DB layer.
"""

import pytest
from django.contrib.auth.models import User
from django.test import Client


@pytest.fixture
def client():
    return Client()


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(username="testuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.mark.django_db
class TestAssets:
    def test_create_asset(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "Apple Inc.", "category": "Stock"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Apple Inc."
        assert data["category"] == "Stock"
        assert len(data["id"]) == 12
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_asset_category_defaults_to_empty(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "Bitcoin"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.json()["category"] == ""

    def test_create_asset_requires_name(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/assets/",
            {"category": "Stock"},
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_list_assets(self, auth_client):
        auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "AAPL", "category": "Stock"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "BTC", "category": "Crypto"},
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/assets/")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "results" in data
        assert data["count"] >= 2

    def test_update_asset(self, auth_client):
        asset = auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "Old Name", "category": "Stock"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/assets/{asset['id']}/",
            {"name": "New Name"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"
        assert resp.json()["category"] == "Stock"

    def test_delete_asset(self, auth_client):
        asset = auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "To Delete"},
            content_type="application/json",
        ).json()
        resp = auth_client.delete(f"/api/v1/finance/assets/{asset['id']}/")
        assert resp.status_code == 204

    def test_delete_asset_referenced_by_transfer_returns_409(self, auth_client):
        """Asset referenced by a Transfer cannot be deleted — returns 409."""
        from finance.models import Asset, Portfolio, Transaction, Transfer

        # Create an asset via API
        asset_resp = auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "Protected Asset"},
            content_type="application/json",
        )
        assert asset_resp.status_code == 201
        asset_id = asset_resp.json()["id"]

        asset = Asset.objects.get(pk=asset_id)
        portfolio = Portfolio.objects.create(name="Test Portfolio", base_currency="USD")
        txn = Transaction.objects.create(portfolio=portfolio, timestamp="2026-01-01T00:00:00Z")
        Transfer.objects.create(
            transaction=txn,
            asset=asset,
            asset_change_amount="10.00000000",
        )

        # Now try to delete via API — should get 409
        resp = auth_client.delete(f"/api/v1/finance/assets/{asset_id}/")
        assert resp.status_code == 409
        assert "detail" in resp.json()

    def test_list_assets_sorted_by_name(self, auth_client):
        auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "Zebra Asset"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "Alpha Asset"},
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/assets/")
        assert resp.status_code == 200
        names = [a["name"] for a in resp.json()["results"]]
        assert names.index("Alpha Asset") < names.index("Zebra Asset")
