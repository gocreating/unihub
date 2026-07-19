"""Shared pytest fixtures and helpers for the test suite."""

import pytest
from django.contrib.auth.models import User
from django.test import Client

ACQ = "/api/v1/inventory/acquisitions/"


@pytest.fixture
def auth_client(db):
    """An authenticated Django test client (session auth)."""
    user = User.objects.create_user(username="inv_tester", password="testpass")
    c = Client()
    c.force_login(user)
    return c


def create_item(client, **fields) -> dict:
    """Create a single item via an acquisition and return the item dict.

    Items are created only through acquisitions now, so tests use this helper
    instead of a direct POST /items/. Pass measurement fields as {value, unit}.
    """
    import json

    payload = {"name": "Item"}
    payload.update(fields)
    resp = client.post(
        ACQ,
        json.dumps({"source": "seed", "items": [payload]}),
        content_type="application/json",
    )
    assert resp.status_code == 201, resp.content
    return resp.json()["items"][0]
