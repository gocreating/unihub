"""data_io integration for the Inventory domain (registration + CSV round-trip)."""

import json

import pytest
from django.contrib.auth.models import User
from django.test import Client

from data_io.registry import get_table

ACQ = "/api/v1/inventory/acquisitions/"


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(username="io_tester", password="testpass")
    c = Client()
    c.force_login(user)
    return c


def _export_csv(client, label: str) -> str:
    resp = client.post(
        "/api/v1/io/export/",
        json.dumps({"tables": [label], "format": "csv"}),
        content_type="application/json",
    )
    assert resp.status_code == 200, resp.content
    return resp.content.decode("utf-8")


def _import_csv(client, label: str, csv_text: str) -> dict:
    resp = client.post(
        "/api/v1/io/import/confirm/",
        {"table": label, "mode": "upsert", "csv_text": csv_text},
    )
    assert resp.status_code == 200, resp.content
    return resp.json()


@pytest.mark.django_db
class TestInventoryDataIoRegistration:
    def test_inventory_tables_registered(self, auth_client):
        labels = [t["content_type_label"] for t in auth_client.get("/api/v1/io/tables/").json()]
        for expected in (
            "inventory.acquisition",
            "inventory.item",
            "inventory.costfactor",
            "inventory.scenario",
            "inventory.scenarioitem",
        ):
            assert expected in labels
        # Constraint is deferred (its items M2M is not registry-representable).
        assert "inventory.constraint" not in labels

    def test_fk_dependencies_wired(self):
        assert get_table("inventory.item").depends_on == ["inventory.acquisition"]
        assert get_table("inventory.costfactor").depends_on == ["inventory.acquisition"]
        assert set(get_table("inventory.scenarioitem").depends_on) == {
            "inventory.scenario",
            "inventory.item",
            "inventory.scenarioitem",
        }


@pytest.mark.django_db
class TestInventoryDataIoRoundTrip:
    def test_export_import_roundtrip(self, auth_client):
        from inventory.models import Acquisition, CostFactor, Item

        # Create an acquisition with one item and (auto) one accumulated factor.
        auth_client.post(
            ACQ,
            json.dumps(
                {
                    "source": "IO Shop",
                    "obtained_at": "2026-03-03T00:00:00Z",
                    "items": [
                        {
                            "name": "Gadget",
                            "quantity": 2,
                            "sku_price": "12",
                            "sku_price_currency": "USD",
                        }
                    ],
                }
            ),
            content_type="application/json",
        )
        assert Acquisition.objects.count() == 1
        assert Item.objects.count() == 1
        assert CostFactor.objects.count() == 1

        # Export each table to CSV.
        acq_csv = _export_csv(auth_client, "inventory.acquisition")
        item_csv = _export_csv(auth_client, "inventory.item")
        cf_csv = _export_csv(auth_client, "inventory.costfactor")

        # Wipe everything (children cascade with the acquisition).
        Acquisition.objects.all().delete()
        assert Item.objects.count() == 0 and CostFactor.objects.count() == 0

        # Import back — parents before children.
        _import_csv(auth_client, "inventory.acquisition", acq_csv)
        _import_csv(auth_client, "inventory.item", item_csv)
        _import_csv(auth_client, "inventory.costfactor", cf_csv)

        # Restored with the same data.
        assert Acquisition.objects.count() == 1
        acq = Acquisition.objects.get()
        assert acq.source == "IO Shop"
        item = Item.objects.get()
        assert item.name == "Gadget" and item.quantity == 2 and item.acquisition_id == acq.id
        cf = CostFactor.objects.get()
        assert cf.type == "accumulated" and cf.acquisition_id == acq.id
