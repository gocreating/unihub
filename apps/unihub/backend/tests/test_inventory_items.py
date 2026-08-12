"""Integration tests for Inventory items — iteration-3 fields (US1)."""

import json

import pytest

from tests.conftest import create_item

ITEMS = "/api/v1/inventory/items/"


def _patch(client, item_id, body):
    return client.patch(f"{ITEMS}{item_id}/", json.dumps(body), content_type="application/json")


@pytest.mark.django_db
class TestItems:
    def test_item_sku_price_and_total_price(self, auth_client):
        item = create_item(auth_client, name="P", sku_price="10", quantity=3)
        fetched = auth_client.get(f"{ITEMS}{item['id']}/").json()
        assert fetched["sku_price"] == "10.0000"
        assert fetched["total_price"] == "30.0000"  # 10 × 3

    def test_item_quantity_is_integer(self, auth_client):
        item = create_item(auth_client, name="Q7", quantity=7)
        assert auth_client.get(f"{ITEMS}{item['id']}/").json()["quantity"] == 7

    def test_item_quantity_defaults_to_one(self, auth_client):
        item = create_item(auth_client, name="Q")  # no quantity given
        assert auth_client.get(f"{ITEMS}{item['id']}/").json()["quantity"] == 1

    def test_item_has_no_item_type(self, auth_client):
        item = create_item(auth_client, name="NT")
        assert "item_type" not in item

    def test_deprecate_sets_status_deprecated(self, auth_client):
        item = create_item(auth_client, name="D")
        assert item["status"] == "active"
        resp = _patch(auth_client, item["id"], {"deprecate_time": "2026-01-01T00:00:00Z"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "deprecated"

    def test_restore_clears_deprecate_time(self, auth_client):
        item = create_item(auth_client, name="R")
        _patch(auth_client, item["id"], {"deprecate_time": "2026-01-01T00:00:00Z"})
        resp = _patch(auth_client, item["id"], {"deprecate_time": None})
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        assert resp.json()["deprecate_time"] is None

    def test_status_is_read_only(self, auth_client):
        item = create_item(auth_client, name="S")
        # Writing status directly is ignored (derived from deprecate_time).
        resp = _patch(auth_client, item["id"], {"status": "deprecated"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_item_has_no_model_serial_cost_fields(self, auth_client):
        item = create_item(auth_client, name="F")
        for gone in ("model", "serial_number", "cost", "cost_currency", "price"):
            assert gone not in item

    def test_items_default_sorted_by_acquisition_obtained_at_desc(self, auth_client):
        auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps(
                {
                    "source": "old",
                    "obtained_at": "2020-01-01T00:00:00Z",
                    "items": [{"name": "OldItem"}],
                }
            ),
            content_type="application/json",
        )
        auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps(
                {
                    "source": "new",
                    "obtained_at": "2026-01-01T00:00:00Z",
                    "items": [{"name": "NewItem"}],
                }
            ),
            content_type="application/json",
        )
        names = [r["name"] for r in auth_client.get(ITEMS).json()["results"]]
        assert names.index("NewItem") < names.index("OldItem")

    def test_create_item_missing_name_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps({"source": "x", "items": [{"quantity": 1}]}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_item_filter_by_quantity(self, auth_client):
        """Catalog flat mode filters items server-side by quantity."""
        create_item(auth_client, name="One", quantity=1)
        create_item(auth_client, name="Five", quantity=5)
        filters = json.dumps(
            {
                "groups": [
                    {"logic": "and", "conditions": [{"attr": "quantity", "op": "eq", "val": "5"}]}
                ]
            }
        )
        results = auth_client.get(f"{ITEMS}?filters={filters}").json()["results"]
        assert [r["name"] for r in results] == ["Five"]

    def test_item_order_by_source(self, auth_client):
        """Catalog flat mode sorts items server-side by acquisition source."""
        for src in ("Zeta", "Alpha"):
            auth_client.post(
                "/api/v1/inventory/acquisitions/",
                json.dumps({"source": src, "items": [{"name": f"i-{src}"}]}),
                content_type="application/json",
            )
        names = [
            r["acquisition"]["source"]
            for r in auth_client.get(f"{ITEMS}?ordering=acquisition__source").json()["results"]
        ]
        assert names == ["Alpha", "Zeta"]


@pytest.mark.django_db
class TestItemNestedAcquisitionNetCost:
    """Iteration 13: the nested acquisition summary carries read-only net_cost."""

    def test_item_detail_nested_acquisition_includes_net_cost(self, auth_client):
        item = create_item(
            auth_client, name="NC", sku_price="10", sku_price_currency="TWD", quantity=2
        )
        fetched = auth_client.get(f"{ITEMS}{item['id']}/").json()
        # Accumulated factor auto-derives Σ sku_price × quantity per currency.
        assert fetched["acquisition"]["net_cost"] == [{"currency": "TWD", "total": "20.0000"}]

    def test_item_list_nested_net_cost_matches_top_level_acquisition(self, auth_client):
        item = create_item(auth_client, name="NCL", sku_price="5.5", sku_price_currency="USD")
        row = next(r for r in auth_client.get(ITEMS).json()["results"] if r["id"] == item["id"])
        top = auth_client.get(f"/api/v1/inventory/acquisitions/{row['acquisition']['id']}/").json()
        assert row["acquisition"]["net_cost"] == top["net_cost"]


@pytest.mark.django_db
class TestItemParameters:
    """Iteration 14: parameters via shared AttributeDefinition/AttributeValue."""

    def _def(self, name, data_type, unit_family="", options=None):
        from django.contrib.contenttypes.models import ContentType

        from core.models import AttributeDefinition

        return AttributeDefinition.objects.create(
            content_type=ContentType.objects.get(app_label="inventory", model="item"),
            name=name,
            data_type=data_type,
            unit_family=unit_family,
            options=options or [],
        )

    def test_item_create_with_parameters_round_trips(self, auth_client):
        weight = self._def("heftp", "dimension", unit_family="weight")
        capacity = self._def("capacityp", "number")
        item = create_item(
            auth_client,
            name="Param",
            parameters=[
                {"definition_id": weight.id, "value": "1.5", "unit": "kg"},
                {"definition_id": capacity.id, "value": "5000"},
            ],
        )
        fetched = auth_client.get(f"{ITEMS}{item['id']}/").json()
        params = {p["name"]: p for p in fetched["parameters"]}
        assert params["heftp"]["value"] == "1.5"
        assert params["heftp"]["unit"] == "kg"
        assert params["heftp"]["data_type"] == "dimension"
        assert params["heftp"]["unit_family"] == "weight"
        assert float(params["heftp"]["value_number"]) == 1500
        assert params["capacityp"]["value"] == "5000"

    def test_item_patch_parameters_upsert_replace(self, auth_client):
        color = self._def("colorp", "text")
        size = self._def("sizep", "text")
        item = create_item(
            auth_client,
            name="Rep",
            parameters=[
                {"definition_id": color.id, "value": "red"},
                {"definition_id": size.id, "value": "M"},
            ],
        )
        # Replace with color only (new value) — size must be deleted.
        resp = _patch(
            auth_client, item["id"], {"parameters": [{"definition_id": color.id, "value": "blue"}]}
        )
        assert resp.status_code == 200, resp.content
        params = {p["name"]: p["value"] for p in resp.json()["parameters"]}
        assert params == {"colorp": "blue"}

    def test_item_duplicate_parameter_key_rejected(self, auth_client):
        color = self._def("colord", "text")
        resp = auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps(
                {
                    "source": "seed",
                    "items": [
                        {
                            "name": "Dup",
                            "parameters": [
                                {"definition_id": color.id, "value": "red"},
                                {"definition_id": color.id, "value": "blue"},
                            ],
                        }
                    ],
                }
            ),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_item_parameter_invalid_select_value_rejected(self, auth_client):
        grade = self._def("gradep", "single_select", options=["A", "B"])
        resp = auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps(
                {
                    "source": "seed",
                    "items": [
                        {"name": "Sel", "parameters": [{"definition_id": grade.id, "value": "Z"}]}
                    ],
                }
            ),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_item_has_no_concrete_parameter_fields(self, auth_client):
        item = create_item(auth_client, name="NoCols")
        fetched = auth_client.get(f"{ITEMS}{item['id']}/").json()
        for gone in ("color", "size", "weight", "length", "width", "height", "volume"):
            assert gone not in fetched


@pytest.mark.django_db
class TestFooterTotals:
    """Iteration 15: list responses carry footer totals over the filtered set."""

    def _seed(self, auth_client):
        # One acquisition with 2 items + one with 1 item.
        resp = auth_client.post(
            "/api/v1/inventory/acquisitions/",
            json.dumps({"source": "multi", "items": [{"name": "FT-A"}, {"name": "FT-B"}]}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        create_item(auth_client, name="FT-C")

    def test_acquisition_list_totals(self, auth_client):
        self._seed(auth_client)
        data = auth_client.get("/api/v1/inventory/acquisitions/").json()
        assert data["totals"] == {"acquisitions": 2, "items": 3}

    def test_item_list_totals(self, auth_client):
        self._seed(auth_client)
        data = auth_client.get(ITEMS).json()
        assert data["totals"] == {"acquisitions": 2, "items": 3}

    def test_totals_respect_filters(self, auth_client):
        self._seed(auth_client)
        from urllib.parse import quote

        filters = quote(
            json.dumps(
                {"groups": [{"conditions": [{"attr": "name", "op": "contains", "val": "FT-C"}]}]}
            )
        )
        data = auth_client.get(f"{ITEMS}?filters={filters}").json()
        assert data["totals"] == {"acquisitions": 1, "items": 1}


@pytest.mark.django_db
class TestItemAlias:
    """Iteration 18 (FR-030): alias_name round-trip, filter, and ordering."""

    def test_alias_round_trips_and_defaults_blank(self, auth_client):
        item = create_item(auth_client, name="Seller Name", alias_name="My Torch")
        fetched = auth_client.get(f"{ITEMS}{item['id']}/").json()
        assert fetched["alias_name"] == "My Torch"
        plain = create_item(auth_client, name="No Alias")
        assert auth_client.get(f"{ITEMS}{plain['id']}/").json()["alias_name"] == ""

    def test_alias_patchable(self, auth_client):
        item = create_item(auth_client, name="X")
        resp = _patch(auth_client, item["id"], {"alias_name": "Nick"})
        assert resp.status_code == 200, resp.content
        assert resp.json()["alias_name"] == "Nick"

    def test_alias_filter_and_order(self, auth_client):
        create_item(auth_client, name="A-item", alias_name="zulu")
        create_item(auth_client, name="B-item", alias_name="alpha")
        import urllib.parse

        filters = urllib.parse.quote(
            json.dumps(
                {
                    "groups": [
                        {
                            "logic": "and",
                            "conditions": [{"attr": "alias_name", "op": "contains", "val": "ulu"}],
                        }
                    ]
                }
            )
        )
        resp = auth_client.get(f"{ITEMS}?filters={filters}")
        assert resp.status_code == 200, resp.content
        assert [i["name"] for i in resp.json()["results"]] == ["A-item"]
        ordered = auth_client.get(f"{ITEMS}?ordering=alias_name").json()["results"]
        aliases = [i["alias_name"] for i in ordered if i["alias_name"]]
        assert aliases == sorted(aliases)


@pytest.mark.django_db
class TestUnknownTimeDeprecation:
    """Iteration 36 (FR-001): deprecated is a STORED flag; time is optional."""

    def test_deprecate_with_unknown_time(self, auth_client):
        item = create_item(auth_client, name="Mystery")
        resp = _patch(auth_client, item["id"], {"deprecated": True, "deprecate_time": None})
        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["status"] == "deprecated"
        assert body["deprecated"] is True
        assert body["deprecate_time"] is None

    def test_dated_deprecation_still_works(self, auth_client):
        item = create_item(auth_client, name="Dated")
        resp = _patch(
            auth_client,
            item["id"],
            {"deprecated": True, "deprecate_time": "2026-01-01T00:00:00Z"},
        )
        assert resp.json()["status"] == "deprecated"
        assert resp.json()["deprecate_time"] is not None

    def test_restore_clears_flag_and_time(self, auth_client):
        item = create_item(auth_client, name="Back")
        _patch(auth_client, item["id"], {"deprecated": True, "deprecate_time": None})
        resp = _patch(auth_client, item["id"], {"deprecated": False, "deprecate_time": None})
        assert resp.json()["status"] == "active"
        assert resp.json()["deprecated"] is False

    def test_legacy_dated_rows_backfilled(self, auth_client):
        # Setting only deprecate_time (old client shape) keeps working: the
        # serializer derives the flag when it is absent from the payload.
        item = create_item(auth_client, name="OldFlow")
        resp = _patch(auth_client, item["id"], {"deprecate_time": "2026-01-01T00:00:00Z"})
        assert resp.json()["status"] == "deprecated"
        resp = _patch(auth_client, item["id"], {"deprecate_time": None})
        assert resp.json()["status"] == "active"
