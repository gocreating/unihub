"""
Tests for the Portfolio API.
Tests require a real database — no mocks for DB layer.
"""

import pytest
from django.contrib.auth.models import User
from django.test import Client


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(username="testuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.fixture
def usd(auth_client):
    resp = auth_client.post(
        "/api/v1/finance/currencies/",
        {"code": "USD", "name": "US Dollar", "symbol": "$"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.django_db
class TestPortfolios:
    def test_create_portfolio(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Tech Holdings", "base_currency": "USD"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Tech Holdings"
        assert data["base_currency"] == "USD"
        assert data["state"] == "active"
        assert len(data["id"]) == 12
        assert data["first_transaction_time"] is None
        assert data["last_transaction_time"] is None

    def test_create_portfolio_requires_name(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"base_currency": "USD"},
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_create_portfolio_requires_valid_currency(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "My Portfolio", "base_currency": "XYZ"},
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_create_portfolio_requires_base_currency(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "My Portfolio"},
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_list_portfolios(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Portfolio A", "base_currency": "USD"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Portfolio B", "base_currency": "USD"},
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/portfolios/")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "results" in data
        assert data["count"] >= 2

    def test_update_portfolio_name(self, auth_client, usd):
        portfolio = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Old Name", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{portfolio['id']}/",
            {"name": "New Name"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_update_portfolio_base_currency_is_ignored(self, auth_client, usd):
        """base_currency is read-only on update; any sent value is ignored."""
        from finance.models import Currency

        Currency.objects.create(code="EUR", name="Euro", symbol="€")
        portfolio = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "My Portfolio", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{portfolio['id']}/",
            {"base_currency": "EUR"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["base_currency"] == "USD"

    def test_toggle_portfolio_state_to_closed(self, auth_client, usd):
        portfolio = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "My Portfolio", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{portfolio['id']}/",
            {"state": "closed"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["state"] == "closed"

    def test_toggle_portfolio_state_back_to_active(self, auth_client, usd):
        portfolio = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "My Portfolio", "base_currency": "USD", "state": "closed"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{portfolio['id']}/",
            {"state": "active"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["state"] == "active"

    def test_delete_portfolio_without_transactions(self, auth_client, usd):
        portfolio = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Empty Portfolio", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        resp = auth_client.delete(f"/api/v1/finance/portfolios/{portfolio['id']}/")
        assert resp.status_code == 204

    def test_delete_portfolio_with_transactions_returns_409(self, auth_client, usd):
        """Portfolio with transactions cannot be deleted — returns 409."""
        from finance.models import Asset, Portfolio, Transaction, Transfer

        portfolio_resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Has Transactions", "base_currency": "USD"},
            content_type="application/json",
        )
        assert portfolio_resp.status_code == 201
        portfolio_id = portfolio_resp.json()["id"]

        portfolio = Portfolio.objects.get(pk=portfolio_id)
        asset = Asset.objects.create(name="Test Asset")
        txn = Transaction.objects.create(portfolio=portfolio, timestamp="2026-01-01T00:00:00Z")
        Transfer.objects.create(transaction=txn, asset=asset, asset_change_amount="1")

        resp = auth_client.delete(f"/api/v1/finance/portfolios/{portfolio_id}/")
        assert resp.status_code == 409
        assert "detail" in resp.json()

    def test_portfolio_transaction_times_updated_by_signal(self, auth_client, usd):
        """first/last_transaction_time are auto-updated when transactions are added."""
        from finance.models import Asset, Portfolio, Transaction, Transfer

        portfolio_resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Signal Test", "base_currency": "USD"},
            content_type="application/json",
        )
        portfolio_id = portfolio_resp.json()["id"]

        portfolio = Portfolio.objects.get(pk=portfolio_id)
        asset = Asset.objects.create(name="Test Asset")
        Transaction.objects.create(portfolio=portfolio, timestamp="2024-01-15T09:30:00Z")
        txn2 = Transaction.objects.create(portfolio=portfolio, timestamp="2026-06-01T14:20:00Z")
        # Need at least one transfer for transactions
        Transfer.objects.create(transaction=txn2, asset=asset, asset_change_amount="1")

        # Refresh from DB
        portfolio.refresh_from_db()
        assert portfolio.first_transaction_time is not None
        assert portfolio.last_transaction_time is not None

    def test_portfolio_list_sorted_by_last_transaction_time_desc(self, auth_client, usd):
        """Portfolios with recent transactions appear first; nulls last."""
        from finance.models import Asset, Portfolio, Transaction, Transfer

        p1_resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Active Portfolio", "base_currency": "USD"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Empty Portfolio", "base_currency": "USD"},
            content_type="application/json",
        )
        p1_id = p1_resp.json()["id"]

        portfolio = Portfolio.objects.get(pk=p1_id)
        asset = Asset.objects.create(name="Test Asset")
        txn = Transaction.objects.create(portfolio=portfolio, timestamp="2026-06-01T00:00:00Z")
        Transfer.objects.create(transaction=txn, asset=asset, asset_change_amount="1")

        resp = auth_client.get("/api/v1/finance/portfolios/")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()["results"]]
        assert names.index("Active Portfolio") < names.index("Empty Portfolio")


def filters_param(attr, op, val):
    import json

    return json.dumps(
        {"groups": [{"logic": "and", "conditions": [{"attr": attr, "op": op, "val": val}]}]}
    )


@pytest.mark.django_db
class TestPortfolioDescription:
    """FR-008e: optional description, writable on create and update."""

    def test_description_round_trip_on_create(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {
                "name": "[Active] 永豐 DCA TW.0050",
                "base_currency": "USD",
                "description": "每月 06, 16, 26 日 6600 元",
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.json()["description"] == "每月 06, 16, 26 日 6600 元"

    def test_description_defaults_blank_and_updates(self, auth_client, usd):
        p = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "P", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        assert p["description"] == ""
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{p['id']}/",
            {"description": "updated note"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["description"] == "updated note"


@pytest.mark.django_db
class TestPortfolioFilters:
    """FR-016 regression: filters previously 500ed (operator-shaped lookups)."""

    def test_filter_by_state_eq(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Open One", "base_currency": "USD"},
            content_type="application/json",
        )
        closed = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Closed One", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        auth_client.patch(
            f"/api/v1/finance/portfolios/{closed['id']}/",
            {"state": "closed"},
            content_type="application/json",
        )
        resp = auth_client.get(
            "/api/v1/finance/portfolios/", {"filters": filters_param("state", "eq", "closed")}
        )
        assert resp.status_code == 200
        assert [p["name"] for p in resp.json()["results"]] == ["Closed One"]

    def test_filter_by_name_contains(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Bybit Launchpool MOCA", "base_currency": "USD"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Compound USDC", "base_currency": "USD"},
            content_type="application/json",
        )
        resp = auth_client.get(
            "/api/v1/finance/portfolios/", {"filters": filters_param("name", "contains", "launchpool")}
        )
        assert resp.status_code == 200
        assert resp.json()["count"] == 1


@pytest.mark.django_db
class TestPortfolioSearch:
    """FR-017: quick search over name/description/base_currency/state."""

    def test_search_matches_name_and_description(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Morpho Earn", "base_currency": "USD", "description": "vault strategy"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "DCA 0050", "base_currency": "USD"},
            content_type="application/json",
        )
        assert (
            auth_client.get("/api/v1/finance/portfolios/", {"search": "morpho"}).json()["count"] == 1
        )
        assert (
            auth_client.get("/api/v1/finance/portfolios/", {"search": "vault strat"}).json()["count"]
            == 1
        )
