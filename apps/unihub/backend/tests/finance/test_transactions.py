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
        {"name": "Apple Inc."},
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
        from decimal import Decimal

        assert Decimal(resp.json()["transfers"][0]["asset_change_amount"]) == Decimal("10")

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


def filters_param(attr, op, val):
    import json

    return json.dumps(
        {"groups": [{"logic": "and", "conditions": [{"attr": attr, "op": op, "val": val}]}]}
    )


@pytest.fixture
def portfolio2(auth_client, usd):
    resp = auth_client.post(
        "/api/v1/finance/portfolios/",
        {"name": "Second Portfolio", "base_currency": "USD"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


def _make_txn(auth_client, portfolio, asset, description="", timestamp="2026-06-01T00:00:00Z", **extra):
    payload = {
        "portfolio": portfolio["id"],
        "timestamp": timestamp,
        "description": description,
        "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
        **extra,
    }
    resp = auth_client.post(
        "/api/v1/finance/transactions/", payload, content_type="application/json"
    )
    assert resp.status_code == 201, resp.content
    return resp.json()


@pytest.mark.django_db
class TestTransactionFilters:
    """FR-016 regression: the portfolio detail page filters transactions by
    portfolio through the `filters` param; the old operator-shaped `lookup`
    declarations made EntityFilterBackend build Q(exact=...) → FieldError → 500.
    """

    def test_filter_by_portfolio_eq_returns_only_that_portfolio(
        self, auth_client, portfolio, portfolio2, asset
    ):
        _make_txn(auth_client, portfolio, asset, description="mine")
        _make_txn(auth_client, portfolio2, asset, description="other")
        resp = auth_client.get(
            "/api/v1/finance/transactions/",
            {"filters": filters_param("portfolio", "eq", portfolio["id"])},
        )
        assert resp.status_code == 200
        results = resp.json()["results"]
        assert len(results) == 1
        assert results[0]["portfolio"] == portfolio["id"]

    def test_filter_by_description_contains(self, auth_client, portfolio, asset):
        _make_txn(auth_client, portfolio, asset, description="Buy AAPL shares")
        _make_txn(auth_client, portfolio, asset, description="Sell BTC")
        resp = auth_client.get(
            "/api/v1/finance/transactions/",
            {"filters": filters_param("description", "contains", "aapl")},
        )
        assert resp.status_code == 200
        assert [t["description"] for t in resp.json()["results"]] == ["Buy AAPL shares"]

    def test_filter_by_timestamp_date_after(self, auth_client, portfolio, asset):
        _make_txn(auth_client, portfolio, asset, timestamp="2026-01-01T00:00:00Z")
        _make_txn(auth_client, portfolio, asset, timestamp="2026-07-01T00:00:00Z")
        resp = auth_client.get(
            "/api/v1/finance/transactions/",
            {"filters": filters_param("timestamp", "date_after", "2026-03-01T00:00:00Z")},
        )
        assert resp.status_code == 200
        assert resp.json()["count"] == 1


@pytest.mark.django_db
class TestTransactionNewFields:
    """FR-008c–e: chain_id/tx_hash on Transaction, remark on Transfer, 18dp precision."""

    def test_chain_id_and_tx_hash_round_trip(self, auth_client, portfolio, asset):
        txn = _make_txn(
            auth_client,
            portfolio,
            asset,
            chain_id="1",
            tx_hash="0xabc123def4567890abc123def4567890abc123de",
        )
        assert txn["chain_id"] == "1"
        assert txn["tx_hash"] == "0xabc123def4567890abc123def4567890abc123de"

        fetched = auth_client.get(f"/api/v1/finance/transactions/{txn['id']}/").json()
        assert fetched["chain_id"] == "1"
        assert fetched["tx_hash"] == "0xabc123def4567890abc123def4567890abc123de"

    def test_chain_id_and_tx_hash_default_blank(self, auth_client, portfolio, asset):
        txn = _make_txn(auth_client, portfolio, asset)
        assert txn["chain_id"] == ""
        assert txn["tx_hash"] == ""

    def test_transfer_remark_round_trip(self, auth_client, portfolio, asset):
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "-1", "remark": "手續費"},
                    {"asset": asset["id"], "asset_change_amount": "5.0"},
                ],
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        remarks = sorted(t["remark"] for t in resp.json()["transfers"])
        assert remarks == ["", "手續費"]

    def test_18_decimal_precision_survives_round_trip(self, auth_client, portfolio, asset):
        """Wei-level legacy amounts (FR-008c) — 8dp storage would corrupt these."""
        from decimal import Decimal

        wei_amount = "-0.000000067305900768"
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {
                        "asset": asset["id"],
                        "asset_change_amount": wei_amount,
                        "value_change": "0.000000000000000001",
                    }
                ],
            },
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        txn_id = resp.json()["id"]
        transfer = auth_client.get(f"/api/v1/finance/transactions/{txn_id}/").json()["transfers"][0]
        assert Decimal(transfer["asset_change_amount"]) == Decimal(wei_amount)
        assert Decimal(transfer["value_change"]) == Decimal("1E-18")


@pytest.mark.django_db
class TestTransactionSearch:
    """FR-017: quick search on transactions (description, remark, asset name)."""

    def test_search_matches_description(self, auth_client, portfolio, asset):
        _make_txn(auth_client, portfolio, asset, description="monthly interest")
        _make_txn(auth_client, portfolio, asset, description="rebalance")
        resp = auth_client.get("/api/v1/finance/transactions/", {"search": "interest"})
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_search_matches_transfer_remark_and_asset_name(self, auth_client, portfolio, asset):
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "-1", "remark": "broker fee"}
                ],
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert auth_client.get(
            "/api/v1/finance/transactions/", {"search": "broker fee"}
        ).json()["count"] == 1
        # Asset name reaches search through the transfers relation
        assert auth_client.get(
            "/api/v1/finance/transactions/", {"search": "apple inc"}
        ).json()["count"] == 1

    def test_search_multivalued_join_does_not_duplicate_rows(self, auth_client, portfolio, asset):
        """One transaction with TWO transfers on the same asset must appear once."""
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "1"},
                    {"asset": asset["id"], "asset_change_amount": "2"},
                ],
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = auth_client.get("/api/v1/finance/transactions/", {"search": "apple"}).json()
        assert data["count"] == 1
        assert len(data["results"]) == 1


@pytest.mark.django_db
class TestClosedPortfolioFreezesTransactions:
    """FR-026: while closed, a portfolio's transactions cannot change at all."""

    @pytest.fixture
    def closed_with_txn(self, auth_client, portfolio, asset):
        txn = _make_txn(auth_client, portfolio, asset, description="before close")
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{portfolio['id']}/",
            {"state": "closed"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        return txn

    def test_creating_a_transaction_is_rejected(self, auth_client, portfolio, asset, closed_with_txn):
        resp = auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": portfolio["id"],
                "timestamp": "2026-06-02T00:00:00Z",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "1"}],
            },
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_editing_a_transaction_is_rejected(self, auth_client, closed_with_txn, asset):
        # A COMPLETE, otherwise-valid payload — so a 400 is attributable to the
        # freeze and not to ordinary validation (a description-only PATCH is
        # rejected regardless of state, which would pass this test falsely).
        resp = auth_client.patch(
            f"/api/v1/finance/transactions/{closed_with_txn['id']}/",
            {
                "description": "edited while closed",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
            },
            content_type="application/json",
        )
        assert resp.status_code == 400
        from finance.models import Transaction

        assert Transaction.objects.get(pk=closed_with_txn["id"]).description == "before close"

    def test_deleting_a_transaction_is_rejected(self, auth_client, closed_with_txn):
        resp = auth_client.delete(f"/api/v1/finance/transactions/{closed_with_txn['id']}/")
        assert resp.status_code == 400
        from finance.models import Transaction

        assert Transaction.objects.filter(pk=closed_with_txn["id"]).exists()

    def test_everything_works_again_after_reopening(self, auth_client, portfolio, closed_with_txn, asset):
        reopen = auth_client.patch(
            f"/api/v1/finance/portfolios/{portfolio['id']}/",
            {"state": "active"},
            content_type="application/json",
        )
        assert reopen.status_code == 200
        resp = auth_client.patch(
            f"/api/v1/finance/transactions/{closed_with_txn['id']}/",
            {
                "description": "edited after reopen",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
            },
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["description"] == "edited after reopen"

    def test_an_active_portfolios_transactions_are_unaffected(self, auth_client, portfolio, asset):
        txn = _make_txn(auth_client, portfolio, asset)
        assert (
            auth_client.patch(
                f"/api/v1/finance/transactions/{txn['id']}/",
                {
                    "description": "fine",
                    "transfers": [{"asset": asset["id"], "asset_change_amount": "5.0"}],
                },
                content_type="application/json",
            ).status_code
            == 200
        )
        assert auth_client.delete(f"/api/v1/finance/transactions/{txn['id']}/").status_code == 204
