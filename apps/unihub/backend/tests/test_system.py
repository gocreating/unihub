"""
Integration tests for the system version endpoint.
Tests run against SQLite in-memory DB (settings_test).
"""

import pytest
from django.conf import settings
from django.test import Client


@pytest.fixture
def client() -> Client:
    return Client()


@pytest.mark.django_db
def test_version_endpoint_returns_200(client: Client) -> None:
    """GET /api/v1/system/version/ returns HTTP 200."""
    resp = client.get("/api/v1/system/version/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_version_endpoint_returns_version_key(client: Client) -> None:
    """Response body contains a 'version' key."""
    resp = client.get("/api/v1/system/version/")
    data = resp.json()
    assert "version" in data


@pytest.mark.django_db
def test_version_endpoint_value_matches_settings(client: Client) -> None:
    """The returned version matches settings.VERSION."""
    resp = client.get("/api/v1/system/version/")
    data = resp.json()
    assert data["version"] == settings.VERSION


@pytest.mark.django_db
def test_version_endpoint_value_starts_with_v(client: Client) -> None:
    """The returned version string starts with 'v'."""
    resp = client.get("/api/v1/system/version/")
    data = resp.json()
    assert data["version"].startswith("v")


@pytest.mark.django_db
def test_version_endpoint_no_auth_required(client: Client) -> None:
    """Endpoint is public — no authentication needed."""
    # client has no session; expect 200, not 403
    resp = client.get("/api/v1/system/version/")
    assert resp.status_code == 200
