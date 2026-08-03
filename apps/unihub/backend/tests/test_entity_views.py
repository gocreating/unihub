"""Entity views API — TDD suite for /api/v1/core/entity-views/ (016-entity-views).

Contract: specs/016-entity-views/contracts/entity-views-api.md
"""

import json

import pytest
from django.contrib.auth.models import User
from django.test import Client

VIEWS = "/api/v1/core/entity-views/"
REORDER = "/api/v1/core/entity-views/reorder/"

SAMPLE_CONFIG = {
    "filters": [
        {
            "logic": "and",
            "conditions": [{"attr": "obtained_at", "op": "gte", "val": "2026-01-01"}],
        }
    ],
    "sort": [{"field": "acquisition__obtained_at", "direction": "desc", "nulls": "first"}],
    "columns": [{"key": "name", "visible": True, "order": 0}],
    "stickyLeft": True,
    "stickyRight": False,
    "pageSize": 50,
}


@pytest.fixture
def owner_client(db):
    """Authenticated client for the view owner."""
    user = User.objects.create_user(username="views_owner", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.fixture
def other_client(db):
    """Authenticated client for a DIFFERENT user (owner-scoping checks)."""
    user = User.objects.create_user(username="views_other", password="testpass")
    c = Client()
    c.force_login(user)
    return c


def create_view(client, **overrides) -> dict:
    payload = {
        "table_key": "inventory-catalog",
        "name": "My view",
        "config": SAMPLE_CONFIG,
    }
    payload.update(overrides)
    resp = client.post(VIEWS, json.dumps(payload), content_type="application/json")
    assert resp.status_code == 201, resp.content
    return resp.json()


def test_list_requires_auth(db):
    resp = Client().get(VIEWS)
    assert resp.status_code == 403


def test_create_and_list_scoped_by_table_key(owner_client):
    create_view(owner_client, table_key="inventory-catalog", name="Catalog A")
    create_view(owner_client, table_key="finance-accounts", name="Accounts A")

    resp = owner_client.get(VIEWS, {"table_key": "inventory-catalog"})
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)  # no pagination envelope
    assert [v["name"] for v in body] == ["Catalog A"]

    resp_all = owner_client.get(VIEWS)
    assert resp_all.status_code == 200
    assert {v["name"] for v in resp_all.json()} == {"Catalog A", "Accounts A"}
    assert all("owner" not in v for v in resp_all.json())


def test_owner_scoping(owner_client, other_client):
    view = create_view(owner_client)

    assert other_client.get(VIEWS).json() == []
    assert other_client.get(f"{VIEWS}{view['id']}/").status_code == 404
    patch = other_client.patch(
        f"{VIEWS}{view['id']}/",
        json.dumps({"name": "hijack"}),
        content_type="application/json",
    )
    assert patch.status_code == 404
    assert other_client.delete(f"{VIEWS}{view['id']}/").status_code == 404


def test_create_missing_name(owner_client):
    resp = owner_client.post(
        VIEWS,
        json.dumps({"table_key": "inventory-catalog", "config": SAMPLE_CONFIG}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "name" in resp.json()

    blank = owner_client.post(
        VIEWS,
        json.dumps({"table_key": "inventory-catalog", "name": "   ", "config": SAMPLE_CONFIG}),
        content_type="application/json",
    )
    assert blank.status_code == 400


def test_create_duplicate_name_same_table(owner_client, other_client):
    create_view(owner_client, name="Dup")

    resp = owner_client.post(
        VIEWS,
        json.dumps({"table_key": "inventory-catalog", "name": "Dup", "config": SAMPLE_CONFIG}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "name" in resp.json()

    # Same name on a DIFFERENT table is fine.
    create_view(owner_client, table_key="finance-accounts", name="Dup")
    # Same name for a DIFFERENT user is fine.
    create_view(other_client, name="Dup")


def test_config_must_be_object(owner_client):
    for bad in ["a string", ["list"], 42]:
        resp = owner_client.post(
            VIEWS,
            json.dumps({"table_key": "inventory-catalog", "name": f"bad-{bad}", "config": bad}),
            content_type="application/json",
        )
        assert resp.status_code == 400, resp.content
        assert "config" in resp.json()

    # Deep shape is deliberately NOT validated (forgiving contract).
    create_view(owner_client, name="loose", config={"anything": {"goes": True}})


def test_patch_rename_pin_position(owner_client):
    view = create_view(owner_client, name="Original")
    create_view(owner_client, name="Taken")

    ok = owner_client.patch(
        f"{VIEWS}{view['id']}/",
        json.dumps({"name": "Renamed", "pinned": True, "position": 5}),
        content_type="application/json",
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["name"] == "Renamed"
    assert body["pinned"] is True
    assert body["position"] == 5

    collision = owner_client.patch(
        f"{VIEWS}{view['id']}/",
        json.dumps({"name": "Taken"}),
        content_type="application/json",
    )
    assert collision.status_code == 400

    moved = owner_client.patch(
        f"{VIEWS}{view['id']}/",
        json.dumps({"table_key": "finance-accounts"}),
        content_type="application/json",
    )
    assert moved.status_code == 400


def test_delete(owner_client):
    view = create_view(owner_client)
    assert owner_client.delete(f"{VIEWS}{view['id']}/").status_code == 204
    assert owner_client.delete(f"{VIEWS}{view['id']}/").status_code == 404


def test_reorder_happy_path(owner_client):
    a = create_view(owner_client, name="A")
    b = create_view(owner_client, name="B")
    c = create_view(owner_client, name="C")

    resp = owner_client.post(
        REORDER,
        json.dumps({"table_key": "inventory-catalog", "ids": [c["id"], a["id"], b["id"]]}),
        content_type="application/json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert [v["name"] for v in body] == ["C", "A", "B"]
    assert [v["position"] for v in body] == [0, 1, 2]


def test_reorder_rejects_foreign_or_mixed_ids(owner_client, other_client):
    mine = create_view(owner_client, name="Mine")
    theirs = create_view(other_client, name="Theirs")
    other_table = create_view(owner_client, table_key="finance-accounts", name="Elsewhere")

    foreign = owner_client.post(
        REORDER,
        json.dumps({"table_key": "inventory-catalog", "ids": [mine["id"], theirs["id"]]}),
        content_type="application/json",
    )
    assert foreign.status_code == 400

    mixed = owner_client.post(
        REORDER,
        json.dumps({"table_key": "inventory-catalog", "ids": [mine["id"], other_table["id"]]}),
        content_type="application/json",
    )
    assert mixed.status_code == 400

    dup = owner_client.post(
        REORDER,
        json.dumps({"table_key": "inventory-catalog", "ids": [mine["id"], mine["id"]]}),
        content_type="application/json",
    )
    assert dup.status_code == 400

    missing = owner_client.post(
        REORDER,
        json.dumps({"ids": [mine["id"]]}),
        content_type="application/json",
    )
    assert missing.status_code == 400


def test_position_appended_on_create(owner_client):
    a = create_view(owner_client, name="First")
    b = create_view(owner_client, name="Second")
    assert a["position"] == 0
    assert b["position"] == 1

    # Explicit position wins.
    c = create_view(owner_client, name="Explicit", position=9)
    assert c["position"] == 9

    # Appending continues after the max.
    d = create_view(owner_client, name="AfterMax")
    assert d["position"] == 10


# ---------------------------------------------------------------------------
# Round 2 (2026-07-23): the default view is a plain, materializable view.
# ---------------------------------------------------------------------------


def test_create_default_view(owner_client, other_client):
    default = create_view(owner_client, name="YTD", is_default=True, pinned=True)
    assert default["is_default"] is True

    second = owner_client.post(
        VIEWS,
        json.dumps(
            {
                "table_key": "inventory-catalog",
                "name": "Another default",
                "config": SAMPLE_CONFIG,
                "is_default": True,
            }
        ),
        content_type="application/json",
    )
    assert second.status_code == 400

    # A default on a DIFFERENT table is fine; so is another user's default.
    create_view(owner_client, table_key="finance-accounts", name="Table", is_default=True)
    create_view(other_client, name="YTD", is_default=True)

    # Plain views still default to is_default=False.
    plain = create_view(owner_client, name="Plain")
    assert plain["is_default"] is False


def test_delete_default_view_rejected(owner_client):
    default = create_view(owner_client, name="YTD", is_default=True)
    plain = create_view(owner_client, name="Extra")

    resp = owner_client.delete(f"{VIEWS}{default['id']}/")
    assert resp.status_code == 400

    assert owner_client.delete(f"{VIEWS}{plain['id']}/").status_code == 204
    assert owner_client.get(f"{VIEWS}{default['id']}/").status_code == 200


def test_config_migration_sticky_to_pins():
    """Migration 0006 rewrites v1 sticky booleans into per-column pins."""
    import importlib

    migration = importlib.import_module("core.migrations.0006_entityview_is_default")

    v1 = {
        "filters": [],
        "sort": [],
        "columns": [
            {"key": "hidden", "visible": False, "order": 0},
            {"key": "a", "visible": True, "order": 1},
            {"key": "b", "visible": True, "order": 2},
            {"key": "c", "visible": True, "order": 3},
        ],
        "stickyLeft": True,
        "stickyRight": True,
        "pageSize": 50,
    }
    out = migration.migrate_config(v1)
    assert "stickyLeft" not in out and "stickyRight" not in out
    by_key = {c["key"]: c for c in out["columns"]}
    assert by_key["a"].get("pin") == "left"  # first VISIBLE by order (hidden skipped)
    assert by_key["c"].get("pin") == "right"  # last visible
    assert "pin" not in by_key["hidden"] and "pin" not in by_key["b"]
    assert out["pageSize"] == 50

    # Already-v2 configs pass through unchanged (idempotent).
    assert migration.migrate_config(out) == out

    # stickyLeft-only variant: no right pin appears anywhere.
    left_only = dict(v1, stickyRight=False)
    left_out = migration.migrate_config(left_only)
    assert all(c.get("pin") != "right" for c in left_out["columns"])
    assert {c["key"]: c.get("pin") for c in left_out["columns"]}["a"] == "left"

    # Foreign shapes are left alone rather than corrupted.
    assert migration.migrate_config({"anything": {"goes": True}}) == {"anything": {"goes": True}}


# ---------------------------------------------------------------------------
# Round 3 (2026-08-03): the default role is TRANSFERABLE (FR-026, R25).
# Contract: specs/016-entity-views/contracts/entity-views-api.md tests 20-28.
# ---------------------------------------------------------------------------


def _set_default(client, view_id: str, value: bool = True):
    return client.patch(
        f"{VIEWS}{view_id}/",
        json.dumps({"is_default": value}),
        content_type="application/json",
    )


def _defaults(client, table_key: str = "inventory-catalog") -> list[dict]:
    resp = client.get(VIEWS, {"table_key": table_key})
    assert resp.status_code == 200
    return [v for v in resp.json() if v["is_default"]]


class TestDefaultTransfer:
    """PATCH {is_default: true} moves the role atomically to the target view."""

    def test_promote_transfers_role(self, owner_client):
        holder = create_view(owner_client, name="YTD", is_default=True, pinned=True)
        other = create_view(owner_client, name="Everything")

        resp = _set_default(owner_client, other["id"])
        assert resp.status_code == 200, resp.content
        assert resp.json()["is_default"] is True

        defaults = _defaults(owner_client)
        assert [v["id"] for v in defaults] == [other["id"]]
        assert owner_client.get(f"{VIEWS}{holder['id']}/").json()["is_default"] is False

    def test_promote_forces_pinned(self, owner_client):
        create_view(owner_client, name="YTD", is_default=True, pinned=True)
        other = create_view(owner_client, name="Everything", pinned=False)

        resp = _set_default(owner_client, other["id"])
        assert resp.status_code == 200, resp.content
        assert resp.json()["pinned"] is True

    def test_demoted_view_keeps_pin_position_and_config(self, owner_client):
        holder = create_view(owner_client, name="YTD", is_default=True, pinned=True)
        other = create_view(owner_client, name="Everything")

        assert _set_default(owner_client, other["id"]).status_code == 200

        demoted = owner_client.get(f"{VIEWS}{holder['id']}/").json()
        assert demoted["pinned"] == holder["pinned"]
        assert demoted["position"] == holder["position"]
        assert demoted["name"] == holder["name"]
        assert demoted["config"] == holder["config"]

    def test_promote_does_not_reorder(self, owner_client):
        holder = create_view(owner_client, name="YTD", is_default=True, position=0)
        other = create_view(owner_client, name="Everything", position=5)

        assert _set_default(owner_client, other["id"]).status_code == 200

        assert owner_client.get(f"{VIEWS}{holder['id']}/").json()["position"] == 0
        assert owner_client.get(f"{VIEWS}{other['id']}/").json()["position"] == 5

    def test_cannot_unset_default(self, owner_client):
        holder = create_view(owner_client, name="YTD", is_default=True)

        resp = _set_default(owner_client, holder["id"], value=False)
        assert resp.status_code == 400
        assert "is_default" in resp.json()
        assert [v["id"] for v in _defaults(owner_client)] == [holder["id"]]

    def test_promote_when_no_default_exists(self, owner_client):
        """The page default may still be virtual — nothing to demote."""
        plain = create_view(owner_client, name="Everything")

        resp = _set_default(owner_client, plain["id"])
        assert resp.status_code == 200, resp.content
        assert [v["id"] for v in _defaults(owner_client)] == [plain["id"]]

    def test_promote_is_idempotent(self, owner_client):
        holder = create_view(owner_client, name="YTD", is_default=True)

        resp = owner_client.patch(
            f"{VIEWS}{holder['id']}/",
            json.dumps({"is_default": True, "name": "My YTD"}),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["name"] == "My YTD"
        assert [v["id"] for v in _defaults(owner_client)] == [holder["id"]]

    def test_delete_guard_follows_the_role(self, owner_client):
        holder = create_view(owner_client, name="YTD", is_default=True)
        other = create_view(owner_client, name="Everything")

        assert _set_default(owner_client, other["id"]).status_code == 200

        # The demoted view is deletable; the promoted one is not.
        assert owner_client.delete(f"{VIEWS}{other['id']}/").status_code == 400
        assert owner_client.delete(f"{VIEWS}{holder['id']}/").status_code == 204

    def test_transfer_never_violates_the_unique_constraint(self, owner_client):
        """Clear-then-set inside one transaction — no IntegrityError leaks out."""
        first = create_view(owner_client, name="YTD", is_default=True)
        second = create_view(owner_client, name="Everything")
        third = create_view(owner_client, name="Missing prices")

        for target in (second, third, first):
            resp = _set_default(owner_client, target["id"])
            assert resp.status_code == 200, resp.content
            assert len(_defaults(owner_client)) == 1

    def test_transfer_is_scoped_per_table_and_owner(self, owner_client, other_client):
        catalog_default = create_view(owner_client, name="YTD", is_default=True)
        accounts_default = create_view(
            owner_client, table_key="finance-accounts", name="Table", is_default=True
        )
        foreign_default = create_view(other_client, name="YTD", is_default=True)
        promote_me = create_view(owner_client, name="Everything")

        assert _set_default(owner_client, promote_me["id"]).status_code == 200

        # Only the same (owner, table_key) incumbent is demoted.
        assert owner_client.get(f"{VIEWS}{catalog_default['id']}/").json()["is_default"] is False
        assert owner_client.get(f"{VIEWS}{accounts_default['id']}/").json()["is_default"] is True
        assert other_client.get(f"{VIEWS}{foreign_default['id']}/").json()["is_default"] is True
