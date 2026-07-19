"""
Tests for EntityOffsetPagination and EntityCursorPagination.

Tests run against the Finance Accounts endpoint (offset) and BalanceSheet
endpoint (cursor) after the pagination classes are wired up in T009/T022.
These tests are written first and will fail until the pagination classes exist.
"""

import pytest

from core.pagination import EntityCursorPagination, EntityOffsetPagination


@pytest.mark.django_db
class TestEntityOffsetPaginationConfig:
    """Verify the pagination class has the expected configuration."""

    def test_default_limit(self):
        p = EntityOffsetPagination()
        assert p.default_limit == 50

    def test_max_limit(self):
        p = EntityOffsetPagination()
        assert p.max_limit == 500


@pytest.mark.django_db
class TestEntityCursorPaginationConfig:
    """Verify the cursor pagination class has the expected configuration."""

    def test_page_size(self):
        p = EntityCursorPagination()
        assert p.page_size == 50

    def test_page_size_query_param(self):
        p = EntityCursorPagination()
        assert p.page_size_query_param == "limit"

    def test_max_page_size(self):
        p = EntityCursorPagination()
        assert p.max_page_size == 500


@pytest.fixture
def auth_client(db):
    """Return an authenticated Django test client."""
    from django.contrib.auth.models import User
    from django.test import Client

    user = User.objects.create_user(username="testpag", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.fixture
def usd_currency(auth_client):
    """Create a USD currency fixture via the API."""
    resp = auth_client.post(
        "/api/v1/finance/currencies/",
        {"code": "USD", "name": "US Dollar", "symbol": "$"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.django_db
class TestAccountsOffsetPagination:
    """Integration tests for offset pagination on the Accounts endpoint.

    These tests pass only AFTER EntityOffsetPagination is wired to AccountViewSet
    (done in T009). Until then they will fail with assertion errors because the
    response will be a plain list rather than a paginated envelope.
    """

    def test_list_accounts_returns_paginated_envelope(self, auth_client, usd_currency):
        auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Account A", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        resp = auth_client.get("/api/v1/finance/accounts/")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "results" in data
        assert isinstance(data["results"], list)
        assert data["count"] >= 1

    def test_limit_param_restricts_results(self, auth_client, usd_currency):
        for i in range(5):
            auth_client.post(
                "/api/v1/finance/accounts/",
                {
                    "name": f"Account {i}",
                    "currency": "USD",
                    "open_datetime": "2020-01-01T00:00:00Z",
                },
                content_type="application/json",
            )
        resp = auth_client.get("/api/v1/finance/accounts/?limit=2")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 2
        assert data["count"] >= 5

    def test_offset_param_paginates_results(self, auth_client, usd_currency):
        for i in range(4):
            auth_client.post(
                "/api/v1/finance/accounts/",
                {
                    "name": f"Paged Account {i}",
                    "currency": "USD",
                    "open_datetime": "2020-01-01T00:00:00Z",
                },
                content_type="application/json",
            )
        page1 = auth_client.get("/api/v1/finance/accounts/?limit=2&offset=0").json()
        page2 = auth_client.get("/api/v1/finance/accounts/?limit=2&offset=2").json()
        ids_p1 = {r["id"] for r in page1["results"]}
        ids_p2 = {r["id"] for r in page2["results"]}
        assert ids_p1.isdisjoint(ids_p2), "Pages must contain different records"

    def test_next_url_preserves_ordering_param(self, auth_client, usd_currency):
        for i in range(3):
            auth_client.post(
                "/api/v1/finance/accounts/",
                {
                    "name": f"Ord Account {i}",
                    "currency": "USD",
                    "open_datetime": "2020-01-01T00:00:00Z",
                },
                content_type="application/json",
            )
        resp = auth_client.get("/api/v1/finance/accounts/?limit=1&ordering=name").json()
        if resp.get("next"):
            assert "ordering=name" in resp["next"]

    def test_next_url_preserves_filters_param(self, auth_client, usd_currency):
        """The `next` pagination URL must include the `filters` param so that
        navigating to the next page continues filtering by the same criteria."""
        import json

        # Create accounts: two matching the filter, one that does not
        for name in ("Savings Alpha", "Savings Beta", "Checking"):
            auth_client.post(
                "/api/v1/finance/accounts/",
                {
                    "name": name,
                    "currency": "USD",
                    "open_datetime": "2020-01-01T00:00:00Z",
                },
                content_type="application/json",
            )

        filters_payload = json.dumps(
            {
                "groups": [
                    {
                        "logic": "and",
                        "conditions": [{"attr": "name", "op": "contains", "val": "Savings"}],
                    }
                ]
            }
        )

        import urllib.parse

        encoded_filters = urllib.parse.quote(filters_payload)

        resp = auth_client.get(f"/api/v1/finance/accounts/?limit=1&filters={encoded_filters}")
        assert resp.status_code == 200
        data = resp.json()
        # Two "Savings" accounts with limit=1 → there must be a next page
        assert data["next"] is not None, "Expected a next page URL (limit=1, 2 matching rows)"
        assert "filters=" in data["next"], "next URL must preserve the filters param"
