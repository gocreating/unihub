"""
Tests for the Asset API.
Tests require a real database — no mocks for DB layer.

Iteration 3: `category` is removed from the Asset entity (FR-002); the
`filters` query param must work through the current core contract (FR-016);
quick search opts in (FR-017).
"""

import json

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


def filters_param(attr, op, val):
    return json.dumps({"groups": [{"logic": "and", "conditions": [{"attr": attr, "op": op, "val": val}]}]})


@pytest.mark.django_db
class TestAssets:
    def test_create_asset(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "Apple Inc."},
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Apple Inc."
        assert len(data["id"]) == 12
        assert "created_at" in data
        assert "updated_at" in data

    def test_asset_has_no_category_field(self, auth_client):
        """FR-002 (amended 2026-08-13): the category attribute is removed."""
        resp = auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "Bitcoin", "category": "Crypto"},  # unknown field is ignored
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert "category" not in resp.json()

        listed = auth_client.get("/api/v1/finance/assets/").json()["results"]
        assert all("category" not in a for a in listed)

    def test_create_asset_requires_name(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/assets/",
            {},
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_list_assets(self, auth_client):
        auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "AAPL"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/assets/",
            {"name": "BTC"},
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
            {"name": "Old Name"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/assets/{asset['id']}/",
            {"name": "New Name"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

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


@pytest.mark.django_db
class TestAssetFilters:
    """FR-016 regression: the `filters` param previously 500ed because the
    viewset declared operators (`icontains`) in `lookup`, which the current
    core contract reads as an ORM field path."""

    def test_filter_by_name_contains(self, auth_client):
        for name in ("Tesla", "Testla Motors", "Bitcoin"):
            auth_client.post(
                "/api/v1/finance/assets/", {"name": name}, content_type="application/json"
            )
        resp = auth_client.get(
            "/api/v1/finance/assets/", {"filters": filters_param("name", "contains", "tes")}
        )
        assert resp.status_code == 200
        names = {a["name"] for a in resp.json()["results"]}
        assert names == {"Tesla", "Testla Motors"}

    def test_filter_by_name_eq(self, auth_client):
        auth_client.post("/api/v1/finance/assets/", {"name": "ETH"}, content_type="application/json")
        auth_client.post("/api/v1/finance/assets/", {"name": "WETH"}, content_type="application/json")
        resp = auth_client.get(
            "/api/v1/finance/assets/", {"filters": filters_param("name", "eq", "ETH")}
        )
        assert resp.status_code == 200
        assert [a["name"] for a in resp.json()["results"]] == ["ETH"]


@pytest.mark.django_db
class TestAssetSearch:
    """FR-017: quick-search opt-in (019 contract)."""

    def test_search_narrows_by_name(self, auth_client):
        for name in ("stETH", "wstETH", "USDC"):
            auth_client.post(
                "/api/v1/finance/assets/", {"name": name}, content_type="application/json"
            )
        resp = auth_client.get("/api/v1/finance/assets/", {"search": "steth"})
        assert resp.status_code == 200
        assert {a["name"] for a in resp.json()["results"]} == {"stETH", "wstETH"}

    def test_blank_search_is_noop(self, auth_client):
        auth_client.post("/api/v1/finance/assets/", {"name": "AAPL"}, content_type="application/json")
        resp = auth_client.get("/api/v1/finance/assets/", {"search": "  "})
        assert resp.status_code == 200
        assert resp.json()["count"] >= 1
