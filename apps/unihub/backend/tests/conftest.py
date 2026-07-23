"""Shared pytest fixtures and helpers for the test suite."""

import subprocess
from pathlib import Path

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


# --- shared git fixtures (used by tests/sync/ and tests/test_entity_views_io.py) ---


@pytest.fixture
def bare_repo(tmp_path: Path) -> dict:
    """Create a local bare git repository + a working clone for testing.

    Returns a dict with:
        remote: Path to the bare repo (acts as the "GitHub" remote)
        clone: Path to a working clone of the bare repo
        repo_url: file:// URL pointing to the bare repo
        pat: dummy PAT (unused by file:// transport but required by service)
    """
    remote = tmp_path / "remote.git"
    remote.mkdir()
    subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)

    clone = tmp_path / "clone"
    clone.mkdir()
    subprocess.run(["git", "clone", str(remote), str(clone)], check=True, capture_output=True)

    # Configure git identity in the clone so commits work
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        check=True,
        capture_output=True,
        cwd=str(clone),
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"], check=True, capture_output=True, cwd=str(clone)
    )

    # Seed with an initial commit so there is a HEAD
    (clone / "README.md").write_text("init")
    subprocess.run(["git", "add", "."], check=True, capture_output=True, cwd=str(clone))
    subprocess.run(["git", "commit", "-m", "init"], check=True, capture_output=True, cwd=str(clone))
    subprocess.run(
        ["git", "push", "origin", "HEAD"], check=True, capture_output=True, cwd=str(clone)
    )

    return {
        "remote": remote,
        "clone": clone,
        "repo_url": f"file://{remote}",
        "pat": "dummy-pat",
    }
