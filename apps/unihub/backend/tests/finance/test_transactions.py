"""
Tests for the Transaction API with nested Transfers.
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


@pytest.fixture
def portfolio(auth_client, usd):
    resp = auth_client.post(
        "/api/v1/finance/portfolios/",
        {"name": "Test Portfolio", "base_currency": "USD"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
def asset(auth_client):
    resp = auth_client.post(
        "/api/v1/finance/assets/",
        {"name": "Apple Inc.", "category": "Stock"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
def asset2(auth_client):
    resp = auth_client.post(
        "/api/v1/finance/assets/",
        {"name": "USD Cash"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.django_db
class TestTransactions:
    def test_create_transaction_with_transfers(self, auth_client, portfolio, asset, asset2):
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T14:20:00Z",
                "description": "Buy AAPL",
                "transfers": [
                    {
                        "asset": asset["id"],
                        "asset_change_amount": "10.00000000",
                        "value_change": "-1520.00000000",
                    },
                    {
                        "asset": asset2["id"],
                        "asset_change_amount": "-1520.00000000",
                    },
                ],
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["id"]) == 12
        assert data["portfolio"] == portfolio["id"]
        assert data["portfolio_name"] == portfolio["name"]
        assert data["description"] == "Buy AAPL"
        assert len(data["transfers"]) == 2

    def test_create_transaction_transfer_has_asset_name(self, auth_client, portfolio, asset):
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "5.0"},
                ],
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        transfer = resp.json()["transfers"][0]
        assert transfer["asset_name"] == asset["name"]

    def test_create_transaction_requires_transfers(self, auth_client, portfolio):
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [],
            },
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_create_transaction_requires_portfolio(self, auth_client, asset):
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
            },
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_create_transaction_against_closed_portfolio_returns_400(
        self, auth_client, portfolio, asset
    ):
        auth_client.patch(
            f"/api/v1/finance/portfolios/{portfolio['id']}/",
            {"state": "closed"},
            content_type="application/json",
        )
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
            },
            content_type="application/json",
        )
        assert resp.status_code == 400
        assert "portfolio" in resp.json()

    def test_list_transactions_includes_transfers(self, auth_client, portfolio, asset):
        auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
            },
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/transactions/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] >= 1
        assert "transfers" in data["results"][0]

    def test_update_transaction_replaces_transfers(self, auth_client, portfolio, asset, asset2):
        txn = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "5.0"},
                    {"asset": asset2["id"], "asset_change_amount": "-100.0"},
                ],
            },
            content_type="application/json",
        ).json()

        # Full-replace: send only one transfer
        resp = auth_client.patch(
            f"/api/v1/finance/transactions/{txn['id']}/",
            {
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "10.0"},
                ]
            },
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert len(resp.json()["transfers"]) == 1
        assert resp.json()["transfers"][0]["asset_change_amount"] == "10.00000000"

    def test_delete_transaction_cascades_transfers(self, auth_client, portfolio, asset):
        from finance.models import Transfer

        txn = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
            },
            content_type="application/json",
        ).json()

        transfer_count_before = Transfer.objects.filter(transaction_id=txn["id"]).count()
        assert transfer_count_before == 1

        resp = auth_client.delete(f"/api/v1/finance/transactions/{txn['id']}/")
        assert resp.status_code == 204

        transfer_count_after = Transfer.objects.filter(transaction_id=txn["id"]).count()
        assert transfer_count_after == 0

    def test_transaction_updates_portfolio_timestamps(self, auth_client, portfolio, asset):
        from finance.models import Portfolio

        auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-01-15T09:30:00Z",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
            },
            content_type="application/json",
        )

        p = Portfolio.objects.get(pk=portfolio["id"])
        assert p.last_transaction_time is not None
        assert p.first_transaction_time is not None

    def test_delete_transaction_clears_portfolio_timestamps_when_last(
        self, auth_client, portfolio, asset
    ):
        from finance.models import Portfolio

        txn = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
            },
            content_type="application/json",
        ).json()

        auth_client.delete(f"/api/v1/finance/transactions/{txn['id']}/")

        p = Portfolio.objects.get(pk=portfolio["id"])
        assert p.last_transaction_time is None
        assert p.first_transaction_time is None

    def test_transfer_value_change_optional(self, auth_client, portfolio, asset):
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "5.0"},
                ],
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        transfer = resp.json()["transfers"][0]
        assert transfer["value_change"] is None

    def test_transaction_atomic_rollback_on_bad_transfer(self, auth_client, portfolio):
        from finance.models import Transaction

        count_before = Transaction.objects.count()
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": "nonexistent0", "asset_change_amount": "5.0"},
                ],
            },
            content_type="application/json",
        )
        assert resp.status_code == 400
        # Transaction row should not have been created
        assert Transaction.objects.count() == count_before
