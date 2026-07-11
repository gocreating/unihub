"""Integration tests for Inventory scenarios and checklists (US3)."""

import json

import pytest

from tests.conftest import create_item

SCEN = "/api/v1/inventory/scenarios/"


def _item(client, name="Tent", item_type="stockable", quantity=None):
    fields = {"name": name, "item_type": item_type}
    if quantity is not None:
        fields["quantity"] = quantity
    return create_item(client, **fields)


def _scenario(client, name="Camping"):
    return client.post(SCEN, json.dumps({"name": name}), content_type="application/json").json()


def _add_item(client, scenario_id, item_id, **extra):
    payload = {"item_id": item_id}
    payload.update(extra)
    return client.post(
        f"{SCEN}{scenario_id}/items/", json.dumps(payload), content_type="application/json"
    )


@pytest.mark.django_db
class TestScenarios:
    def test_create_scenario_requires_name(self, auth_client):
        resp = auth_client.post(SCEN, {}, content_type="application/json")
        assert resp.status_code == 400

    def test_add_scenario_item_duplicate_returns_400(self, auth_client):
        s = _scenario(auth_client)
        i = _item(auth_client)
        assert _add_item(auth_client, s["id"], i["id"]).status_code == 201
        assert _add_item(auth_client, s["id"], i["id"]).status_code == 400

    def test_toggle_prepared_updates_progress(self, auth_client):
        s = _scenario(auth_client)
        i = _item(auth_client)
        line = _add_item(auth_client, s["id"], i["id"]).json()
        auth_client.patch(
            f"{SCEN}{s['id']}/items/{line['id']}/",
            {"prepared": True},
            content_type="application/json",
        )
        checklist = auth_client.get(f"{SCEN}{s['id']}/checklist/").json()
        assert checklist["progress"]["prepared_count"] == 1
        assert checklist["progress"]["outstanding_count"] == 0

    def test_checklist_complete_when_all_prepared(self, auth_client):
        s = _scenario(auth_client)
        i = _item(auth_client)
        line = _add_item(auth_client, s["id"], i["id"]).json()
        auth_client.patch(
            f"{SCEN}{s['id']}/items/{line['id']}/",
            {"prepared": True},
            content_type="application/json",
        )
        assert auth_client.get(f"{SCEN}{s['id']}/checklist/").json()["progress"]["complete"] is True

    def test_checklist_reports_consumable_shortfall(self, auth_client):
        s = _scenario(auth_client)
        i = _item(auth_client, name="Batteries", item_type="consumable", quantity="1")
        _add_item(auth_client, s["id"], i["id"], required_quantity="3")
        checklist = auth_client.get(f"{SCEN}{s['id']}/checklist/").json()
        assert checklist["lines"][0]["shortfall"] == "2.0000"

    def test_empty_scenario_checklist_returns_empty(self, auth_client):
        s = _scenario(auth_client)
        checklist = auth_client.get(f"{SCEN}{s['id']}/checklist/").json()
        assert checklist["progress"]["total"] == 0
        assert checklist["lines"] == []
        assert checklist["violations"] == []
