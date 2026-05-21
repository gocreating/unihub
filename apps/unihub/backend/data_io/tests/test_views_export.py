"""Integration tests for data_io export views."""

import csv
import io
import json
import zipfile

import pytest
from django.contrib.auth.models import User
from django.test import Client


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(username="testuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.mark.django_db
class TestTablesView:
    def test_returns_registered_tables(self, auth_client):
        resp = auth_client.get("/api/v1/io/tables/")
        assert resp.status_code == 200
        data = resp.json()
        labels = [t["content_type_label"] for t in data]
        assert "finance.currency" in labels
        assert "finance.account" in labels
        assert "finance.balancesheet" in labels
        assert "finance.exchangerate" in labels
        assert "finance.balance" in labels

    def test_table_has_expected_shape(self, auth_client):
        resp = auth_client.get("/api/v1/io/tables/")
        assert resp.status_code == 200
        tables = {t["content_type_label"]: t for t in resp.json()}
        currency = tables["finance.currency"]
        assert currency["display_name"] == "Currencies"
        assert isinstance(currency["fields"], list)
        headers = [f["csv_header"] for f in currency["fields"]]
        assert "code:string" in headers
        assert "name:text" in headers

    def test_unauthenticated_returns_403(self):
        c = Client()
        resp = c.get("/api/v1/io/tables/")
        assert resp.status_code == 403


@pytest.mark.django_db
class TestExportView:
    def test_export_single_csv(self, auth_client):
        from finance.models import Currency

        Currency.objects.create(code="USD", name="US Dollar", symbol="$")

        resp = auth_client.post(
            "/api/v1/io/export/",
            json.dumps({"tables": ["finance.currency"], "format": "csv"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert "text/csv" in resp["Content-Type"]
        assert "finance_currency.csv" in resp["Content-Disposition"]

        reader = csv.DictReader(io.StringIO(resp.content.decode("utf-8")))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["code:string"] == "USD"

    def test_export_multiple_tables_returns_zip(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/export/",
            json.dumps({"tables": ["finance.currency", "finance.account"]}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert "application/zip" in resp["Content-Type"]
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = set(zf.namelist())
        assert "finance_currency.csv" in names
        assert "finance_account.csv" in names

    def test_export_unknown_table_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/export/",
            json.dumps({"tables": ["nonexistent.table"]}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_export_empty_tables_list_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/export/",
            json.dumps({"tables": []}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_unauthenticated_export_returns_403(self):
        c = Client()
        resp = c.post(
            "/api/v1/io/export/",
            json.dumps({"tables": ["finance.currency"]}),
            content_type="application/json",
        )
        assert resp.status_code == 403

    def test_default_format_csv_for_single_table(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/export/",
            json.dumps({"tables": ["finance.currency"]}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert "text/csv" in resp["Content-Type"]

    def test_default_format_zip_for_multiple_tables(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/export/",
            json.dumps({"tables": ["finance.currency", "finance.balancesheet"]}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert "application/zip" in resp["Content-Type"]
