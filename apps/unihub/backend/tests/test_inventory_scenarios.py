"""Integration tests for Inventory scenarios (US3/US5, iteration 14).

Scenarios are name+description with a drag-organized packing tree; the
preparation checklist and constraints were removed in iteration 14.
"""

import json

import pytest

from tests.conftest import create_item

SCEN = "/api/v1/inventory/scenarios/"


def _item(client, name="Tent", quantity=None):
    fields = {"name": name}
    if quantity is not None:
        fields["quantity"] = quantity
    return create_item(client, **fields)


def _scenario(client, name="Camping", description=""):
    body = {"name": name}
    if description:
        body["description"] = description
    return client.post(SCEN, json.dumps(body), content_type="application/json").json()


def _add_item(client, scenario_id, item_id, **extra):
    payload = {"item_id": item_id}
    payload.update(extra)
    return client.post(
        f"{SCEN}{scenario_id}/items/", json.dumps(payload), content_type="application/json"
    )


def _move(client, scenario_id, line_id, container_id=None, index=0):
    return client.post(
        f"{SCEN}{scenario_id}/items/{line_id}/move/",
        json.dumps({"container_id": container_id, "index": index}),
        content_type="application/json",
    )


@pytest.mark.django_db
class TestScenarios:
    def test_create_scenario_requires_name(self, auth_client):
        resp = auth_client.post(SCEN, {}, content_type="application/json")
        assert resp.status_code == 400

    def test_scenario_description_round_trips(self, auth_client):
        s = _scenario(auth_client, name="Trip", description="Two weeks in Kyushu")
        fetched = auth_client.get(f"{SCEN}{s['id']}/").json()
        assert fetched["description"] == "Two weeks in Kyushu"
        auth_client.patch(
            f"{SCEN}{s['id']}/",
            json.dumps({"description": "Updated"}),
            content_type="application/json",
        )
        assert auth_client.get(f"{SCEN}{s['id']}/").json()["description"] == "Updated"

    def test_scenario_has_no_progress_fields(self, auth_client):
        s = _scenario(auth_client)
        fetched = auth_client.get(f"{SCEN}{s['id']}/").json()
        for gone in ("prepared_count", "outstanding_count", "complete", "notes"):
            assert gone not in fetched

    def test_add_scenario_item_duplicate_returns_400(self, auth_client):
        s = _scenario(auth_client)
        i = _item(auth_client)
        assert _add_item(auth_client, s["id"], i["id"]).status_code == 201
        assert _add_item(auth_client, s["id"], i["id"]).status_code == 400

    def test_scenario_item_has_display_order_not_prepared(self, auth_client):
        s = _scenario(auth_client)
        a = _add_item(auth_client, s["id"], _item(auth_client, "A")["id"]).json()
        b = _add_item(auth_client, s["id"], _item(auth_client, "B")["id"]).json()
        assert a["display_order"] == 0
        assert b["display_order"] == 1
        for gone in ("prepared", "required_quantity"):
            assert gone not in a

    def test_checklist_endpoint_removed(self, auth_client):
        s = _scenario(auth_client)
        assert auth_client.get(f"{SCEN}{s['id']}/checklist/").status_code == 404

    def test_constraint_endpoints_removed(self, auth_client):
        s = _scenario(auth_client)
        assert auth_client.get(f"{SCEN}{s['id']}/constraints/").status_code == 404


@pytest.mark.django_db
class TestScenarioItemMove:
    def _setup(self, auth_client):
        s = _scenario(auth_client)
        lines = [
            _add_item(auth_client, s["id"], _item(auth_client, n)["id"]).json()
            for n in ("A", "B", "C")
        ]
        return s, lines

    def _listed(self, auth_client, scenario_id):
        return auth_client.get(f"{SCEN}{scenario_id}/items/").json()

    def test_move_into_container_nests_and_orders(self, auth_client):
        s, (a, b, c) = self._setup(auth_client)
        resp = _move(auth_client, s["id"], b["id"], container_id=a["id"], index=0)
        assert resp.status_code == 200, resp.content
        moved = resp.json()
        assert moved["container"]["id"] == a["id"]
        assert moved["display_order"] == 0

    def test_move_reorders_siblings_densely(self, auth_client):
        s, (a, b, c) = self._setup(auth_client)
        # Move C to the front of the top level.
        assert _move(auth_client, s["id"], c["id"], container_id=None, index=0).status_code == 200
        by_name = {
            line["item"]["name"]: line["display_order"]
            for line in self._listed(auth_client, s["id"])
        }
        assert by_name == {"C": 0, "A": 1, "B": 2}

    def test_move_rejects_self_and_cycle(self, auth_client):
        s, (a, b, c) = self._setup(auth_client)
        assert _move(auth_client, s["id"], a["id"], container_id=a["id"]).status_code == 400
        assert _move(auth_client, s["id"], b["id"], container_id=a["id"]).status_code == 200
        # a → inside b (its own child) would create a cycle.
        assert _move(auth_client, s["id"], a["id"], container_id=b["id"]).status_code == 400

    def test_remove_line_reparents_children_to_top_level(self, auth_client):
        s, (a, b, c) = self._setup(auth_client)
        _move(auth_client, s["id"], b["id"], container_id=a["id"])
        assert auth_client.delete(f"{SCEN}{s['id']}/items/{a['id']}/").status_code == 204
        lines = self._listed(auth_client, s["id"])
        assert all(line["container"] is None for line in lines)
