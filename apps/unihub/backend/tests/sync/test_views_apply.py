"""Tests for SyncApplyPreviewView and SyncApplyConfirmView."""

from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.test import Client

PREVIEW_URL = "/api/v1/sync/apply/preview/"
CONFIRM_URL = "/api/v1/sync/apply/confirm/"
VALID_CONFIG = {
    "repo_url": "https://github.com/testuser/my-sync-repo",
    "pat": "ghp_testtoken123456789abcdef",
    "device_name": "test-device",
}


@pytest.fixture
def auth_client(db: None) -> Client:
    user = User.objects.create_user(username="testuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


def test_apply_preview_not_configured(auth_client: Client, db: None) -> None:
    resp = auth_client.get(PREVIEW_URL)
    assert resp.status_code == 400
    assert resp.json()["error"] == "not_configured"


def test_apply_preview_up_to_date(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    svc = MagicMock()
    svc.apply_preview.return_value = None
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.get(PREVIEW_URL)
    assert resp.status_code == 200
    assert resp.json()["status"] == "up_to_date"


def test_apply_preview_returns_changes(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    preview_data = [{"table": "finance_account", "added": 2, "modified": 0, "deleted": 0}]
    svc = MagicMock()
    svc.apply_preview.return_value = preview_data
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.get(PREVIEW_URL)
    assert resp.status_code == 200
    assert resp.json()["status"] == "has_changes"
    assert resp.json()["changes"] == preview_data


def test_apply_confirm_not_configured(auth_client: Client, db: None) -> None:
    resp = auth_client.post(CONFIRM_URL, {}, content_type="application/json")
    assert resp.status_code == 400
    assert resp.json()["error"] == "not_configured"


def test_apply_confirm_success(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    confirm_data = [{"table": "finance_account", "applied": 2}]
    svc = MagicMock()
    svc.apply_confirm.return_value = confirm_data
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(CONFIRM_URL, {}, content_type="application/json")
    assert resp.status_code == 200
    assert resp.json()["status"] == "applied"
    assert resp.json()["results"] == confirm_data
