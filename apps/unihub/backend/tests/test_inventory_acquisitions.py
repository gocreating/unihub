"""Integration tests for acquisition payment, items, and sources (US2)."""

import json

import pytest

ITEMS = "/api/v1/inventory/items/"
ACQ = "/api/v1/inventory/acquisitions/"


def _post(client, url, body):
    return client.post(url, json.dumps(body), content_type="application/json")


@pytest.mark.django_db
class TestAcquisitions:
    def test_create_acquisition_with_multiple_items_atomic(self, auth_client):
        resp = _post(
            auth_client,
            ACQ,
            {
                "source": "B&H",
                "obtained_at": "2026-01-04T00:00:00Z",
                "items": [{"name": "Camera"}, {"name": "Lens"}],
            },
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["item_count"] == 2

    def test_cost_factors_net_cost_grouped_by_currency(self, auth_client):
        # accumulated (USD 3300) is derived from the item; discount/shipping are manual.
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Shop",
                "cost_factors": [
                    {"value": "-100", "currency": "USD", "type": "discount"},
                    {"value": "50", "currency": "EUR", "type": "shipping"},
                ],
                "items": [{"name": "Thing", "sku_price": "3300", "sku_price_currency": "USD"}],
            },
        ).json()
        net = {row["currency"]: row["total"] for row in acq["net_cost"]}
        assert net == {"USD": "3200.0000", "EUR": "50.0000"}

    def test_accumulated_one_per_item_currency(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Multi",
                "items": [
                    {"name": "A", "quantity": 2, "sku_price": "10", "sku_price_currency": "USD"},
                    {"name": "B", "quantity": 1, "sku_price": "5", "sku_price_currency": "TWD"},
                ],
            },
        ).json()
        acc = [f for f in acq["cost_factors"] if f["type"] == "accumulated"]
        by_cur = {f["currency"]: f["value"] for f in acc}
        assert by_cur == {"USD": "20.0000", "TWD": "5.0000"}

    def test_cost_factor_type_accepts_free_text(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "X",
                "cost_factors": [{"type": "customs", "value": "7", "currency": "USD"}],
                "items": [{"name": "A", "sku_price": "10", "sku_price_currency": "USD"}],
            },
        ).json()
        assert "customs" in [f["type"] for f in acq["cost_factors"]]

    def test_cost_factors_preserve_display_order(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "X", "items": [{"name": "A"}]}).json()
        resp = auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps(
                {
                    "cost_factors": [
                        {"type": "shipping", "value": "5", "currency": "USD"},
                        {"type": "discount", "value": "-2", "currency": "USD"},
                        {"type": "customs", "value": "1", "currency": "USD"},
                    ]
                }
            ),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        factors = resp.json()["cost_factors"]
        assert [f["type"] for f in factors] == ["shipping", "discount", "customs"]
        assert [f["display_order"] for f in factors] == [0, 1, 2]

    def test_duplicate_accumulated_currency_rejected(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "X", "items": [{"name": "A"}]}).json()
        resp = auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps(
                {
                    "cost_factors": [
                        {"type": "accumulated", "value": "10", "currency": "USD"},
                        {"type": "accumulated", "value": "20", "currency": "USD"},
                    ]
                }
            ),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_reset_accumulated_recomputes_from_items(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "X",
                "items": [
                    {"name": "A", "quantity": 3, "sku_price": "10", "sku_price_currency": "USD"}
                ],
            },
        ).json()
        acc = next(f for f in acq["cost_factors"] if f["type"] == "accumulated")
        assert acc["value"] == "30.0000"

    def test_accumulated_factor_auto_derived_when_omitted(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Shop",
                "items": [
                    {"name": "A", "quantity": 2, "sku_price": "10", "sku_price_currency": "USD"},
                    {"name": "B", "quantity": 1, "sku_price": "5", "sku_price_currency": "USD"},
                ],
            },
        ).json()
        assert len(acq["cost_factors"]) == 1
        factor = acq["cost_factors"][0]
        assert factor["type"] == "accumulated"
        assert factor["currency"] == "USD"
        assert acq["net_cost"] == [{"currency": "USD", "total": "25.0000"}]

    def test_update_with_empty_cost_factors_rejected(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "S", "items": [{"name": "X"}]}).json()
        resp = auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps({"cost_factors": []}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_update_replaces_cost_factor_set(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "S", "items": [{"name": "X"}]}).json()
        resp = auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps({"cost_factors": [{"value": "9", "currency": "JPY", "type": "other"}]}),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        updated = resp.json()
        assert len(updated["cost_factors"]) == 1
        assert updated["net_cost"] == [{"currency": "JPY", "total": "9.0000"}]

    def test_acquisition_requires_at_least_one_item(self, auth_client):
        resp = _post(auth_client, ACQ, {"source": "Empty", "items": []})
        assert resp.status_code == 400
        resp2 = _post(auth_client, ACQ, {"source": "Empty2"})
        assert resp2.status_code == 400

    def test_acquisition_no_method_field(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "S", "items": [{"name": "X"}]}).json()
        assert "method" not in acq

    def test_acquisition_request_time_persisted(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {"source": "S", "request_time": "2026-01-01T00:00:00Z", "items": [{"name": "X"}]},
        ).json()
        assert acq["request_time"] == "2026-01-01T00:00:00Z"

    def test_delete_acquisition_cascades_items(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "Shop", "items": [{"name": "Thing"}]}).json()
        item_id = acq["items"][0]["id"]
        auth_client.delete(f"{ACQ}{acq['id']}/")
        assert auth_client.get(f"{ITEMS}{item_id}/").status_code == 404

    def test_item_requires_acquisition_no_direct_post(self, auth_client):
        resp = _post(auth_client, ITEMS, {"name": "Orphan"})
        assert resp.status_code == 405

    def test_item_edit_persists(self, auth_client):
        """FR-021a: editing an item's fields must persist."""
        acq = _post(
            auth_client, ACQ, {"source": "S", "items": [{"name": "Old", "quantity": 1}]}
        ).json()
        item_id = acq["items"][0]["id"]
        resp = auth_client.patch(
            f"{ITEMS}{item_id}/",
            json.dumps({"name": "New", "quantity": 5}),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        fetched = auth_client.get(f"{ITEMS}{item_id}/").json()
        assert fetched["name"] == "New"
        assert fetched["quantity"] == 5

    def test_ordering_nullsfirst_and_nullslast_take_effect(self, auth_client):
        """Regression: __nullsfirst/__nullslast MUST reorder null obtained_at rows."""
        _post(
            auth_client,
            ACQ,
            {"source": "HasDate", "obtained_at": "2026-01-01T00:00:00Z", "items": [{"name": "A"}]},
        )
        _post(auth_client, ACQ, {"source": "Pending", "items": [{"name": "B"}]})  # null obtained

        first = auth_client.get(f"{ACQ}?ordering=-obtained_at__nullsfirst").json()["results"]
        assert [a["source"] for a in first] == ["Pending", "HasDate"]

        last = auth_client.get(f"{ACQ}?ordering=-obtained_at__nullslast").json()["results"]
        assert [a["source"] for a in last] == ["HasDate", "Pending"]

    def test_default_ordering_is_obtained_desc_nulls_first(self, auth_client):
        """The Catalog default: obtained desc, NULLS FIRST (pending on top)."""
        _post(
            auth_client,
            ACQ,
            {"source": "Old", "obtained_at": "2020-01-01T00:00:00Z", "items": [{"name": "A"}]},
        )
        _post(
            auth_client,
            ACQ,
            {"source": "New", "obtained_at": "2026-01-01T00:00:00Z", "items": [{"name": "B"}]},
        )
        _post(auth_client, ACQ, {"source": "Pending", "items": [{"name": "C"}]})

        results = auth_client.get(ACQ).json()["results"]
        assert [a["source"] for a in results] == ["Pending", "New", "Old"]

    def test_sources_endpoint_returns_distinct_used_sources(self, auth_client):
        _post(auth_client, ACQ, {"source": "Amazon", "items": [{"name": "A"}]})
        _post(auth_client, ACQ, {"source": "Amazon", "items": [{"name": "B"}]})
        _post(auth_client, ACQ, {"source": "B&H", "items": [{"name": "C"}]})
        sources = auth_client.get(f"{ACQ}sources/").json()
        assert sorted(sources) == ["Amazon", "B&H"]  # distinct

    def test_sources_endpoint_filters_by_q(self, auth_client):
        _post(auth_client, ACQ, {"source": "Amazon", "items": [{"name": "A"}]})
        _post(auth_client, ACQ, {"source": "B&H", "items": [{"name": "C"}]})
        sources = auth_client.get(f"{ACQ}sources/?q=ama").json()
        assert sources == ["Amazon"]


@pytest.mark.django_db
class TestAccumulatedOwnership:
    """Feature 018 US1 — user-managed accumulated factors (FR-001..FR-006).

    Create contract: client-sent accumulated factors are stored verbatim (the
    server derives NOTHING when any accumulated factor is present); derivation
    only runs when the payload carries no accumulated factor.
    """

    def test_create_acquisition_accumulated_zero_stored_verbatim(self, auth_client):
        resp = _post(
            auth_client,
            ACQ,
            {
                "source": "Shop",
                "cost_factors": [
                    {"type": "accumulated", "value": "0", "currency": "USD", "user_managed": True}
                ],
                "items": [
                    {"name": "A", "quantity": 2, "sku_price": "10", "sku_price_currency": "USD"}
                ],
            },
        )
        assert resp.status_code == 201, resp.content
        acq = resp.json()
        acc = [f for f in acq["cost_factors"] if f["type"] == "accumulated"]
        assert len(acc) == 1
        assert acc[0]["value"] == "0.0000"
        assert acc[0]["user_managed"] is True
        assert acq["net_cost"] == [{"currency": "USD", "total": "0.0000"}]

    def test_create_acquisition_accumulated_nonzero_round_trip(self, auth_client):
        # Replaces the pre-018 "system-managed" rejection: verbatim storage now.
        resp = _post(
            auth_client,
            ACQ,
            {
                "source": "X",
                "cost_factors": [
                    {"type": "accumulated", "value": "99", "currency": "USD", "user_managed": True},
                    {"type": "shipping", "value": "5", "currency": "USD"},
                ],
                "items": [{"name": "A", "sku_price": "3300", "sku_price_currency": "USD"}],
            },
        )
        assert resp.status_code == 201, resp.content
        factors = resp.json()["cost_factors"]
        assert [f["type"] for f in factors] == ["accumulated", "shipping"]
        assert factors[0]["value"] == "99.0000"
        assert factors[0]["user_managed"] is True
        assert factors[1]["user_managed"] is False

    def test_create_acquisition_any_accumulated_disables_derivation(self, auth_client):
        # Items are priced in USD and TWD but the client's accumulated set only
        # covers USD — the server must not derive a TWD row on top.
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Multi",
                "cost_factors": [
                    {"type": "accumulated", "value": "0", "currency": "USD", "user_managed": True}
                ],
                "items": [
                    {"name": "A", "sku_price": "10", "sku_price_currency": "USD"},
                    {"name": "B", "sku_price": "5", "sku_price_currency": "TWD"},
                ],
            },
        ).json()
        acc = [f for f in acq["cost_factors"] if f["type"] == "accumulated"]
        assert [(f["currency"], f["value"]) for f in acc] == [("USD", "0.0000")]

    def test_create_acquisition_duplicate_accumulated_currency_rejected(self, auth_client):
        resp = _post(
            auth_client,
            ACQ,
            {
                "source": "X",
                "cost_factors": [
                    {"type": "accumulated", "value": "10", "currency": "USD"},
                    {"type": "accumulated", "value": "20", "currency": "USD"},
                ],
                "items": [{"name": "A"}],
            },
        )
        assert resp.status_code == 400

    def test_create_acquisition_derived_accumulated_user_managed_false(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "Shop",
                "items": [{"name": "A", "sku_price": "10", "sku_price_currency": "USD"}],
            },
        ).json()
        factor = acq["cost_factors"][0]
        assert factor["type"] == "accumulated"
        assert factor["user_managed"] is False

    def test_update_acquisition_round_trips_user_managed(self, auth_client):
        acq = _post(
            auth_client,
            ACQ,
            {
                "source": "X",
                "items": [
                    {"name": "A", "quantity": 3, "sku_price": "10", "sku_price_currency": "USD"}
                ],
            },
        ).json()
        resp = auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps(
                {
                    "cost_factors": [
                        {
                            "type": "accumulated",
                            "value": "0",
                            "currency": "USD",
                            "user_managed": True,
                        },
                        {"type": "shipping", "value": "5", "currency": "USD"},
                    ]
                }
            ),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        acc = next(f for f in resp.json()["cost_factors"] if f["type"] == "accumulated")
        assert acc["value"] == "0.0000"
        assert acc["user_managed"] is True
        # The user-managed state persists on a fresh read (FR-004).
        detail = auth_client.get(f"{ACQ}{acq['id']}/").json()
        acc = next(f for f in detail["cost_factors"] if f["type"] == "accumulated")
        assert acc["user_managed"] is True

    def test_update_acquisition_user_managed_defaults_false_when_omitted(self, auth_client):
        acq = _post(auth_client, ACQ, {"source": "X", "items": [{"name": "A"}]}).json()
        resp = auth_client.patch(
            f"{ACQ}{acq['id']}/",
            json.dumps(
                {"cost_factors": [{"type": "accumulated", "value": "10", "currency": "USD"}]}
            ),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["cost_factors"][0]["user_managed"] is False

    def test_data_io_descriptor_carries_user_managed(self):
        from data_io.registry import get_table

        names = [f.column_name for f in get_table("inventory.costfactor").system_fields]
        assert "user_managed" in names


@pytest.mark.django_db
class TestIsEmptyOnDateFields:
    """Iteration 17: is_empty on a datetime column must not 500 (the empty-
    string leg of the lookup only applies to text fields)."""

    def _filters(self, groups):
        import urllib.parse

        return urllib.parse.quote(json.dumps({"groups": groups}))

    def test_obtained_is_empty_returns_pending_only(self, auth_client):
        _post(
            auth_client,
            ACQ,
            {"source": "Dated", "obtained_at": "2026-01-04T00:00:00Z", "items": [{"name": "A"}]},
        )
        _post(auth_client, ACQ, {"source": "Pending", "items": [{"name": "B"}]})
        qs = self._filters(
            [{"logic": "and", "conditions": [{"attr": "obtained_at", "op": "is_empty", "val": ""}]}]
        )
        resp = auth_client.get(f"{ACQ}?filters={qs}")
        assert resp.status_code == 200, resp.content
        sources = [a["source"] for a in resp.json()["results"]]
        assert sources == ["Pending"]

    def test_ytd_or_empty_seeded_default_filter(self, auth_client):
        _post(
            auth_client,
            ACQ,
            {"source": "Old", "obtained_at": "2024-03-01T00:00:00Z", "items": [{"name": "O"}]},
        )
        _post(
            auth_client,
            ACQ,
            {"source": "ThisYear", "obtained_at": "2026-02-01T00:00:00Z", "items": [{"name": "T"}]},
        )
        _post(auth_client, ACQ, {"source": "Pending", "items": [{"name": "P"}]})
        qs = self._filters(
            [
                {
                    "logic": "and",
                    "conditions": [{"attr": "obtained_at", "op": "gte", "val": "2026-01-01"}],
                },
                {
                    "logic": "and",
                    "conditions": [{"attr": "obtained_at", "op": "is_empty", "val": ""}],
                },
            ]
        )
        resp = auth_client.get(f"{ACQ}?filters={qs}")
        assert resp.status_code == 200, resp.content
        sources = {a["source"] for a in resp.json()["results"]}
        assert sources == {"ThisYear", "Pending"}

    def test_single_or_group_matches_ytd_or_empty(self, auth_client):
        # Iteration 24: the catalog's default seed is ONE or-group with two
        # plain conditions — identical semantics to the former two groups.
        _post(
            auth_client,
            ACQ,
            {"source": "Old", "obtained_at": "2024-03-01T00:00:00Z", "items": [{"name": "O"}]},
        )
        _post(
            auth_client,
            ACQ,
            {"source": "ThisYear", "obtained_at": "2026-02-01T00:00:00Z", "items": [{"name": "T"}]},
        )
        _post(auth_client, ACQ, {"source": "Pending", "items": [{"name": "P"}]})
        qs = self._filters(
            [
                {
                    "logic": "or",
                    "conditions": [
                        {"attr": "obtained_at", "op": "gte", "val": "2026-01-01"},
                        {"attr": "obtained_at", "op": "is_empty", "val": ""},
                    ],
                }
            ]
        )
        resp = auth_client.get(f"{ACQ}?filters={qs}")
        assert resp.status_code == 200, resp.content
        sources = {a["source"] for a in resp.json()["results"]}
        assert sources == {"ThisYear", "Pending"}
