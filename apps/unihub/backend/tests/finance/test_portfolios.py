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


@pytest.mark.django_db
class TestClosedPortfolioIsFrozen:
    """FR-026: a closed portfolio rejects every mutation except reopening."""

    @pytest.fixture
    def closed_portfolio(self, auth_client, usd):
        p = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Frozen", "base_currency": "USD", "description": "before"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{p['id']}/",
            {"state": "closed"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        return p

    def test_editing_a_closed_portfolio_is_rejected(self, auth_client, closed_portfolio):
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{closed_portfolio['id']}/",
            {"name": "renamed"},
            content_type="application/json",
        )
        assert resp.status_code == 400
        from finance.models import Portfolio

        assert Portfolio.objects.get(pk=closed_portfolio["id"]).name == "Frozen"

    def test_editing_the_description_of_a_closed_portfolio_is_rejected(
        self, auth_client, closed_portfolio
    ):
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{closed_portfolio['id']}/",
            {"description": "after"},
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_reopening_a_closed_portfolio_SUCCEEDS(self, auth_client, closed_portfolio):
        """The case a naive 'reject all writes when closed' validator bricks."""
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{closed_portfolio['id']}/",
            {"state": "active"},
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["state"] == "active"

    def test_deleting_a_closed_portfolio_is_still_allowed(self, auth_client, closed_portfolio):
        resp = auth_client.delete(f"/api/v1/finance/portfolios/{closed_portfolio['id']}/")
        assert resp.status_code == 204

    def test_an_active_portfolio_is_unaffected(self, auth_client, usd):
        p = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Open", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/portfolios/{p['id']}/",
            {"name": "renamed"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "renamed"


@pytest.mark.django_db
class TestPortfolioDescriptionIsMultiline:
    """FR-025: description is an unbounded TextField edited as a text area."""

    def test_multiline_description_round_trips(self, auth_client, usd):
        text = "line one\nline two\n\nline four with a much longer tail " + ("x" * 800)
        resp = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Multi", "base_currency": "USD", "description": text},
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["description"] == text


@pytest.mark.django_db
class TestPortfolioValueAggregates:
    """FR-031/SC-015: sums come from the BACKEND over ALL transfers.

    The transactions panel paginates at 25, so these fixtures deliberately
    exceed one page — a frontend-side sum would report roughly half.
    """

    @pytest.fixture
    def asset(self, auth_client):
        return auth_client.post(
            "/api/v1/finance/assets/", {"name": "AAPL"}, content_type="application/json"
        ).json()

    @pytest.fixture
    def funded(self, auth_client, usd, asset):
        p = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Aggregates", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        # 30 buys of -100 and 2 sales of +250 → invested -3000, returned +500.
        for i in range(30):
            auth_client.post(
                "/api/v1/finance/transactions/",
                {
                    "portfolio": p["id"],
                    "timestamp": f"2026-06-{(i % 28) + 1:02d}T00:00:00Z",
                    "transfers": [
                        {"asset": asset["id"], "asset_change_amount": "1", "pnl_change": "-100"}
                    ],
                },
                content_type="application/json",
            )
        for i in range(2):
            auth_client.post(
                "/api/v1/finance/transactions/",
                {
                    "portfolio": p["id"],
                    "timestamp": f"2026-07-{i + 1:02d}T00:00:00Z",
                    "transfers": [
                        {"asset": asset["id"], "asset_change_amount": "-1", "pnl_change": "250"}
                    ],
                },
                content_type="application/json",
            )
        return p

    def _get(self, auth_client, pid):
        return auth_client.get(f"/api/v1/finance/portfolios/{pid}/").json()

    def test_aggregates_cover_every_transfer_not_just_one_page(
        self, auth_client, funded
    ):
        from decimal import Decimal

        data = self._get(auth_client, funded["id"])
        assert Decimal(data["value_invested"]) == Decimal("-3000")
        assert Decimal(data["value_returned"]) == Decimal("500")
        assert Decimal(data["net_value_change"]) == Decimal("-2500")

    def test_aggregates_match_a_direct_database_sum(self, auth_client, funded):
        from decimal import Decimal

        from django.db.models import Sum

        from finance.models import Transfer

        direct = Transfer.objects.filter(
            transaction__portfolio_id=funded["id"]
        ).aggregate(total=Sum("pnl_change"))["total"]
        data = self._get(auth_client, funded["id"])
        assert Decimal(data["net_value_change"]) == direct

    def test_a_portfolio_with_no_transfers_reports_null_not_zero(self, auth_client, usd):
        """"No data" and "nets to zero" are different facts."""
        p = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Empty", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        data = self._get(auth_client, p["id"])
        assert data["net_value_change"] is None
        assert data["value_invested"] is None
        assert data["value_returned"] is None

    def test_position_only_transfers_do_not_affect_the_aggregates(
        self, auth_client, usd, asset
    ):
        from decimal import Decimal

        p = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Split", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": p["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "100", "pnl_change": "-1000"}
                ],
            },
            content_type="application/json",
        )
        before = Decimal(self._get(auth_client, p["id"])["net_value_change"])
        # A 2:1 split — position only, no value (FR-035).
        auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": p["id"],
                "timestamp": "2026-06-02T00:00:00Z",
                "description": "2:1 split",
                "transfers": [{"asset": asset["id"], "asset_change_amount": "100"}],
            },
            content_type="application/json",
        )
        assert Decimal(self._get(auth_client, p["id"])["net_value_change"]) == before

    def test_list_can_order_by_net_value_change(self, auth_client, usd, funded, asset):
        """Ordering by the annotation works on portfolios that HAVE values."""
        winner = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Profitable", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": winner["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": asset["id"], "asset_change_amount": "1", "pnl_change": "900"}
                ],
            },
            content_type="application/json",
        )
        names = [
            p["name"]
            for p in auth_client.get(
                "/api/v1/finance/portfolios/?ordering=net_value_change"
            ).json()["results"]
        ]
        # Aggregates nets -2500, Profitable nets +900.
        assert names.index("Aggregates") < names.index("Profitable")

    def test_portfolios_without_values_can_be_pushed_last(self, auth_client, usd, funded):
        """Null placement uses the project's existing __nullslast convention."""
        auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "NoData", "base_currency": "USD"},
            content_type="application/json",
        )
        names = [
            p["name"]
            for p in auth_client.get(
                "/api/v1/finance/portfolios/?ordering=net_value_change__nullslast"
            ).json()["results"]
        ]
        assert names[-1] == "NoData"


@pytest.mark.django_db
class TestPortfolioHoldings:
    """FR-034: per-asset net quantity across ALL transfers."""

    @pytest.fixture
    def setup(self, auth_client, usd):
        a = auth_client.post(
            "/api/v1/finance/assets/", {"name": "AAPL"}, content_type="application/json"
        ).json()
        b = auth_client.post(
            "/api/v1/finance/assets/", {"name": "Cash"}, content_type="application/json"
        ).json()
        p = auth_client.post(
            "/api/v1/finance/portfolios/",
            {"name": "Holdings", "base_currency": "USD"},
            content_type="application/json",
        ).json()
        auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": p["id"],
                "timestamp": "2026-06-01T00:00:00Z",
                "transfers": [
                    {"asset": a["id"], "asset_change_amount": "100"},
                    {"asset": b["id"], "asset_change_amount": "50"},
                    {"asset": b["id"], "asset_change_amount": "-50"},
                ],
            },
            content_type="application/json",
        )
        return p, a, b

    def test_reports_net_quantity_per_asset(self, auth_client, setup):
        from decimal import Decimal

        p, a, _b = setup
        rows = auth_client.get(f"/api/v1/finance/portfolios/{p['id']}/holdings/").json()
        by_id = {r["asset_id"]: r for r in rows}
        assert Decimal(by_id[a["id"]]["quantity"]) == Decimal("100")
        assert by_id[a["id"]]["asset_name"] == "AAPL"

    def test_omits_assets_whose_net_is_zero(self, auth_client, setup):
        p, _a, b = setup
        rows = auth_client.get(f"/api/v1/finance/portfolios/{p['id']}/holdings/").json()
        assert b["id"] not in {r["asset_id"] for r in rows}

    def test_a_2_for_1_split_doubles_the_holding(self, auth_client, setup):
        """SC-017: splits work through the ordinary position-only transfer."""
        from decimal import Decimal

        p, a, _b = setup
        auth_client.post(
            "/api/v1/finance/transactions/",
            {
                "portfolio": p["id"],
                "timestamp": "2026-06-02T00:00:00Z",
                "description": "2:1 split",
                "transfers": [
                    {"asset": a["id"], "asset_change_amount": "100", "remark": "2:1 split"}
                ],
            },
            content_type="application/json",
        )
        rows = auth_client.get(f"/api/v1/finance/portfolios/{p['id']}/holdings/").json()
        by_id = {r["asset_id"]: r for r in rows}
        assert Decimal(by_id[a["id"]]["quantity"]) == Decimal("200")
