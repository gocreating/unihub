"""Integration tests for Inventory scenario constraints (US4)."""

import pytest

ITEMS = "/api/v1/inventory/items/"
SCEN = "/api/v1/inventory/scenarios/"


def _item(client, name, category="", weight=None):
    payload = {"name": name, "item_type": "stockable"}
    if category:
        payload["category"] = category
    if weight is not None:
        payload["weight"] = weight
    return client.post(ITEMS, payload, content_type="application/json").json()


def _scenario(client):
    return client.post(SCEN, {"name": "Trip"}, content_type="application/json").json()


def _add(client, sid, item_id):
    return client.post(f"{SCEN}{sid}/items/", {"item_id": item_id}, content_type="application/json")


def _constraint(client, sid, **payload):
    return client.post(f"{SCEN}{sid}/constraints/", payload, content_type="application/json")


def _violations(client, sid):
    return client.get(f"{SCEN}{sid}/checklist/").json()["violations"]


@pytest.mark.django_db
class TestConstraints:
    def test_mutual_exclusive_requires_two_items(self, auth_client):
        s = _scenario(auth_client)
        a = _item(auth_client, "A")
        resp = _constraint(
            auth_client, s["id"], constraint_type="mutual_exclusive", item_ids=[a["id"]]
        )
        assert resp.status_code == 400

    def test_weight_limit_requires_limit_value(self, auth_client):
        s = _scenario(auth_client)
        resp = _constraint(auth_client, s["id"], constraint_type="weight_limit")
        assert resp.status_code == 400

    def test_required_needs_items_or_category(self, auth_client):
        s = _scenario(auth_client)
        resp = _constraint(auth_client, s["id"], constraint_type="required")
        assert resp.status_code == 400

    def test_mutual_exclusive_violation_flagged(self, auth_client):
        s = _scenario(auth_client)
        a = _item(auth_client, "Battery A")
        b = _item(auth_client, "Battery B")
        _add(auth_client, s["id"], a["id"])
        _add(auth_client, s["id"], b["id"])
        _constraint(
            auth_client,
            s["id"],
            constraint_type="mutual_exclusive",
            item_ids=[a["id"], b["id"]],
        )
        violations = _violations(auth_client, s["id"])
        assert len(violations) == 1
        assert violations[0]["type"] == "mutual_exclusive"
        assert set(violations[0]["offending_item_ids"]) == {a["id"], b["id"]}

    def test_required_constraint_unsatisfied_flagged(self, auth_client):
        s = _scenario(auth_client)
        required = _item(auth_client, "Charger", category="power")
        other = _item(auth_client, "Map")
        _add(auth_client, s["id"], other["id"])
        _constraint(auth_client, s["id"], constraint_type="required", item_ids=[required["id"]])
        violations = _violations(auth_client, s["id"])
        assert len(violations) == 1
        assert violations[0]["type"] == "required"

    def test_required_by_category_satisfied(self, auth_client):
        s = _scenario(auth_client)
        charger = _item(auth_client, "Charger", category="power")
        _add(auth_client, s["id"], charger["id"])
        _constraint(auth_client, s["id"], constraint_type="required", target_category="power")
        assert _violations(auth_client, s["id"]) == []

    def test_weight_limit_overage_reports_amount(self, auth_client):
        s = _scenario(auth_client)
        heavy = _item(auth_client, "Anvil", weight="10")
        _add(auth_client, s["id"], heavy["id"])
        _constraint(auth_client, s["id"], constraint_type="weight_limit", limit_value="8")
        violations = _violations(auth_client, s["id"])
        assert violations[0]["type"] == "weight_limit"
        assert violations[0]["overage"] == "2.000"

    def test_all_constraints_satisfied_no_violations(self, auth_client):
        s = _scenario(auth_client)
        a = _item(auth_client, "Light", weight="1")
        _add(auth_client, s["id"], a["id"])
        _constraint(auth_client, s["id"], constraint_type="weight_limit", limit_value="8")
        _constraint(auth_client, s["id"], constraint_type="required", item_ids=[a["id"]])
        assert _violations(auth_client, s["id"]) == []
