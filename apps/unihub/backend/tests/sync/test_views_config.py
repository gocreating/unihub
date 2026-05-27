"""Integration tests for SyncConfigView (GET / PUT / DELETE)."""

import pytest
from django.contrib.auth.models import User
from django.test import Client

from sync.models import SyncConfig
from sync.services.crypto import decrypt_pat

URL = "/api/v1/sync/config/"
VALID_PAYLOAD = {
    "repo_url": "https://github.com/testuser/my-sync-repo",
    "pat": "ghp_testtoken123456789abcdef",
}


@pytest.fixture
def client() -> Client:
    return Client()


@pytest.fixture
def auth_client(db: None) -> Client:
    user = User.objects.create_user(username="testuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


# ── Unauthenticated ────────────────────────────────────────────────────────────


def test_get_config_requires_auth(client: Client) -> None:
    resp = client.get(URL)
    assert resp.status_code == 403


def test_put_config_requires_auth(client: Client) -> None:
    resp = client.put(URL, VALID_PAYLOAD, content_type="application/json")
    assert resp.status_code == 403


# ── GET ────────────────────────────────────────────────────────────────────────


def test_get_config_when_unconfigured(auth_client: Client, db: None) -> None:
    resp = auth_client.get(URL)
    assert resp.status_code == 200
    assert resp.json() == {"is_configured": False}


def test_get_config_when_configured(auth_client: Client, db: None) -> None:
    auth_client.put(URL, VALID_PAYLOAD, content_type="application/json")
    resp = auth_client.get(URL)
    data = resp.json()
    assert data["is_configured"] is True
    assert data["repo_url"] == VALID_PAYLOAD["repo_url"]
    assert "device_name" not in data


def test_pat_never_returned_in_response(auth_client: Client, db: None) -> None:
    auth_client.put(URL, VALID_PAYLOAD, content_type="application/json")
    resp = auth_client.get(URL)
    body = resp.content.decode()
    assert "ghp_testtoken" not in body
    assert "pat" not in resp.json()


# ── PUT ────────────────────────────────────────────────────────────────────────


def test_put_config_creates_singleton(auth_client: Client, db: None) -> None:
    resp = auth_client.put(URL, VALID_PAYLOAD, content_type="application/json")
    assert resp.status_code == 200
    assert SyncConfig.objects.count() == 1
    config = SyncConfig.objects.first()
    assert config is not None
    assert config.repo_url == VALID_PAYLOAD["repo_url"]
    assert decrypt_pat(config.pat_encrypted) == VALID_PAYLOAD["pat"]


def test_put_config_updates_existing(auth_client: Client, db: None) -> None:
    auth_client.put(URL, VALID_PAYLOAD, content_type="application/json")
    new_payload = {**VALID_PAYLOAD, "repo_url": "https://github.com/testuser/other-repo"}
    resp = auth_client.put(URL, new_payload, content_type="application/json")
    assert resp.status_code == 200
    assert SyncConfig.objects.count() == 1
    assert SyncConfig.objects.first().repo_url == "https://github.com/testuser/other-repo"  # type: ignore[union-attr]


def test_put_config_invalid_repo_url(auth_client: Client, db: None) -> None:
    payload = {**VALID_PAYLOAD, "repo_url": "not-a-url"}
    resp = auth_client.put(URL, payload, content_type="application/json")
    assert resp.status_code == 400


def test_put_config_missing_pat(auth_client: Client, db: None) -> None:
    payload = {"repo_url": VALID_PAYLOAD["repo_url"]}
    resp = auth_client.put(URL, payload, content_type="application/json")
    assert resp.status_code == 400


# ── DELETE ─────────────────────────────────────────────────────────────────────


def test_delete_config_removes_row(auth_client: Client, db: None) -> None:
    auth_client.put(URL, VALID_PAYLOAD, content_type="application/json")
    resp = auth_client.delete(URL)
    assert resp.status_code == 204
    assert SyncConfig.objects.count() == 0


def test_delete_config_not_found(auth_client: Client, db: None) -> None:
    resp = auth_client.delete(URL)
    assert resp.status_code == 404
