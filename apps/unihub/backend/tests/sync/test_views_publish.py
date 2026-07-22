"""Tests for SyncPublishView, SyncForcePublishView, and SyncPublishPreviewView."""

from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.test import Client

from sync.services.git_service import DivergedException, SyncPublishData

PUBLISH_URL = "/api/v1/sync/publish/"
FORCE_URL = "/api/v1/sync/force-publish/"
PREVIEW_URL = "/api/v1/sync/publish/preview/"
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


def _mock_svc(publish_result=None, force_result=None, publish_side_effect=None):
    """Return a mock GitSyncService with pre-configured publish/force_publish."""
    svc = MagicMock()
    if publish_side_effect is not None:
        svc.publish.side_effect = publish_side_effect
    else:
        svc.publish.return_value = publish_result
    svc.force_publish.return_value = force_result
    return svc


def test_publish_not_configured(auth_client: Client, db: None) -> None:
    resp = auth_client.post(PUBLISH_URL, {}, content_type="application/json")
    assert resp.status_code == 400
    assert resp.json()["error"] == "not_configured"


def test_publish_success(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    result = SyncPublishData(commit_sha="a" * 40, tables_exported=["finance_account"])
    svc = _mock_svc(publish_result=result)
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(PUBLISH_URL, {}, content_type="application/json")
    assert resp.status_code == 200
    assert resp.json()["status"] == "published"
    assert resp.json()["commit_sha"] == "a" * 40
    assert resp.json()["tables_exported"] == ["finance_account"]


def test_publish_up_to_date(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    svc = _mock_svc(publish_result=None)
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(PUBLISH_URL, {}, content_type="application/json")
    assert resp.status_code == 200
    assert resp.json()["status"] == "up_to_date"


def test_publish_diverged_returns_409(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    svc = _mock_svc(publish_side_effect=DivergedException("diverged"))
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(PUBLISH_URL, {}, content_type="application/json")
    assert resp.status_code == 409
    assert resp.json()["error"] == "diverged"


def test_force_publish_not_configured(auth_client: Client, db: None) -> None:
    resp = auth_client.post(FORCE_URL, {}, content_type="application/json")
    assert resp.status_code == 400


def test_force_publish_up_to_date(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    svc = _mock_svc(force_result=None)
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(FORCE_URL, {}, content_type="application/json")
    assert resp.status_code == 200
    assert resp.json()["status"] == "up_to_date"


def test_force_publish_success(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    result = SyncPublishData(commit_sha="b" * 40, tables_exported=["finance_account"])
    svc = MagicMock()
    svc.force_publish.return_value = result
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.post(FORCE_URL, {}, content_type="application/json")
    assert resp.status_code == 200
    assert resp.json()["status"] == "published"


# ── Publish Preview ───────────────────────────────────────────────────────────


def test_publish_preview_not_configured(auth_client: Client, db: None) -> None:
    resp = auth_client.get(PREVIEW_URL)
    assert resp.status_code == 400
    assert resp.json()["error"] == "not_configured"


def test_publish_preview_has_changes(auth_client: Client, db: None) -> None:
    from sync.services.git_service import PublishPreviewData

    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    changes = [
        {
            "table": "finance.account",
            "display_name": "Accounts",
            "added": 1,
            "modified": 0,
            "deleted": 0,
        }
    ]
    svc = MagicMock()
    svc.publish_preview.return_value = PublishPreviewData(
        base_commit="a" * 40, diff_digest="b" * 64, changes=changes
    )
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.get(PREVIEW_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "has_changes"
    assert body["changes"] == changes
    assert body["base_commit"] == "a" * 40
    assert body["diff_digest"] == "b" * 64


def test_publish_preview_up_to_date(auth_client: Client, db: None) -> None:
    auth_client.put("/api/v1/sync/config/", VALID_CONFIG, content_type="application/json")
    svc = MagicMock()
    svc.publish_preview.return_value = None
    with patch("sync.views._get_git_service", return_value=svc):
        resp = auth_client.get(PREVIEW_URL)
    assert resp.status_code == 200
    assert resp.json()["status"] == "up_to_date"
