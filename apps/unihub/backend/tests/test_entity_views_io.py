"""EntityView data_io export/import + git-sync round trip (016 round 2).

Contract: specs/016-entity-views/contracts/entity-views-api.md §data_io/git-sync.
The owner column is NEVER serialized; imports stamp the acting user (FR-024);
a publish → wipe → checkout round trip restores views verbatim (SC-008).
"""

from __future__ import annotations

import csv
import io
import subprocess
from pathlib import Path

import pytest
from django.contrib.auth.models import User
from django.test import Client

from core.models import EntityView

pytestmark = pytest.mark.django_db

CONFIG = {
    "filters": [],
    "sort": [{"field": "name", "direction": "asc"}],
    "columns": [
        {"key": "name", "visible": True, "order": 0, "pin": "left"},
        {"key": "spec", "visible": True, "order": 1},
    ],
    "pageSize": 50,
}


def _make_view(owner: User, **overrides) -> EntityView:
    fields = {
        "owner": owner,
        "table_key": "inventory-catalog",
        "name": "YTD",
        "config": CONFIG,
        "pinned": True,
        "position": 0,
        "is_default": True,
    }
    fields.update(overrides)
    return EntityView.objects.create(**fields)


def _descriptor():
    from data_io.registry import get_table

    return get_table("core.entityview")


def test_export_excludes_owner_column():
    user = User.objects.create_user(username="io_owner", password="x")
    _make_view(user)

    text = _export_text()
    headers = next(csv.reader(io.StringIO(text)))
    bare = [h.split(":")[0] for h in headers]

    assert "owner" not in bare
    assert "owner_id" not in bare
    for expected in [
        "id",
        "table_key",
        "name",
        "config",
        "pinned",
        "position",
        "is_default",
        "created_at",
        "updated_at",
    ]:
        assert expected in bare, f"missing column {expected}: {bare}"


def _export_text() -> str:
    from data_io.services.csv_exporter import export_table

    return export_table(_descriptor()).decode("utf-8")


def test_import_stamps_acting_user():
    from data_io.services.change_preview import apply_diff, compute_diff
    from data_io.services.csv_importer import parse_csv

    exporter = User.objects.create_user(username="io_exporter", password="x")
    original = _make_view(exporter)
    text = _export_text()

    EntityView.objects.all().delete()
    importer = User.objects.create_user(username="io_importer", password="x")

    parsed, errors = parse_csv(text, _descriptor())
    assert errors == []
    diff = compute_diff(parsed, _descriptor(), mode="replace")
    apply_diff(diff, _descriptor(), mode="replace", acting_user=importer)

    restored = EntityView.objects.get(pk=original.pk)
    assert restored.owner == importer
    assert restored.name == "YTD"
    assert restored.table_key == "inventory-catalog"
    assert restored.config == CONFIG
    assert restored.pinned is True
    assert restored.is_default is True


def test_import_without_acting_user_errors():
    from data_io.services.change_preview import apply_diff, compute_diff
    from data_io.services.csv_importer import parse_csv

    user = User.objects.create_user(username="io_owner2", password="x")
    _make_view(user)
    text = _export_text()
    EntityView.objects.all().delete()

    parsed, errors = parse_csv(text, _descriptor())
    assert errors == []
    diff = compute_diff(parsed, _descriptor(), mode="replace")
    with pytest.raises(ValueError, match="acting user"):
        apply_diff(diff, _descriptor(), mode="replace")
    assert EntityView.objects.count() == 0


@pytest.fixture
def sync_configured(bare_repo: dict, settings, tmp_path: Path) -> dict:
    from sync.models import SyncConfig
    from sync.services.crypto import encrypt_pat
    from sync.services.git_service import GitSyncService

    settings.SYNC_REPO_DIR = tmp_path / "server_clone"
    config = SyncConfig.objects.create(
        repo_url=bare_repo["repo_url"],
        pat_encrypted=encrypt_pat("dummy"),
    )
    seeder = GitSyncService(
        repo_url=bare_repo["repo_url"],
        pat=bare_repo["pat"],
        clone_dir=tmp_path / "seed_clone",
    )
    return {"config": config, "seeder": seeder, **bare_repo}


def test_sync_round_trip_preserves_views(sync_configured: dict) -> None:
    user = User.objects.create_user(username="sync_views_owner", password="testpass")
    client = Client()
    client.force_login(user)

    _make_view(user)
    _make_view(user, name="Extra", is_default=False, pinned=False, position=1)

    seeder = sync_configured["seeder"]
    seeder.publish()
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(seeder.clone_dir),
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    EntityView.objects.all().delete()

    preview = client.get("/api/v1/sync/checkout/preview/", {"commit": commit}).json()
    assert preview["status"] == "has_changes"
    view_tables = [ch for ch in preview["changes"] if ch["table"] == "core.entityview"]
    assert len(view_tables) == 1
    assert view_tables[0]["added"] == 2

    confirm = client.post(
        "/api/v1/sync/checkout/confirm/",
        {"commit": commit, "diff_digest": preview["diff_digest"], "excluded": []},
        content_type="application/json",
    )
    assert confirm.status_code == 200, confirm.content

    restored = {v.name: v for v in EntityView.objects.all()}
    assert set(restored) == {"YTD", "Extra"}
    assert all(v.owner == user for v in restored.values())
    assert restored["YTD"].is_default is True
    assert restored["YTD"].pinned is True
    assert restored["YTD"].config == CONFIG
    assert restored["Extra"].position == 1

    # Owner is never serialized, so a fresh publish preview shows ZERO diffs —
    # the phantom-diff class from the 015 sync incident cannot occur.
    assert seeder.publish_preview() is None
