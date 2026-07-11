"""Integration tests for Inventory scenario containment / packing (US5)."""

import pytest

ITEMS = "/api/v1/inventory/items/"
SCEN = "/api/v1/inventory/scenarios/"


def _item(client, name):
    return client.post(
        ITEMS, {"name": name, "item_type": "stockable"}, content_type="application/json"
    ).json()


def _scenario(client, name="Trip"):
    return client.post(SCEN, {"name": name}, content_type="application/json").json()


def _add(client, sid, item_id):
    return client.post(
        f"{SCEN}{sid}/items/", {"item_id": item_id}, content_type="application/json"
    ).json()


def _set_container(client, sid, line_id, container_id):
    return client.patch(
        f"{SCEN}{sid}/items/{line_id}/",
        {"container_id": container_id},
        content_type="application/json",
    )


@pytest.mark.django_db
class TestContainment:
    def test_set_container_nests_item(self, auth_client):
        s = _scenario(auth_client)
        bag = _add(auth_client, s["id"], _item(auth_client, "Backpack")["id"])
        cam = _add(auth_client, s["id"], _item(auth_client, "Camera")["id"])
        resp = _set_container(auth_client, s["id"], cam["id"], bag["id"])
        assert resp.status_code == 200
        assert resp.json()["container"]["id"] == bag["id"]

    def test_set_container_self_reference_returns_400(self, auth_client):
        s = _scenario(auth_client)
        bag = _add(auth_client, s["id"], _item(auth_client, "Backpack")["id"])
        resp = _set_container(auth_client, s["id"], bag["id"], bag["id"])
        assert resp.status_code == 400

    def test_set_container_rejects_cycle(self, auth_client):
        s = _scenario(auth_client)
        a = _add(auth_client, s["id"], _item(auth_client, "A")["id"])
        b = _add(auth_client, s["id"], _item(auth_client, "B")["id"])
        _set_container(auth_client, s["id"], b["id"], a["id"])  # B in A
        resp = _set_container(auth_client, s["id"], a["id"], b["id"])  # A in B -> cycle
        assert resp.status_code == 400

    def test_set_container_cross_scenario_returns_400(self, auth_client):
        s1 = _scenario(auth_client, "S1")
        s2 = _scenario(auth_client, "S2")
        line1 = _add(auth_client, s1["id"], _item(auth_client, "A")["id"])
        line2 = _add(auth_client, s2["id"], _item(auth_client, "B")["id"])
        resp = _set_container(auth_client, s2["id"], line2["id"], line1["id"])
        assert resp.status_code == 400

    def test_delete_container_line_resets_children_to_top_level(self, auth_client):
        s = _scenario(auth_client)
        bag = _add(auth_client, s["id"], _item(auth_client, "Backpack")["id"])
        cam = _add(auth_client, s["id"], _item(auth_client, "Camera")["id"])
        _set_container(auth_client, s["id"], cam["id"], bag["id"])
        auth_client.delete(f"{SCEN}{s['id']}/items/{bag['id']}/")
        checklist = auth_client.get(f"{SCEN}{s['id']}/checklist/").json()
        cam_line = next(line for line in checklist["lines"] if line["id"] == cam["id"])
        assert cam_line["container"] is None

    def test_checklist_line_reports_container(self, auth_client):
        s = _scenario(auth_client)
        bag = _add(auth_client, s["id"], _item(auth_client, "Backpack")["id"])
        cam = _add(auth_client, s["id"], _item(auth_client, "Camera")["id"])
        _set_container(auth_client, s["id"], cam["id"], bag["id"])
        checklist = auth_client.get(f"{SCEN}{s['id']}/checklist/").json()
        cam_line = next(line for line in checklist["lines"] if line["id"] == cam["id"])
        assert cam_line["container"]["item_name"] == "Backpack"
