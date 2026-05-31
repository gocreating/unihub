"""Tests for data_io/services/csv_importer.py"""

import pytest

from data_io.registry import (
    FieldDescriptor,
    TableDescriptor,
    _restore_registry,
    _save_registry,
    register,
)
from data_io.services.csv_importer import parse_csv


@pytest.fixture(autouse=True)
def isolate_registry():
    saved = _save_registry()
    from data_io.registry import _clear_registry

    _clear_registry()
    yield
    _restore_registry(saved)


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


VALID_CSV = "code:string,name:text,symbol:text\nUSD,US Dollar,$\nEUR,Euro,€"
HEADERS_ONLY_CSV = "code:string,name:text,symbol:text\n"


class TestParseCsv:
    def test_valid_csv_parses_rows(self, currency_descriptor):
        rows, errors = parse_csv(VALID_CSV, currency_descriptor)
        assert errors == []
        assert len(rows) == 2
        pks = {r["code:string"] for r in rows}
        assert pks == {"USD", "EUR"}

    def test_headers_only_returns_empty_rows(self, currency_descriptor):
        rows, errors = parse_csv(HEADERS_ONLY_CSV, currency_descriptor)
        assert errors == []
        assert rows == []

    def test_missing_required_column_returns_error(self, currency_descriptor):
        csv_text = "code:string,symbol:text\nUSD,$"
        rows, errors = parse_csv(csv_text, currency_descriptor)
        assert rows == []
        messages = [e.message for e in errors]
        assert any("name:text" in m for m in messages)

    def test_header_without_type_suffix_returns_error(self, currency_descriptor):
        csv_text = "code,name:text,symbol:text\nUSD,US Dollar,$"
        rows, errors = parse_csv(csv_text, currency_descriptor)
        assert rows == []
        assert any(e.row == 0 for e in errors)

    def test_duplicate_pks_in_csv_returns_error(self, currency_descriptor):
        csv_text = "code:string,name:text,symbol:text\nUSD,US Dollar,$\nUSD,Duplicate,$"
        rows, errors = parse_csv(csv_text, currency_descriptor)
        assert any("duplicate" in e.message.lower() or "USD" in e.message for e in errors)

    def test_extra_column_not_in_descriptor_returns_error(self, currency_descriptor):
        csv_text = "code:string,name:text,symbol:text,unknown:string\nUSD,US Dollar,$,extra"
        rows, errors = parse_csv(csv_text, currency_descriptor)
        assert any("unknown" in e.message.lower() or "unknown:string" in e.message for e in errors)


@pytest.mark.django_db
class TestParseCsvFkValidation:
    def test_invalid_fk_value_returns_error(self, db):
        from finance.models import Account

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
            has_user_attributes=False,
            import_order=3,
        )
        register(acct_descriptor)

        # Note: no FK validation for CharField references (currency is a plain CharField, not a true FK)
        # FK validation applies to is_fk=True fields (like account_id in Balance)
        from finance.models import Balance

        balance_descriptor = TableDescriptor(
            content_type_label="finance.balance",
            display_name="Balances",
            model_class=Balance,
            system_fields=[
                FieldDescriptor(
                    column_name="id", csv_header="id:string", data_type="string", is_pk=True
                ),
                FieldDescriptor(
                    column_name="account_id",
                    csv_header="account_id:string",
                    data_type="string",
                    is_fk=True,
                    fk_content_type_label="finance.account",
                ),
                FieldDescriptor(
                    column_name="balance_sheet_id",
                    csv_header="balance_sheet_id:string",
                    data_type="string",
                    is_fk=True,
                    fk_content_type_label="finance.balancesheet",
                ),
                FieldDescriptor(
                    column_name="amount", csv_header="amount:decimal", data_type="decimal"
                ),
            ],
            has_user_attributes=False,
            import_order=6,
        )
        register(balance_descriptor)

        csv_text = "id:string,account_id:string,balance_sheet_id:string,amount:decimal\nabc123,NONEXISTENT,NONEXISTENT,100.00"
        rows, errors = parse_csv(csv_text, balance_descriptor)
        assert any("NONEXISTENT" in e.message or "account_id" in (e.column or "") for e in errors)
