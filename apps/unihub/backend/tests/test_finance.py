"""
Integration tests for the Finance domain.
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
def twd(auth_client):
    resp = auth_client.post(
        "/api/v1/finance/currencies/",
        {"code": "TWD", "name": "Taiwan Dollar", "symbol": "NT$"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.django_db
class TestCurrencies:
    def test_currency_response_includes_is_base_currency(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/currencies/",
            {"code": "EUR", "name": "Euro", "symbol": "€"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert "is_base_currency" in resp.json()
        assert resp.json()["is_base_currency"] is False

    def test_create_currency_as_base(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/currencies/",
            {"code": "USD", "name": "US Dollar", "symbol": "$", "is_base_currency": True},
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.json()["is_base_currency"] is True

    def test_update_currency_set_as_base(self, auth_client, usd):
        resp = auth_client.patch(
            f"/api/v1/finance/currencies/{usd['code']}/",
            {"is_base_currency": True},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["is_base_currency"] is True

    def test_list_currencies_includes_is_base_currency(self, auth_client, usd, twd):
        auth_client.patch(
            "/api/v1/finance/currencies/USD/",
            {"is_base_currency": True},
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/currencies/")
        assert resp.status_code == 200
        data = {c["code"]: c for c in resp.json()}
        assert data["USD"]["is_base_currency"] is True
        assert data["TWD"]["is_base_currency"] is False

    def test_currency_is_base_currency_defaults_false(self, auth_client, usd):
        assert usd["is_base_currency"] is False


@pytest.mark.django_db
class TestAccounts:
    def test_account_color_defaults_to_empty_string(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Savings", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.json()["color"] == ""

    def test_create_account_with_custom_color(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Savings", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z", "color": "#2196f3"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.json()["color"] == "#2196f3"

    def test_update_account_color(self, auth_client, usd):
        acc = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Savings", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        resp = auth_client.patch(
            f"/api/v1/finance/accounts/{acc['id']}/",
            {"color": "#4caf50"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["color"] == "#4caf50"

    def test_balance_includes_account_color(self, auth_client, usd):
        acc = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Savings", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z", "color": "#e91e63"},
            content_type="application/json",
        ).json()
        sheet = auth_client.post(
            "/api/v1/finance/balance-sheets/",
            {"date": "2026-01-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        auth_client.put(
            f"/api/v1/finance/balance-sheets/{sheet['id']}/balances/{acc['id']}/",
            {"amount": "1000"},
            content_type="application/json",
        )
        balances = auth_client.get(f"/api/v1/finance/balance-sheets/{sheet['id']}/balances/").json()
        assert len(balances) == 1
        assert balances[0]["color"] == "#e91e63"

    def test_create_account(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Chase Checking", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Chase Checking"
        assert data["currency"] == "USD"
        assert len(data["id"]) == 12
        assert data["open_datetime"] == "2020-01-01T00:00:00Z"
        assert data["close_datetime"] is None

    def test_create_account_requires_open_datetime(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "No Date Account", "currency": "USD"},
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_create_account_with_open_datetime(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Old Account", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.json()["open_datetime"] == "2020-01-01T00:00:00Z"

    def test_create_account_with_open_and_close_datetime(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {
                "name": "Closed Account",
                "currency": "USD",
                "open_datetime": "2020-01-01T00:00:00Z",
                "close_datetime": "2025-12-31T00:00:00Z",
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["open_datetime"] == "2020-01-01T00:00:00Z"
        assert data["close_datetime"] == "2025-12-31T00:00:00Z"

    def test_list_accounts(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Account A", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/accounts/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_edit_account(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Old Name", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        account_id = resp.json()["id"]
        resp = auth_client.patch(
            f"/api/v1/finance/accounts/{account_id}/",
            {"name": "New Name"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_update_account_close_datetime(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Active Account", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        account_id = resp.json()["id"]
        resp = auth_client.patch(
            f"/api/v1/finance/accounts/{account_id}/",
            {"close_datetime": "2026-01-01T00:00:00Z"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["close_datetime"] == "2026-01-01T00:00:00Z"

    def test_list_accounts_as_of_excludes_not_yet_opened(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Future Account", "currency": "USD", "open_datetime": "2030-01-01T00:00:00Z"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Open Account", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/accounts/?as_of=2026-05-01T00:00:00Z")
        assert resp.status_code == 200
        names = [a["name"] for a in resp.json()]
        assert "Open Account" in names
        assert "Future Account" not in names

    def test_list_accounts_as_of_excludes_already_closed(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/accounts/",
            {
                "name": "Closed Account",
                "currency": "USD",
                "open_datetime": "2020-01-01T00:00:00Z",
                "close_datetime": "2025-01-01T00:00:00Z",
            },
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Active Account", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/accounts/?as_of=2026-05-01T00:00:00Z")
        assert resp.status_code == 200
        names = [a["name"] for a in resp.json()]
        assert "Active Account" in names
        assert "Closed Account" not in names

    def test_list_accounts_without_as_of_returns_all(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Account A", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/finance/accounts/",
            {
                "name": "Account B",
                "currency": "USD",
                "open_datetime": "2020-01-01T00:00:00Z",
                "close_datetime": "2025-01-01T00:00:00Z",
            },
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/accounts/")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_delete_account_without_balances(self, auth_client, usd):
        resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "To Delete", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        account_id = resp.json()["id"]
        resp = auth_client.delete(f"/api/v1/finance/accounts/{account_id}/")
        assert resp.status_code == 204

    def test_delete_account_with_balances_requires_confirm(self, auth_client, usd):
        acc_resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Has Balances", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        account_id = acc_resp.json()["id"]
        sheet_resp = auth_client.post(
            "/api/v1/finance/balance-sheets/",
            {"date": "2026-05-01T00:00:00Z"},
            content_type="application/json",
        )
        sheet_id = sheet_resp.json()["id"]
        auth_client.put(
            f"/api/v1/finance/balance-sheets/{sheet_id}/balances/{account_id}/",
            {"amount": "1000.00"},
            content_type="application/json",
        )
        resp = auth_client.delete(f"/api/v1/finance/accounts/{account_id}/")
        assert resp.status_code == 400
        assert resp.json()["affected_balance_count"] == 1

        resp = auth_client.delete(f"/api/v1/finance/accounts/{account_id}/?confirm=true")
        assert resp.status_code == 204


@pytest.mark.django_db
class TestBalanceSheets:
    def test_create_balance_sheet(self, auth_client):
        resp = auth_client.post(
            "/api/v1/finance/balance-sheets/",
            {"date": "2026-05-01T00:00:00Z"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["date"].startswith("2026-05-01")

    def test_enter_and_retrieve_balance(self, auth_client, usd):
        acc = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Savings", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        sheet = auth_client.post(
            "/api/v1/finance/balance-sheets/",
            {"date": "2026-05-01T00:00:00Z"},
            content_type="application/json",
        ).json()

        resp = auth_client.put(
            f"/api/v1/finance/balance-sheets/{sheet['id']}/balances/{acc['id']}/",
            {"amount": "5000.00"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["amount"] == "5000.0000"

    def test_net_worth_sums_per_currency(self, auth_client, usd):
        acc1 = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Asset", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        acc2 = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Savings", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        sheet = auth_client.post(
            "/api/v1/finance/balance-sheets/",
            {"date": "2026-05-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        auth_client.put(
            f"/api/v1/finance/balance-sheets/{sheet['id']}/balances/{acc1['id']}/",
            {"amount": "10000.00"},
            content_type="application/json",
        )
        auth_client.put(
            f"/api/v1/finance/balance-sheets/{sheet['id']}/balances/{acc2['id']}/",
            {"amount": "3000.00"},
            content_type="application/json",
        )
        resp = auth_client.get(f"/api/v1/finance/balance-sheets/{sheet['id']}/net-worth/")
        assert resp.status_code == 200
        data = resp.json()
        usd_entry = next(e for e in data["per_currency"] if e["currency"] == "USD")
        assert usd_entry["net_worth"] == "13000.0000"

    def test_net_worth_separate_per_currency(self, auth_client, usd, twd):
        usd_acc = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "USD Account", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        twd_acc = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "TWD Account", "currency": "TWD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        sheet = auth_client.post(
            "/api/v1/finance/balance-sheets/",
            {"date": "2026-05-01T00:00:00Z"},
            content_type="application/json",
        ).json()
        auth_client.put(
            f"/api/v1/finance/balance-sheets/{sheet['id']}/balances/{usd_acc['id']}/",
            {"amount": "1000.00"},
            content_type="application/json",
        )
        auth_client.put(
            f"/api/v1/finance/balance-sheets/{sheet['id']}/balances/{twd_acc['id']}/",
            {"amount": "30000.00"},
            content_type="application/json",
        )
        resp = auth_client.get(f"/api/v1/finance/balance-sheets/{sheet['id']}/net-worth/")
        data = resp.json()
        currencies = {e["currency"] for e in data["per_currency"]}
        assert "USD" in currencies
        assert "TWD" in currencies


@pytest.mark.django_db
class TestExchangeRates:
    def test_create_exchange_rate(self, auth_client, usd, twd):
        resp = auth_client.post(
            "/api/v1/finance/exchange-rates/",
            {
                "base_currency": "TWD",
                "quote_currency": "USD",
                "rate": "0.03076900",
                "date": "2026-05-01T00:00:00Z",
            },
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["base_currency"] == "TWD"
        assert data["quote_currency"] == "USD"
        assert data["rate"] == "0.03076900"

    def test_update_exchange_rate(self, auth_client, usd, twd):
        resp = auth_client.post(
            "/api/v1/finance/exchange-rates/",
            {
                "base_currency": "TWD",
                "quote_currency": "USD",
                "rate": "0.03000000",
                "date": "2026-05-01T00:00:00Z",
            },
            content_type="application/json",
        ).json()
        rate_id = resp["id"]
        patch_resp = auth_client.patch(
            f"/api/v1/finance/exchange-rates/{rate_id}/",
            {"rate": "0.03100000"},
            content_type="application/json",
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["rate"] == "0.03100000"

    def test_filter_exchange_rates_by_currency(self, auth_client, usd, twd):
        auth_client.post(
            "/api/v1/finance/exchange-rates/",
            {
                "base_currency": "TWD",
                "quote_currency": "USD",
                "rate": "0.031",
                "date": "2026-05-01T00:00:00Z",
            },
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/exchange-rates/?base_currency=TWD")
        assert resp.status_code == 200
        assert all(e["base_currency"] == "TWD" for e in resp.json())
