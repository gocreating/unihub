"""Tests for NullsOrderingFilter — null ordering via __nullsfirst/__nullslast field suffix."""

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
def accounts_with_close(auth_client):
    """Create accounts: two with close_datetime, one without (NULL)."""

    def make(name, close=None):
        data = {
            "name": name,
            "currency": "USD",
            "color": "#ff0000",
            "open_datetime": "2020-01-01T00:00:00Z",
        }
        if close:
            data["close_datetime"] = close
        auth_client.post(
            "/api/v1/finance/currencies/",
            {"code": "USD", "name": "US Dollar", "symbol": "$"},
            content_type="application/json",
        )
        return auth_client.post(
            "/api/v1/finance/accounts/",
            data,
            content_type="application/json",
        ).json()

    a = make("Alpha", "2023-01-01T00:00:00Z")
    b = make("Beta", "2024-01-01T00:00:00Z")
    c = make("Gamma")  # close_datetime is NULL
    return a, b, c


class TestNullsOrderingFilter:
    # N-01: Regular ordering still works (no suffix → no change in behavior)
    def test_regular_ordering_asc(self, auth_client, accounts_with_close):
        resp = auth_client.get("/api/v1/finance/accounts/?ordering=name")
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()["results"]]
        assert names == sorted(names)

    # N-02: __nullsfirst suffix puts NULL rows first for ASC ordering
    def test_nullsfirst_asc_puts_null_first(self, auth_client, accounts_with_close):
        resp = auth_client.get("/api/v1/finance/accounts/?ordering=close_datetime__nullsfirst")
        assert resp.status_code == 200
        results = resp.json()["results"]
        # First result must have null close_datetime
        assert results[0]["close_datetime"] is None

    # N-03: __nullslast suffix puts NULL rows last for DESC ordering
    def test_nullslast_desc_puts_null_last(self, auth_client, accounts_with_close):
        resp = auth_client.get("/api/v1/finance/accounts/?ordering=-close_datetime__nullslast")
        assert resp.status_code == 200
        results = resp.json()["results"]
        # Last result must have null close_datetime
        assert results[-1]["close_datetime"] is None

    # N-04: Unknown field with suffix is rejected (ordering_fields validation still applies)
    def test_unknown_field_with_suffix_is_ignored(self, auth_client, accounts_with_close):
        resp = auth_client.get("/api/v1/finance/accounts/?ordering=nonexistent_field__nullsfirst")
        assert resp.status_code == 200  # not an error — just falls back to default order

    # N-05: ASC + nullslast → NULLs appear last
    def test_nullslast_asc_puts_null_last(self, auth_client, accounts_with_close):
        resp = auth_client.get("/api/v1/finance/accounts/?ordering=close_datetime__nullslast")
        assert resp.status_code == 200
        results = resp.json()["results"]
        # For ASC NULLS LAST: non-null rows come first, null row at the end
        assert results[0]["close_datetime"] is not None
        assert results[-1]["close_datetime"] is None

    # N-06: DESC + nullsfirst → NULLs appear first
    def test_nullsfirst_desc_puts_null_first(self, auth_client, accounts_with_close):
        resp = auth_client.get("/api/v1/finance/accounts/?ordering=-close_datetime__nullsfirst")
        assert resp.status_code == 200
        results = resp.json()["results"]
        # For DESC NULLS FIRST: null row comes first
        assert results[0]["close_datetime"] is None
