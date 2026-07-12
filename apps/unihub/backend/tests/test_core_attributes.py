"""Iteration 14: core attribute extensions — dimension type, canonical numeric,
system-definition protection, and attr:<id> filtering/ordering."""

import json
from urllib.parse import quote

import pytest
from django.contrib.contenttypes.models import ContentType

from core.models import AttributeDefinition, AttributeValue
from tests.conftest import create_item

DEFS = "/api/v1/core/attribute-definitions/"
UPSERT = "/api/v1/core/attribute-values/bulk-upsert/"
ITEMS = "/api/v1/inventory/items/"


def _item_ct() -> ContentType:
    return ContentType.objects.get(app_label="inventory", model="item")


def _make_def(name, data_type, unit_family="", is_system=False, options=None):
    return AttributeDefinition.objects.create(
        content_type=_item_ct(),
        name=name,
        data_type=data_type,
        unit_family=unit_family,
        is_system=is_system,
        options=options or [],
    )


def _upsert(client, item_id, definition, value, unit=None):
    attr = {"attribute_definition_id": definition.id, "value": value}
    if unit is not None:
        attr["unit"] = unit
    return client.post(
        UPSERT,
        json.dumps({"content_type": "inventory.item", "object_id": item_id, "attributes": [attr]}),
        content_type="application/json",
    )


@pytest.mark.django_db
class TestDimensionDefinitions:
    def test_create_dimension_definition_requires_unit_family(self, auth_client):
        body = {"content_type": _item_ct().id, "name": "depth", "data_type": "dimension"}
        resp = auth_client.post(DEFS, json.dumps(body), content_type="application/json")
        assert resp.status_code == 400

        body["unit_family"] = "length"
        resp = auth_client.post(DEFS, json.dumps(body), content_type="application/json")
        assert resp.status_code == 201, resp.content
        assert resp.json()["unit_family"] == "length"

    def test_non_dimension_definition_rejects_unit_family(self, auth_client):
        body = {
            "content_type": _item_ct().id,
            "name": "brand",
            "data_type": "text",
            "unit_family": "weight",
        }
        resp = auth_client.post(DEFS, json.dumps(body), content_type="application/json")
        assert resp.status_code == 400


@pytest.mark.django_db
class TestValueCanonicalisation:
    def test_dimension_value_stores_canonical_number(self, auth_client):
        d = _make_def("heft", "dimension", unit_family="weight")
        item = create_item(auth_client, name="W")
        resp = _upsert(auth_client, item["id"], d, "1.5", unit="kg")
        assert resp.status_code == 200, resp.content
        stored = AttributeValue.objects.get(attribute_definition=d, object_id=item["id"])
        assert stored.value == "1.5"
        assert stored.value_unit == "kg"
        assert stored.value_number == pytest.approx(1500)

    def test_dimension_value_rejects_unit_outside_family(self, auth_client):
        d = _make_def("heft2", "dimension", unit_family="weight")
        item = create_item(auth_client, name="W2")
        assert _upsert(auth_client, item["id"], d, "1.5", unit="cm").status_code == 400

    def test_numeric_value_stores_number_and_rejects_garbage(self, auth_client):
        d = _make_def("capacity", "number")
        item = create_item(auth_client, name="N")
        assert _upsert(auth_client, item["id"], d, "42.5").status_code == 200
        stored = AttributeValue.objects.get(attribute_definition=d, object_id=item["id"])
        assert stored.value_number == pytest.approx(42.5)
        assert _upsert(auth_client, item["id"], d, "not-a-number").status_code == 400

    def test_select_value_must_be_in_options(self, auth_client):
        d = _make_def("grade", "single_select", options=["A", "B"])
        item = create_item(auth_client, name="S")
        assert _upsert(auth_client, item["id"], d, "A").status_code == 200
        assert _upsert(auth_client, item["id"], d, "Z").status_code == 400


@pytest.mark.django_db
class TestSystemDefinitionProtection:
    def test_system_definition_rename_and_retype_blocked(self, auth_client):
        d = _make_def("weightx", "dimension", unit_family="weight", is_system=True)
        for body in ({"name": "mass"}, {"data_type": "text"}, {"unit_family": "length"}):
            resp = auth_client.patch(
                f"{DEFS}{d.id}/", json.dumps(body), content_type="application/json"
            )
            assert resp.status_code == 400, body
        # display_order is still adjustable.
        resp = auth_client.patch(
            f"{DEFS}{d.id}/", json.dumps({"display_order": 5}), content_type="application/json"
        )
        assert resp.status_code == 200

    def test_user_definition_delete_confirm_flow_intact(self, auth_client):
        d = _make_def("temp", "text")
        item = create_item(auth_client, name="D")
        _upsert(auth_client, item["id"], d, "x")
        resp = auth_client.delete(f"{DEFS}{d.id}/")
        assert resp.status_code == 400
        assert resp.json()["affected_entity_count"] == 1
        assert auth_client.delete(f"{DEFS}{d.id}/?confirm=true").status_code == 204


@pytest.mark.django_db
class TestAttributeFilterAndOrdering:
    """attr:<definition_id> keys on ItemViewSet (attribute_content_type opt-in)."""

    def _seed(self, auth_client):
        num = _make_def("capacity", "number")
        txt = _make_def("brand", "text")
        a = create_item(auth_client, name="AttrA")
        b = create_item(auth_client, name="AttrB")
        c = create_item(auth_client, name="AttrC")  # no attribute values
        _upsert(auth_client, a["id"], num, "10")
        _upsert(auth_client, b["id"], num, "2")
        _upsert(auth_client, a["id"], txt, "Acme")
        return num, txt, a, b, c

    def _names(self, resp):
        return [r["name"] for r in resp.json()["results"] if r["name"].startswith("Attr")]

    def test_numeric_attr_filter(self, auth_client):
        num, _txt, a, _b, _c = self._seed(auth_client)
        filters = quote(
            json.dumps(
                {"groups": [{"conditions": [{"attr": f"attr:{num.id}", "op": "gt", "val": "5"}]}]}
            )
        )
        resp = auth_client.get(f"{ITEMS}?filters={filters}")
        assert resp.status_code == 200
        assert self._names(resp) == ["AttrA"]

    def test_text_attr_filter(self, auth_client):
        _num, txt, a, _b, _c = self._seed(auth_client)
        filters = quote(
            json.dumps(
                {
                    "groups": [
                        {"conditions": [{"attr": f"attr:{txt.id}", "op": "contains", "val": "acm"}]}
                    ]
                }
            )
        )
        resp = auth_client.get(f"{ITEMS}?filters={filters}")
        assert self._names(resp) == ["AttrA"]

    def test_attr_ordering_with_nulls_suffixes(self, auth_client):
        num, _txt, _a, _b, _c = self._seed(auth_client)
        asc = auth_client.get(f"{ITEMS}?ordering=attr:{num.id}__nullslast")
        assert self._names(asc) == ["AttrB", "AttrA", "AttrC"]
        first = auth_client.get(f"{ITEMS}?ordering=attr:{num.id}__nullsfirst")
        assert self._names(first)[0] == "AttrC"
        desc = auth_client.get(f"{ITEMS}?ordering=-attr:{num.id}__nullslast")
        assert self._names(desc) == ["AttrA", "AttrB", "AttrC"]

    def test_unknown_attr_key_silently_skipped(self, auth_client):
        self._seed(auth_client)
        filters = quote(
            json.dumps(
                {
                    "groups": [
                        {"conditions": [{"attr": "attr:zzzzzzzzzzzz", "op": "gt", "val": "1"}]}
                    ]
                }
            )
        )
        resp = auth_client.get(f"{ITEMS}?filters={filters}")
        assert resp.status_code == 200
        assert len(self._names(resp)) == 3
