"""Tests for SyncStatusView."""

from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.test import Client

URL = "/api/v1/sync/status/"
VALID_CONFIG = {
    "repo_url": "https://github.com/testuser/my-sync-repo",
    "pat": "ghp_testtoken123456789abcdef",
}


@pytest.fixture
def auth_client(db: None) -> Client:
    user = User.objects.create_user(username="testuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


def test_status_not_configured(auth_client: Client, db: None) -> None:
    resp = auth_client.get(URL)
    assert resp.status_code == 400
    assert resp.json()["error"] == "not_configured"


def test_status_in_sync(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    mock_status = MagicMock(
        status="in_sync", ahead_count=0, behind_count=0,
        remote_commit="abc123", error_message=None
    )
    with patch("sync.views.GitSyncService.status", return_value=mock_status):
        resp = auth_client.get(URL)
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_sync"


def test_status_behind(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    mock_status = MagicMock(
        status="behind", ahead_count=0, behind_count=3,
        remote_commit="def456", error_message=None
    )
    with patch("sync.views.GitSyncService.status", return_value=mock_status):
        resp = auth_client.get(URL)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "behind"
    assert data["behind_count"] == 3


def test_status_error(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    mock_status = MagicMock(
        status="error", ahead_count=0, behind_count=0,
        remote_commit=None, error_message="Connection refused"
    )
    with patch("sync.views.GitSyncService.status", return_value=mock_status):
        resp = auth_client.get(URL)
    assert resp.status_code == 200
    assert resp.json()["error_message"] == "Connection refused"
