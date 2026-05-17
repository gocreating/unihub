"""
Integration tests for the Finance domain.
Tests require a real database — no mocks for DB layer.
"""
import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from django.test import Client


@pytest.fixture
def client():
    return Client()


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(username='testuser', password='testpass')
    c = Client()
    c.post('/api/v1/auth/login/', {'username': 'testuser', 'password': 'testpass'}, content_type='application/json')
    c.force_login(user)
    return c


@pytest.mark.django_db
class TestAccounts:
    def test_create_account(self, auth_client):
        resp = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'Chase Checking', 'account_type': 'asset', 'currency': 'USD'},
            content_type='application/json',
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data['name'] == 'Chase Checking'
        assert data['account_type'] == 'asset'
        assert data['currency'] == 'USD'
        assert len(data['id']) == 12

    def test_list_accounts(self, auth_client):
        auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'Account A', 'account_type': 'asset', 'currency': 'USD'},
            content_type='application/json',
        )
        resp = auth_client.get('/api/v1/finance/accounts/')
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_edit_account(self, auth_client):
        resp = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'Old Name', 'account_type': 'asset', 'currency': 'USD'},
            content_type='application/json',
        )
        account_id = resp.json()['id']
        resp = auth_client.patch(
            f'/api/v1/finance/accounts/{account_id}/',
            {'name': 'New Name'},
            content_type='application/json',
        )
        assert resp.status_code == 200
        assert resp.json()['name'] == 'New Name'

    def test_delete_account_without_balances(self, auth_client):
        resp = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'To Delete', 'account_type': 'asset', 'currency': 'USD'},
            content_type='application/json',
        )
        account_id = resp.json()['id']
        resp = auth_client.delete(f'/api/v1/finance/accounts/{account_id}/')
        assert resp.status_code == 204

    def test_delete_account_with_balances_requires_confirm(self, auth_client):
        acc_resp = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'Has Balances', 'account_type': 'asset', 'currency': 'USD'},
            content_type='application/json',
        )
        account_id = acc_resp.json()['id']
        sheet_resp = auth_client.post(
            '/api/v1/finance/balance-sheets/',
            {'date': '2026-05-01', 'label': 'May', 'base_currency': 'USD'},
            content_type='application/json',
        )
        sheet_id = sheet_resp.json()['id']
        auth_client.put(
            f'/api/v1/finance/balance-sheets/{sheet_id}/balances/{account_id}/',
            {'amount': '1000.00'},
            content_type='application/json',
        )
        resp = auth_client.delete(f'/api/v1/finance/accounts/{account_id}/')
        assert resp.status_code == 400
        assert resp.json()['affected_balance_count'] == 1

        resp = auth_client.delete(f'/api/v1/finance/accounts/{account_id}/?confirm=true')
        assert resp.status_code == 204


@pytest.mark.django_db
class TestBalanceSheets:
    def test_create_balance_sheet(self, auth_client):
        resp = auth_client.post(
            '/api/v1/finance/balance-sheets/',
            {'date': '2026-05-01', 'label': 'May 2026', 'base_currency': 'USD'},
            content_type='application/json',
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data['date'] == '2026-05-01'
        assert data['base_currency'] == 'USD'

    def test_enter_and_retrieve_balance(self, auth_client):
        acc = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'Savings', 'account_type': 'asset', 'currency': 'USD'},
            content_type='application/json',
        ).json()
        sheet = auth_client.post(
            '/api/v1/finance/balance-sheets/',
            {'date': '2026-05-01', 'label': 'May', 'base_currency': 'USD'},
            content_type='application/json',
        ).json()

        resp = auth_client.put(
            f'/api/v1/finance/balance-sheets/{sheet["id"]}/balances/{acc["id"]}/',
            {'amount': '5000.00'},
            content_type='application/json',
        )
        assert resp.status_code == 200
        assert resp.json()['amount'] == '5000.0000'

    def test_single_currency_net_worth(self, auth_client):
        asset = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'Asset', 'account_type': 'asset', 'currency': 'USD'},
            content_type='application/json',
        ).json()
        liability = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'Debt', 'account_type': 'liability', 'currency': 'USD'},
            content_type='application/json',
        ).json()
        sheet = auth_client.post(
            '/api/v1/finance/balance-sheets/',
            {'date': '2026-05-01', 'label': 'May', 'base_currency': 'USD'},
            content_type='application/json',
        ).json()
        auth_client.put(
            f'/api/v1/finance/balance-sheets/{sheet["id"]}/balances/{asset["id"]}/',
            {'amount': '10000.00'},
            content_type='application/json',
        )
        auth_client.put(
            f'/api/v1/finance/balance-sheets/{sheet["id"]}/balances/{liability["id"]}/',
            {'amount': '3000.00'},
            content_type='application/json',
        )
        resp = auth_client.get(f'/api/v1/finance/balance-sheets/{sheet["id"]}/net-worth/')
        assert resp.status_code == 200
        data = resp.json()
        assert data['base_currency_total']['net_worth'] == '7000.0000'
        assert data['base_currency_total']['missing_rates'] == []

    def test_missing_rate_flagged(self, auth_client):
        twd_acc = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'TWD Account', 'account_type': 'asset', 'currency': 'TWD'},
            content_type='application/json',
        ).json()
        sheet = auth_client.post(
            '/api/v1/finance/balance-sheets/',
            {'date': '2026-05-01', 'label': 'May', 'base_currency': 'USD'},
            content_type='application/json',
        ).json()
        auth_client.put(
            f'/api/v1/finance/balance-sheets/{sheet["id"]}/balances/{twd_acc["id"]}/',
            {'amount': '100000.00'},
            content_type='application/json',
        )
        resp = auth_client.get(f'/api/v1/finance/balance-sheets/{sheet["id"]}/net-worth/')
        data = resp.json()
        assert len(data['base_currency_total']['missing_rates']) == 1
        assert data['base_currency_total']['missing_rates'][0]['currency'] == 'TWD'


@pytest.mark.django_db
class TestExchangeRates:
    def test_create_exchange_rate(self, auth_client):
        resp = auth_client.post(
            '/api/v1/finance/exchange-rates/',
            {'from_currency': 'TWD', 'to_currency': 'USD', 'rate': '0.03076900', 'date': '2026-05-01'},
            content_type='application/json',
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data['from_currency'] == 'TWD'
        assert data['rate'] == '0.03076900'

    def test_closest_prior_rate_selection(self, auth_client):
        auth_client.post(
            '/api/v1/finance/exchange-rates/',
            {'from_currency': 'TWD', 'to_currency': 'USD', 'rate': '0.03076900', 'date': '2026-04-01'},
            content_type='application/json',
        )
        auth_client.post(
            '/api/v1/finance/exchange-rates/',
            {'from_currency': 'TWD', 'to_currency': 'USD', 'rate': '0.03100000', 'date': '2026-06-01'},
            content_type='application/json',
        )
        twd_acc = auth_client.post(
            '/api/v1/finance/accounts/',
            {'name': 'TWD', 'account_type': 'asset', 'currency': 'TWD'},
            content_type='application/json',
        ).json()
        sheet = auth_client.post(
            '/api/v1/finance/balance-sheets/',
            {'date': '2026-05-01', 'label': 'May', 'base_currency': 'USD'},
            content_type='application/json',
        ).json()
        auth_client.put(
            f'/api/v1/finance/balance-sheets/{sheet["id"]}/balances/{twd_acc["id"]}/',
            {'amount': '100000.00'},
            content_type='application/json',
        )
        resp = auth_client.get(f'/api/v1/finance/balance-sheets/{sheet["id"]}/net-worth/')
        data = resp.json()
        # April rate (0.030769) should be used, not June rate
        expected = str((Decimal('100000') * Decimal('0.030769')).quantize(Decimal('0.0000')))
        assert data['base_currency_total']['net_worth'] == expected
        assert 'TWD' in data['base_currency_total']['covered_currencies']
