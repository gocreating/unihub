"""Integration tests for Inventory scenario constraints (US4)."""

import json

import pytest

from tests.conftest import create_item

SCEN = "/api/v1/inventory/scenarios/"


def _scenario(client):
    return client.post(SCEN, json.dumps({"name": "Trip"}), content_type="application/json").json()


def _add(client, sid, item_id):
    return client.post(
        f"{SCEN}{sid}/items/", json.dumps({"item_id": item_id}), content_type="application/json"
    )


def _constraint(client, sid, **payload):
    return client.post(
        f"{SCEN}{sid}/constraints/", json.dumps(payload), content_type="application/json"
    )


def _violations(client, sid):
    return client.get(f"{SCEN}{sid}/checklist/").json()["violations"]


@pytest.mark.django_db
class TestConstraints:
    def test_mutual_exclusive_requires_two_items(self, auth_client):
        s = _scenario(auth_client)
        a = create_item(auth_client, name="A")
        resp = _constraint(
            auth_client, s["id"], constraint_type="mutual_exclusive", item_ids=[a["id"]]
        )
        assert resp.status_code == 400

    def test_weight_limit_requires_limit_value(self, auth_client):
        s = _scenario(auth_client)
        resp = _constraint(auth_client, s["id"], constraint_type="weight_limit")
        assert resp.status_code == 400

    def test_required_needs_at_least_one_item(self, auth_client):
        s = _scenario(auth_client)
        resp = _constraint(auth_client, s["id"], constraint_type="required")
        assert resp.status_code == 400

    def test_required_constraint_item_set_only(self, auth_client):
        s = _scenario(auth_client)
        required = create_item(auth_client, name="Charger")
        other = create_item(auth_client, name="Map")
        _add(auth_client, s["id"], other["id"])
        _constraint(auth_client, s["id"], constraint_type="required", item_ids=[required["id"]])
        violations = _violations(auth_client, s["id"])
        assert len(violations) == 1 and violations[0]["type"] == "required"
        # Selecting the required item clears it.
        _add(auth_client, s["id"], required["id"])
        assert _violations(auth_client, s["id"]) == []

    def test_mutual_exclusive_violation_flagged(self, auth_client):
        s = _scenario(auth_client)
        a = create_item(auth_client, name="Battery A")
        b = create_item(auth_client, name="Battery B")
        _add(auth_client, s["id"], a["id"])
        _add(auth_client, s["id"], b["id"])
        _constraint(
            auth_client, s["id"], constraint_type="mutual_exclusive", item_ids=[a["id"], b["id"]]
        )
        violations = _violations(auth_client, s["id"])
        assert len(violations) == 1
        assert set(violations[0]["offending_item_ids"]) == {a["id"], b["id"]}

    def test_weight_limit_overage_reports_amount(self, auth_client):
        s = _scenario(auth_client)
        heavy = create_item(auth_client, name="Anvil", weight={"value": "10", "unit": "kg"})
        _add(auth_client, s["id"], heavy["id"])
        # 10 kg = 10000 g; limit 8000 g → overage 2000 g.
        _constraint(auth_client, s["id"], constraint_type="weight_limit", limit_value="8000")
        violations = _violations(auth_client, s["id"])
        assert violations[0]["type"] == "weight_limit"
        assert violations[0]["overage"] == "2000.000"

    def test_all_constraints_satisfied_no_violations(self, auth_client):
        s = _scenario(auth_client)
        a = create_item(auth_client, name="Light", weight={"value": "1", "unit": "kg"})
        _add(auth_client, s["id"], a["id"])
        _constraint(auth_client, s["id"], constraint_type="weight_limit", limit_value="8000")
        _constraint(auth_client, s["id"], constraint_type="required", item_ids=[a["id"]])
        assert _violations(auth_client, s["id"]) == []
