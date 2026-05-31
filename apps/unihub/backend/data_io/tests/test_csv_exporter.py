"""Tests for data_io/services/csv_exporter.py"""

import csv
import io
import zipfile

import pytest
from django.contrib.auth.models import User
from django.test import Client

from data_io.registry import (
    FieldDescriptor,
    TableDescriptor,
    _restore_registry,
    _save_registry,
    register,
)
from data_io.services.csv_exporter import export_table, export_tables


@pytest.fixture(autouse=True)
def isolate_registry():
    saved = _save_registry()
    from data_io.registry import _clear_registry

    _clear_registry()
    yield
    _restore_registry(saved)


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(username="testuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.fixture
def currency_descriptor():
    from finance.models import Currency

    d = TableDescriptor(
        content_type_label="finance.currency",
        display_name="Currencies",
        model_class=Currency,
        system_fields=[
            FieldDescriptor(
                column_name="code", csv_header="code:string", data_type="string", is_pk=True
            ),
            FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
            FieldDescriptor(
                column_name="symbol", csv_header="symbol:text", data_type="text", nullable=True
            ),
        ],
        has_user_attributes=False,
        import_order=1,
    )
    register(d)
    return d


@pytest.mark.django_db
class TestExportTable:
    def test_export_currency_headers_and_rows(self, auth_client, currency_descriptor):
        from finance.models import Currency

        Currency.objects.create(code="USD", name="US Dollar", symbol="$")
        Currency.objects.create(code="EUR", name="Euro", symbol="€")

        csv_bytes = export_table(currency_descriptor)
        text = csv_bytes.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)

        assert reader.fieldnames == ["code:string", "name:text", "symbol:text"]
        assert len(rows) == 2
        codes = {r["code:string"] for r in rows}
        assert codes == {"USD", "EUR"}
        usd = next(r for r in rows if r["code:string"] == "USD")
        assert usd["name:text"] == "US Dollar"
        assert usd["symbol:text"] == "$"

    def test_export_empty_table_produces_headers_only(self, currency_descriptor):
        csv_bytes = export_table(currency_descriptor)
        text = csv_bytes.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        assert reader.fieldnames == ["code:string", "name:text", "symbol:text"]
        assert rows == []

    def test_export_table_with_nullable_field(self, auth_client, currency_descriptor):
        from finance.models import Currency

        Currency.objects.create(code="JPY", name="Yen", symbol="")

        csv_bytes = export_table(currency_descriptor)
        text = csv_bytes.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        jpy = rows[0]
        assert jpy["symbol:text"] == ""

    def test_export_account_includes_user_attribute_columns(self, db):
        from django.contrib.contenttypes.models import ContentType

        from core.models import AttributeDefinition
        from finance.models import Account

        ct = ContentType.objects.get_for_model(Account)
        AttributeDefinition.objects.create(
            content_type=ct, name="priority", data_type="single_select", is_system=False
        )

        acct_descriptor = TableDescriptor(
            content_type_label="finance.account",
            display_name="Accounts",
            model_class=Account,
            system_fields=[
                FieldDescriptor(
                    column_name="id", csv_header="id:string", data_type="string", is_pk=True
                ),
                FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
                FieldDescriptor(
                    column_name="currency", csv_header="currency:string", data_type="string"
                ),
            ],
            has_user_attributes=True,
            import_order=3,
        )
        register(acct_descriptor)

        csv_bytes = export_table(acct_descriptor)
        text = csv_bytes.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        assert "[priority]:single_select" in (reader.fieldnames or [])


@pytest.mark.django_db
class TestExportTables:
    def test_export_multiple_tables_as_zip(self, auth_client, currency_descriptor):
        from finance.models import BalanceSheet

        bs_descriptor = TableDescriptor(
            content_type_label="finance.balancesheet",
            display_name="Balance Sheets",
            model_class=BalanceSheet,
            system_fields=[
                FieldDescriptor(
                    column_name="id", csv_header="id:string", data_type="string", is_pk=True
                ),
                FieldDescriptor(
                    column_name="date", csv_header="date:datetime", data_type="datetime"
                ),
            ],
            import_order=2,
        )
        register(bs_descriptor)

        zip_bytes = export_tables([currency_descriptor, bs_descriptor])
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = set(zf.namelist())
        assert "finance_currency.csv" in names
        assert "finance_balancesheet.csv" in names
