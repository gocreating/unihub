"""
Tests for EntityFilterBackend.

Tests run against the Currency model because it is simple and has two text
fields ideal for exercising all filter operators without additional fixtures.
"""

import json

import pytest
from rest_framework.test import APIRequestFactory

from core.filters import EntityFilterBackend
from finance.models import Currency


class FakeView:
    """Minimal view stub providing filterable_fields for the filter backend."""

    filterable_fields = {
        "code": {"lookup": "code", "type": "text"},
        "name": {"lookup": "name", "type": "text"},
    }


@pytest.fixture
def factory():
    """Return a DRF APIRequestFactory instance (provides query_params)."""
    return APIRequestFactory()


@pytest.fixture
def sample_currencies(db):
    """Create three currencies for filter tests."""
    Currency.objects.create(code="USD", name="US Dollar", symbol="$", is_base_currency=False)
    Currency.objects.create(code="EUR", name="Euro", symbol="€", is_base_currency=False)
    Currency.objects.create(code="TWD", name="Taiwan Dollar", symbol="NT$", is_base_currency=False)
    return Currency.objects.all()


def _make_request(factory, filters_dict):
    """Build a GET request with the given dict serialised as a JSON filters param."""
    return factory.get("/", {"filters": json.dumps(filters_dict)})


@pytest.mark.django_db
class TestEntityFilterBackendUnit:
    """Unit-level tests that call filter_queryset directly."""

    def test_no_filters_param_returns_full_queryset(self, factory, sample_currencies):
        request = factory.get("/")
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert qs.count() == 3

    def test_single_condition_contains(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "name", "op": "contains", "val": "Dollar"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        codes = set(qs.values_list("code", flat=True))
        assert codes == {"USD", "TWD"}

    def test_single_condition_equals(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "code", "op": "equals", "val": "usd"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert list(qs.values_list("code", flat=True)) == ["USD"]

    def test_single_condition_is(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "code", "op": "is", "val": "EUR"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert list(qs.values_list("code", flat=True)) == ["EUR"]

    def test_multi_condition_and(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [
                        {"attr": "name", "op": "contains", "val": "Dollar"},
                        {"attr": "code", "op": "equals", "val": "USD"},
                    ],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert list(qs.values_list("code", flat=True)) == ["USD"]

    def test_multi_condition_or_within_group(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "or",
                    "conditions": [
                        {"attr": "code", "op": "equals", "val": "USD"},
                        {"attr": "code", "op": "equals", "val": "EUR"},
                    ],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        codes = set(qs.values_list("code", flat=True))
        assert codes == {"USD", "EUR"}

    def test_multi_group_or(self, factory, sample_currencies):
        filters = {
            "groups": [
                {"logic": "and", "conditions": [{"attr": "code", "op": "equals", "val": "USD"}]},
                {"logic": "and", "conditions": [{"attr": "code", "op": "equals", "val": "EUR"}]},
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        codes = set(qs.values_list("code", flat=True))
        assert codes == {"USD", "EUR"}

    def test_invalid_json_raises_validation_error(self, factory, sample_currencies):
        from rest_framework.exceptions import ValidationError

        request = factory.get("/", {"filters": "not-valid-json"})
        with pytest.raises(ValidationError):
            EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())

    def test_unknown_attr_is_silently_skipped(self, factory, sample_currencies):
        # Unknown attr should not raise; it should be ignored (no filter applied).
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "nonexistent_field", "op": "equals", "val": "x"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert qs.count() == 3

    def test_not_contains_operator(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "name", "op": "not_contains", "val": "Dollar"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert list(qs.values_list("code", flat=True)) == ["EUR"]

    def test_not_equals_operator(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "code", "op": "not_equals", "val": "USD"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        codes = set(qs.values_list("code", flat=True))
        assert "USD" not in codes
        assert len(codes) == 2

    def test_is_not_operator(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "code", "op": "is_not", "val": "USD"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        codes = set(qs.values_list("code", flat=True))
        assert codes == {"EUR", "TWD"}

    def test_starts_with_operator(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "name", "op": "starts_with", "val": "US"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert list(qs.values_list("code", flat=True)) == ["USD"]

    def test_ends_with_operator(self, factory, sample_currencies):
        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "name", "op": "ends_with", "val": "Dollar"}],
                }
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        codes = set(qs.values_list("code", flat=True))
        assert codes == {"USD", "TWD"}

    def test_empty_groups_list_returns_full_queryset(self, factory, sample_currencies):
        filters = {"groups": []}
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert qs.count() == 3

    def test_group_with_no_valid_conditions_is_skipped(self, factory, sample_currencies):
        # A group whose only condition references an unknown attr should be skipped.
        filters = {
            "groups": [
                {"logic": "and", "conditions": [{"attr": "unknown", "op": "equals", "val": "x"}]},
            ]
        }
        request = _make_request(factory, filters)
        qs = EntityFilterBackend().filter_queryset(request, Currency.objects.all(), FakeView())
        assert qs.count() == 3


# ── AccountViewSet integration tests (T008) ──────────────────────────────────
# These tests will FAIL until EntityFilterBackend is wired to AccountViewSet
# (done in T009). They verify end-to-end filter behaviour via the HTTP API.


@pytest.fixture
def auth_client_for_accounts(db):
    """Return an authenticated Django test client for account filter tests."""
    from django.contrib.auth.models import User
    from django.test import Client

    user = User.objects.create_user(username="filtertest", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.fixture
def usd_for_filter(auth_client_for_accounts):
    """Create USD currency for account fixture dependency."""
    resp = auth_client_for_accounts.post(
        "/api/v1/finance/currencies/",
        {"code": "USD", "name": "US Dollar", "symbol": "$"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
def sample_accounts(auth_client_for_accounts, usd_for_filter):
    """Create three accounts for filter integration tests."""
    for name in ("Savings A", "Checking B", "Investment C"):
        resp = auth_client_for_accounts.post(
            "/api/v1/finance/accounts/",
            {"name": name, "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        assert resp.status_code == 201
    return auth_client_for_accounts


@pytest.mark.django_db
class TestAccountViewSetFilter:
    """Integration tests for filter on AccountViewSet (requires T009 wiring)."""

    def test_filter_name_contains(self, sample_accounts):
        import json
        import urllib.parse

        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "name", "op": "contains", "val": "Savings"}],
                }
            ]
        }
        url = "/api/v1/finance/accounts/?filters=" + urllib.parse.quote(json.dumps(filters))
        resp = sample_accounts.get(url)
        assert resp.status_code == 200
        data = resp.json()
        results = data.get("results", data)  # paginated or plain list
        assert all("Savings" in r["name"] for r in results)
        assert len(results) == 1

    def test_filter_currency_is(self, sample_accounts):
        import json
        import urllib.parse

        filters = {
            "groups": [
                {"logic": "and", "conditions": [{"attr": "currency", "op": "is", "val": "USD"}]}
            ]
        }
        url = "/api/v1/finance/accounts/?filters=" + urllib.parse.quote(json.dumps(filters))
        resp = sample_accounts.get(url)
        assert resp.status_code == 200
        data = resp.json()
        results = data.get("results", data)
        assert len(results) == 3  # all are USD

    def test_filter_name_equals_case_insensitive(self, sample_accounts):
        import json
        import urllib.parse

        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "name", "op": "equals", "val": "savings a"}],
                }
            ]
        }
        url = "/api/v1/finance/accounts/?filters=" + urllib.parse.quote(json.dumps(filters))
        resp = sample_accounts.get(url)
        assert resp.status_code == 200
        data = resp.json()
        results = data.get("results", data)
        assert len(results) == 1
        assert results[0]["name"] == "Savings A"

    def test_multi_group_or(self, sample_accounts):
        import json
        import urllib.parse

        filters = {
            "groups": [
                {
                    "logic": "and",
                    "conditions": [{"attr": "name", "op": "contains", "val": "Savings"}],
                },
                {
                    "logic": "and",
                    "conditions": [{"attr": "name", "op": "contains", "val": "Checking"}],
                },
            ]
        }
        url = "/api/v1/finance/accounts/?filters=" + urllib.parse.quote(json.dumps(filters))
        resp = sample_accounts.get(url)
        assert resp.status_code == 200
        data = resp.json()
        results = data.get("results", data)
        names = {r["name"] for r in results}
        assert "Savings A" in names
        assert "Checking B" in names
        assert "Investment C" not in names

    def test_no_filter_returns_all(self, sample_accounts):
        resp = sample_accounts.get("/api/v1/finance/accounts/")
        assert resp.status_code == 200
        data = resp.json()
        results = data.get("results", data)
        assert len(results) == 3

    def test_invalid_filter_json_returns_400(self, sample_accounts):
        resp = sample_accounts.get("/api/v1/finance/accounts/?filters=NOT_JSON")
        assert resp.status_code == 400
