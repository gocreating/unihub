"""
Tests for EntitySearchFilter (019-quick-search).

Unit tests run against the Currency model (simple, three text fields) plus
ExchangeRate for cast (numeric/date) matching and Item for the dynamic
AttributeValue leg, mirroring tests/test_entity_filter.py's FakeView pattern.
"""

from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from core.filters import EntitySearchFilter
from core.models import AttributeDefinition, AttributeValue
from finance.models import Currency, ExchangeRate
from inventory.models import Acquisition, Item


class FakeCurrencyView:
    """Minimal view stub declaring text-only searchable fields."""

    searchable_fields = {
        "code": "text",
        "name": "text",
        "symbol": "text",
    }


class FakeRateView:
    """View stub for an entity with no text columns at all (cast-only)."""

    searchable_fields = {
        "base_currency": "text",
        "quote_currency": "text",
        "rate": "cast",
        "date": "cast",
    }


class FakeItemView:
    """View stub opting into the dynamic AttributeValue search leg."""

    searchable_fields = {"name": "text"}
    search_attribute_values = True
    attribute_content_type = "inventory.item"


class FakeBareView:
    """View stub with NO searchable fields — the param must be ignored."""


@pytest.fixture
def factory():
    """Return a DRF APIRequestFactory instance (provides query_params)."""
    return APIRequestFactory()


@pytest.fixture
def sample_currencies(db):
    """Create currencies exercising case, union, and literal-wildcard matching."""
    Currency.objects.create(code="USD", name="US Dollar", symbol="$", is_base_currency=False)
    Currency.objects.create(code="EUR", name="Euro", symbol="€", is_base_currency=False)
    Currency.objects.create(code="TWD", name="Taiwan Dollar", symbol="NT$", is_base_currency=False)
    Currency.objects.create(code="PCT", name="100% Fund", symbol="p_c", is_base_currency=False)
    return Currency.objects.all()


def _search(view, queryset, factory, query):
    """Apply EntitySearchFilter for the given search query string."""
    request = factory.get("/", {"search": query} if query is not None else {})
    return EntitySearchFilter().filter_queryset(request, queryset, view)


@pytest.mark.django_db
class TestEntitySearchFilterUnit:
    """Unit-level tests that call filter_queryset directly."""

    def test_absent_search_param_returns_full_queryset(self, factory, sample_currencies):
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, None)
        assert qs.count() == 4

    def test_empty_search_returns_full_queryset(self, factory, sample_currencies):
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "")
        assert qs.count() == 4

    def test_whitespace_search_returns_full_queryset(self, factory, sample_currencies):
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "   ")
        assert qs.count() == 4

    def test_case_insensitive_substring(self, factory, sample_currencies):
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "dollar")
        assert set(qs.values_list("code", flat=True)) == {"USD", "TWD"}

    def test_query_is_trimmed(self, factory, sample_currencies):
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "  euro  ")
        assert set(qs.values_list("code", flat=True)) == {"EUR"}

    def test_union_across_fields_symbol_only_match(self, factory, sample_currencies):
        # "NT$" appears only in TWD's symbol — union semantics must find it.
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "NT$")
        assert set(qs.values_list("code", flat=True)) == {"TWD"}

    def test_union_across_fields_code_only_match(self, factory, sample_currencies):
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "eur")
        assert set(qs.values_list("code", flat=True)) == {"EUR"}

    def test_percent_is_literal_not_wildcard(self, factory, sample_currencies):
        # "0%" matches only "100% Fund"; a LIKE-wildcard reading of "1%d"
        # would match "US Dollar" via zero-or-more expansion.
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "0%")
        assert set(qs.values_list("code", flat=True)) == {"PCT"}
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "1%d")
        assert qs.count() == 0

    def test_underscore_is_literal_not_wildcard(self, factory, sample_currencies):
        # "_" as LIKE-any-char would match every 3-char code; literal "_"
        # appears only in PCT's symbol "p_c".
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "p_c")
        assert set(qs.values_list("code", flat=True)) == {"PCT"}
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "u_d")
        assert qs.count() == 0

    def test_no_match_returns_empty(self, factory, sample_currencies):
        qs = _search(FakeCurrencyView(), Currency.objects.all(), factory, "zzz-nothing")
        assert qs.count() == 0

    def test_view_without_searchable_fields_ignores_param(self, factory, sample_currencies):
        qs = _search(FakeBareView(), Currency.objects.all(), factory, "dollar")
        assert qs.count() == 4

    def test_cast_matches_decimal_fragment(self, factory, db):
        ExchangeRate.objects.create(
            base_currency="USD",
            quote_currency="TWD",
            rate=Decimal("31.05"),
            date=timezone.make_aware(timezone.datetime(2026, 7, 15, 12, 0)),
        )
        ExchangeRate.objects.create(
            base_currency="EUR",
            quote_currency="TWD",
            rate=Decimal("35.5"),
            date=timezone.make_aware(timezone.datetime(2026, 6, 1, 12, 0)),
        )
        qs = _search(FakeRateView(), ExchangeRate.objects.all(), factory, "31.05")
        assert list(qs.values_list("base_currency", flat=True)) == ["USD"]

    def test_cast_matches_datetime_fragment(self, factory, db):
        ExchangeRate.objects.create(
            base_currency="USD",
            quote_currency="TWD",
            rate=Decimal("31.05"),
            date=timezone.make_aware(timezone.datetime(2026, 7, 15, 12, 0)),
        )
        ExchangeRate.objects.create(
            base_currency="EUR",
            quote_currency="TWD",
            rate=Decimal("35.5"),
            date=timezone.make_aware(timezone.datetime(2026, 6, 1, 12, 0)),
        )
        qs = _search(FakeRateView(), ExchangeRate.objects.all(), factory, "2026-07")
        assert list(qs.values_list("base_currency", flat=True)) == ["USD"]

    def test_attribute_value_only_match_returns_row(self, factory, db):
        acq = Acquisition.objects.create(source="seed")
        cup = Item.objects.create(name="Folding Cup", acquisition=acq)
        Item.objects.create(name="Umbrella", acquisition=acq)
        ct = ContentType.objects.get(app_label="inventory", model="item")
        definition = AttributeDefinition.objects.create(
            content_type=ct, name="color-unit-test", data_type="text"
        )
        AttributeValue.objects.create(
            attribute_definition=definition,
            content_type=ct,
            object_id=cup.id,
            value="crimson",
        )
        qs = _search(FakeItemView(), Item.objects.all(), factory, "crimson")
        assert list(qs.values_list("name", flat=True)) == ["Folding Cup"]

    def test_attribute_value_leg_absent_without_opt_in(self, factory, db):
        acq = Acquisition.objects.create(source="seed")
        cup = Item.objects.create(name="Folding Cup", acquisition=acq)
        ct = ContentType.objects.get(app_label="inventory", model="item")
        definition = AttributeDefinition.objects.create(
            content_type=ct, name="color-unit-test", data_type="text"
        )
        AttributeValue.objects.create(
            attribute_definition=definition,
            content_type=ct,
            object_id=cup.id,
            value="crimson",
        )

        class NoAttrView:
            searchable_fields = {"name": "text"}

        qs = _search(NoAttrView(), Item.objects.all(), factory, "crimson")
        assert qs.count() == 0

    def test_schema_parameter_declared(self):
        params = EntitySearchFilter().get_schema_operation_parameters(FakeCurrencyView())
        assert any(p.get("name") == "search" and p.get("in") == "query" for p in params)


CURRENCIES = "/api/v1/finance/currencies/"
ACCOUNTS = "/api/v1/finance/accounts/"
RATES = "/api/v1/finance/exchange-rates/"
ITEMS = "/api/v1/inventory/items/"
SCENARIOS = "/api/v1/inventory/scenarios/"


def _results(client, url, **params):
    resp = client.get(url, params)
    assert resp.status_code == 200, resp.content
    return resp.json()


@pytest.mark.django_db
class TestSearchEndpoints:
    """Integration tests: the ``search`` param on each entity list endpoint."""

    def test_currencies_search_each_field(self, auth_client):
        Currency.objects.create(code="USD", name="US Dollar", symbol="$")
        Currency.objects.create(code="EUR", name="Euro", symbol="€")
        Currency.objects.create(code="TWD", name="Taiwan Dollar", symbol="NT$")
        for query, expected in [("usd", {"USD"}), ("euro", {"EUR"}), ("NT$", {"TWD"})]:
            data = _results(auth_client, CURRENCIES, search=query)
            assert {r["code"] for r in data["results"]} == expected, query

    def test_currencies_blank_search_returns_all(self, auth_client):
        Currency.objects.create(code="USD", name="US Dollar", symbol="$")
        Currency.objects.create(code="EUR", name="Euro", symbol="€")
        data = _results(auth_client, CURRENCIES, search="")
        assert data["count"] == 2

    def test_accounts_search_name_currency_and_date(self, auth_client):
        from finance.models import Account

        Account.objects.create(
            name="Cathay Savings",
            currency="TWD",
            open_datetime=timezone.make_aware(timezone.datetime(2019, 3, 1, 9, 0)),
        )
        Account.objects.create(name="Chase Checking", currency="USD")
        data = _results(auth_client, ACCOUNTS, search="cathay")
        assert [r["name"] for r in data["results"]] == ["Cathay Savings"]
        data = _results(auth_client, ACCOUNTS, search="usd")
        assert [r["name"] for r in data["results"]] == ["Chase Checking"]
        # Date fragment matches the open_datetime text form (cast leg).
        data = _results(auth_client, ACCOUNTS, search="2019-03")
        assert [r["name"] for r in data["results"]] == ["Cathay Savings"]

    def test_rates_search_decimal_and_date(self, auth_client):
        ExchangeRate.objects.create(
            base_currency="USD",
            quote_currency="TWD",
            rate=Decimal("31.05"),
            date=timezone.make_aware(timezone.datetime(2026, 7, 15, 12, 0)),
        )
        ExchangeRate.objects.create(
            base_currency="EUR",
            quote_currency="TWD",
            rate=Decimal("35.5"),
            date=timezone.make_aware(timezone.datetime(2026, 6, 1, 12, 0)),
        )
        data = _results(auth_client, RATES, search="31.05")
        assert [r["base_currency"] for r in data["results"]] == ["USD"]
        data = _results(auth_client, RATES, search="2026-06")
        assert [r["base_currency"] for r in data["results"]] == ["EUR"]

    def test_items_search_text_fields(self, auth_client):
        acq = Acquisition.objects.create(source="MUJI 台北")
        Item.objects.create(name="衣架", alias_name="鋁製衣架", acquisition=acq)
        Item.objects.create(name="Folding Cup", spec="size: L", acquisition=acq)
        Item.objects.create(name="Towel", remark="gift from trip", acquisition=acq)
        for query, expected in [
            ("衣架", {"衣架"}),
            ("鋁製", {"衣架"}),
            ("size: L", {"Folding Cup"}),
            ("gift", {"Towel"}),
        ]:
            data = _results(auth_client, ITEMS, search=query)
            assert {r["name"] for r in data["results"]} == expected, query

    def test_items_search_acquisition_source(self, auth_client):
        muji = Acquisition.objects.create(source="MUJI 台北")
        other = Acquisition.objects.create(source="Costco")
        Item.objects.create(name="衣架", acquisition=muji)
        Item.objects.create(name="Towel", acquisition=other)
        data = _results(auth_client, ITEMS, search="muji")
        assert {r["name"] for r in data["results"]} == {"衣架"}

    def test_items_search_attribute_value(self, auth_client):
        acq = Acquisition.objects.create(source="seed")
        cup = Item.objects.create(name="Folding Cup", acquisition=acq)
        Item.objects.create(name="Umbrella", acquisition=acq)
        ct = ContentType.objects.get(app_label="inventory", model="item")
        definition = AttributeDefinition.objects.create(
            content_type=ct, name="color-endpoint-test", data_type="text"
        )
        AttributeValue.objects.create(
            attribute_definition=definition,
            content_type=ct,
            object_id=cup.id,
            value="00 WHITE",
        )
        data = _results(auth_client, ITEMS, search="00 white")
        assert {r["name"] for r in data["results"]} == {"Folding Cup"}

    def test_acquisitions_search_source_and_remark(self, auth_client):
        Acquisition.objects.create(source="MUJI 台北", remark="year-end sale")
        Acquisition.objects.create(source="Costco")
        from tests.conftest import ACQ

        data = _results(auth_client, ACQ, search="year-end")
        assert [r["source"] for r in data["results"]] == ["MUJI 台北"]

    def test_scenarios_search_name_and_description(self, auth_client):
        from inventory.models import Scenario

        Scenario.objects.create(name="Beach Trip", description="summer packing list")
        Scenario.objects.create(name="Ski Weekend", description="cold weather gear")
        data = _results(auth_client, SCENARIOS, search="beach")
        assert [r["name"] for r in data["results"]] == ["Beach Trip"]
        # description is searchable even though it is not a filterable field (R14).
        data = _results(auth_client, SCENARIOS, search="cold weather")
        assert [r["name"] for r in data["results"]] == ["Ski Weekend"]

    def test_count_reflects_search(self, auth_client):
        Currency.objects.create(code="USD", name="US Dollar", symbol="$")
        Currency.objects.create(code="EUR", name="Euro", symbol="€")
        Currency.objects.create(code="TWD", name="Taiwan Dollar", symbol="NT$")
        data = _results(auth_client, CURRENCIES, search="dollar")
        assert data["count"] == 2


@pytest.mark.django_db
class TestSearchComposesWithFilters:
    """FR-004: search narrows the filtered set — never escapes it (US2)."""

    def test_search_intersects_with_filters_payload(self, auth_client):
        import json

        Currency.objects.create(code="USD", name="US Dollar", symbol="$")
        Currency.objects.create(code="TWD", name="Taiwan Dollar", symbol="NT$")
        Currency.objects.create(code="EUR", name="Euro", symbol="€")
        # Filter admits only TWD; the search term matches USD and TWD.
        filters = {
            "groups": [
                {"logic": "and", "conditions": [{"attr": "code", "op": "equals", "val": "TWD"}]}
            ]
        }
        both = _results(auth_client, CURRENCIES, filters=json.dumps(filters), search="dollar")
        assert [r["code"] for r in both["results"]] == ["TWD"]

        # And the searched set is a SUBSET of the filters-only set.
        filtered_only = _results(auth_client, CURRENCIES, filters=json.dumps(filters))
        assert {r["code"] for r in both["results"]} <= {r["code"] for r in filtered_only["results"]}

    def test_search_excluded_by_filter_returns_nothing(self, auth_client):
        import json

        Currency.objects.create(code="USD", name="US Dollar", symbol="$")
        Currency.objects.create(code="EUR", name="Euro", symbol="€")
        filters = {
            "groups": [
                {"logic": "and", "conditions": [{"attr": "code", "op": "equals", "val": "EUR"}]}
            ]
        }
        data = _results(auth_client, CURRENCIES, filters=json.dumps(filters), search="dollar")
        assert data["count"] == 0
