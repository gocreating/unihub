"""
Regression tests for data sync field coverage.

These tests enforce three guarantees:
1. auto_system_fields() / _field_to_data_type() work correctly (T002-T004)
2. Every concrete field of every registered Finance model is in system_fields (T007-T010)
3. Publish preview detects changes to previously omitted fields (T016-T017)
4. Importing older CSVs without new columns succeeds with safe defaults (T019-T021)
5. Push-pull round-trip preserves created_at exactly (T024)
"""

from __future__ import annotations

import csv
import io

import pytest
from django.contrib.auth.models import User
from django.test import Client

from data_io.registry import (
    auto_system_fields,
    _field_to_data_type,
    get_table,
)
from finance.models import Account, Balance, Currency


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def auth_client(db):
    """Return an authenticated Django test client."""
    user = User.objects.create_user(username="synctest", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.fixture
def usd(auth_client):
    resp = auth_client.post(
        "/api/v1/finance/currencies/",
        {"code": "USD", "name": "US Dollar", "symbol": "$"},
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.json()


# ── T004: _field_to_data_type() mapping tests ────────────────────────────────


@pytest.mark.django_db
class TestFieldToDataType:
    """Verify Django field → data_io data_type mapping."""

    def test_boolean_field(self):
        from django.db import models as dj

        f = dj.BooleanField()
        assert _field_to_data_type(f) == "boolean"

    def test_datetime_field(self):
        from django.db import models as dj

        f = dj.DateTimeField()
        assert _field_to_data_type(f) == "datetime"

    def test_decimal_field(self):
        from django.db import models as dj

        f = dj.DecimalField(max_digits=20, decimal_places=4)
        assert _field_to_data_type(f) == "decimal"

    def test_charfield_short_is_string(self):
        from django.db import models as dj

        f = dj.CharField(max_length=10)
        assert _field_to_data_type(f) == "string"

    def test_charfield_long_is_text(self):
        from django.db import models as dj

        f = dj.CharField(max_length=200)
        assert _field_to_data_type(f) == "text"

    def test_textfield_is_text(self):
        from django.db import models as dj

        f = dj.TextField()
        assert _field_to_data_type(f) == "text"

    def test_foreignkey_is_string(self):
        f = next(field for field in Balance._meta.concrete_fields if field.attname == "account_id")
        assert _field_to_data_type(f) == "string"


# ── T002: auto_system_fields() — Currency ────────────────────────────────────


@pytest.mark.django_db
class TestAutoSystemFieldsCurrency:
    """auto_system_fields() generates FieldDescriptors matching Currency._meta."""

    def test_generates_correct_count(self):
        fields = auto_system_fields(Currency)
        model_attnames = {f.attname for f in Currency._meta.concrete_fields}
        generated_names = {fd.column_name for fd in fields}
        assert generated_names == model_attnames

    def test_code_is_pk(self):
        fields = auto_system_fields(Currency)
        code_fd = next(fd for fd in fields if fd.column_name == "code")
        assert code_fd.is_pk is True

    def test_is_base_currency_is_boolean(self):
        fields = auto_system_fields(Currency)
        fd = next(fd for fd in fields if fd.column_name == "is_base_currency")
        assert fd.data_type == "boolean"

    def test_is_base_currency_has_optional_default(self):
        """is_base_currency has default=False, so it should be optional with default False."""
        fields = auto_system_fields(Currency)
        fd = next(fd for fd in fields if fd.column_name == "is_base_currency")
        assert fd.optional is True
        assert fd.default_value is False


# ── T003: auto_system_fields() — FK overrides for Balance ────────────────────


@pytest.mark.django_db
class TestAutoSystemFieldsFKOverrides:
    """FK fields with fk_overrides get correct is_fk and fk_content_type_label."""

    def test_account_id_fk_override(self):
        fields = auto_system_fields(
            Balance,
            fk_overrides={
                "account_id": {
                    "is_fk": True,
                    "fk_content_type_label": "finance.account",
                },
                "balance_sheet_id": {
                    "is_fk": True,
                    "fk_content_type_label": "finance.balancesheet",
                },
            },
        )
        account_fd = next(fd for fd in fields if fd.column_name == "account_id")
        assert account_fd.is_fk is True
        assert account_fd.fk_content_type_label == "finance.account"

    def test_balance_sheet_id_fk_override(self):
        fields = auto_system_fields(
            Balance,
            fk_overrides={
                "account_id": {
                    "is_fk": True,
                    "fk_content_type_label": "finance.account",
                },
                "balance_sheet_id": {
                    "is_fk": True,
                    "fk_content_type_label": "finance.balancesheet",
                },
            },
        )
        bs_fd = next(fd for fd in fields if fd.column_name == "balance_sheet_id")
        assert bs_fd.is_fk is True
        assert bs_fd.fk_content_type_label == "finance.balancesheet"


# ── T007-T010: Field coverage invariant ──────────────────────────────────────


@pytest.mark.django_db
class TestFinanceSyncFieldCoverage:
    """Every concrete field of every registered Finance model must be in system_fields.

    This is the permanent regression guard from contracts/field-coverage-contract.md.
    If any Finance model field is missing from the registry, this test fails immediately.
    """

    def _check_table(self, label: str) -> None:
        table = get_table(label)
        model_attnames = {f.attname for f in table.model_class._meta.concrete_fields}
        registered_names = {fd.column_name for fd in table.system_fields}
        missing = model_attnames - registered_names
        extra = registered_names - model_attnames
        assert not missing, (
            f"Table '{label}' is missing fields from registry: {missing}. "
            "Add them to finance/apps.py or auto_system_fields will pick them up."
        )
        assert not extra, f"Table '{label}' has extra fields in registry not in model: {extra}."

    def test_currency_full_coverage(self):
        self._check_table("finance.currency")

    def test_account_full_coverage(self):
        self._check_table("finance.account")

    def test_balancesheet_full_coverage(self):
        self._check_table("finance.balancesheet")

    def test_exchangerate_full_coverage(self):
        self._check_table("finance.exchangerate")

    def test_balance_full_coverage(self):
        self._check_table("finance.balance")

    def test_is_base_currency_in_currency_registry(self):
        """Specific regression: is_base_currency must be registered for finance.currency."""
        table = get_table("finance.currency")
        names = {fd.column_name for fd in table.system_fields}
        assert "is_base_currency" in names, (
            "is_base_currency is missing from finance.currency registry — data loss on sync!"
        )

    def test_color_in_account_registry(self):
        """Specific regression: color must be registered for finance.account."""
        table = get_table("finance.account")
        names = {fd.column_name for fd in table.system_fields}
        assert "color" in names, (
            "color is missing from finance.account registry — data loss on sync!"
        )


# ── T008-T009: Export CSV includes newly-added fields ────────────────────────


@pytest.mark.django_db
class TestExportIncludesNewFields:
    """Exported CSV headers include is_base_currency and color."""

    def _export_table(self, auth_client, table_label: str) -> bytes:
        """Export a single table via the io/export API."""
        resp = auth_client.post(
            "/api/v1/io/export/",
            {"tables": [table_label]},
            content_type="application/json",
        )
        assert resp.status_code == 200
        return resp.content

    def test_currency_export_has_is_base_currency(self, auth_client, usd):
        auth_client.patch(
            "/api/v1/finance/currencies/USD/",
            {"is_base_currency": True},
            content_type="application/json",
        )
        # Use the data_io registry + exporter directly (avoids zip/API format complexity)
        from data_io.registry import get_table
        from data_io.services.csv_exporter import export_table

        descriptor = get_table("finance.currency")
        content = export_table(descriptor).decode()
        reader = csv.DictReader(io.StringIO(content))
        headers = reader.fieldnames or []
        assert "is_base_currency:boolean" in headers, (
            f"is_base_currency:boolean not in export headers: {headers}"
        )
        rows = list(reader)
        usd_row = next(r for r in rows if r.get("code:string") == "USD")
        assert usd_row["is_base_currency:boolean"] == "true"

    def test_account_export_has_color(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/accounts/",
            {
                "name": "Savings",
                "currency": "USD",
                "open_datetime": "2020-01-01T00:00:00Z",
                "color": "#2196f3",
            },
            content_type="application/json",
        )
        from data_io.registry import get_table
        from data_io.services.csv_exporter import export_table

        descriptor = get_table("finance.account")
        content = export_table(descriptor).decode()
        reader = csv.DictReader(io.StringIO(content))
        headers = reader.fieldnames or []
        assert "color:string" in headers, f"color:string not in export headers: {headers}"
        rows = list(reader)
        savings_row = next(r for r in rows if "Savings" in r.get("name:text", ""))
        assert savings_row["color:string"] == "#2196f3"

    def test_account_export_has_timestamps(self, auth_client, usd):
        auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Savings", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        from data_io.registry import get_table
        from data_io.services.csv_exporter import export_table

        headers = list(
            csv.DictReader(
                io.StringIO(export_table(get_table("finance.account")).decode())
            ).fieldnames
            or []
        )
        assert "created_at:datetime" in headers
        assert "updated_at:datetime" in headers

    def test_balancesheet_export_has_timestamps(self, auth_client):
        auth_client.post(
            "/api/v1/finance/balance-sheets/",
            {"date": "2026-01-01T00:00:00Z"},
            content_type="application/json",
        )
        from data_io.registry import get_table
        from data_io.services.csv_exporter import export_table

        headers = list(
            csv.DictReader(
                io.StringIO(export_table(get_table("finance.balancesheet")).decode())
            ).fieldnames
            or []
        )
        assert "created_at:datetime" in headers
        assert "updated_at:datetime" in headers


# ── T016-T017: Publish preview detects changes to new fields ─────────────────


@pytest.mark.django_db
class TestPreviewDetectsNewFieldChanges:
    """Publish preview counts records as modified when is_base_currency or color changes."""

    def test_preview_detects_is_base_currency_change(self, auth_client, usd):
        """After exporting USD with is_base_currency=False, toggle it to True.
        The preview should count USD as modified."""
        from data_io.registry import get_table
        from data_io.services.csv_exporter import export_table
        from data_io.services.csv_importer import parse_csv
        from data_io.services.change_preview import compute_diff

        # Export current state (is_base_currency=False)
        descriptor = get_table("finance.currency")
        csv_bytes = export_table(descriptor)
        csv_text = csv_bytes.decode()

        # Now mark USD as base currency in DB
        Currency.objects.filter(code="USD").update(is_base_currency=True)

        # Diff: the exported CSV (old, False) vs current DB (True) → should show update
        parsed_rows, errors = parse_csv(csv_text, descriptor)
        assert not errors, f"Parse errors: {errors}"
        records = compute_diff(parsed_rows, descriptor, mode="upsert")
        usd_update = next(
            (r for r in records if r["pk"] == "USD" and r["operation"] == "update"),
            None,
        )
        assert usd_update is not None, (
            "Expected USD to appear as 'update' in diff when is_base_currency changed"
        )

    def test_preview_detects_color_change(self, auth_client, usd):
        """After exporting an account with no color, add a color.
        The preview should count it as modified."""
        from data_io.registry import get_table
        from data_io.services.csv_exporter import export_table
        from data_io.services.csv_importer import parse_csv
        from data_io.services.change_preview import compute_diff

        acc_resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Savings", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        acc_id = acc_resp.json()["id"]

        # Export current state (color="")
        descriptor = get_table("finance.account")
        csv_bytes = export_table(descriptor)
        csv_text = csv_bytes.decode()

        # Now assign a color
        Account.objects.filter(pk=acc_id).update(color="#2196f3")

        parsed_rows, errors = parse_csv(csv_text, descriptor)
        assert not errors
        records = compute_diff(parsed_rows, descriptor, mode="upsert")
        acc_update = next(
            (r for r in records if r["pk"] == acc_id and r["operation"] == "update"),
            None,
        )
        assert acc_update is not None, "Expected account to appear as 'update' after color change"


# ── T019-T021: Backward compatibility — old CSV imports ──────────────────────


@pytest.mark.django_db
class TestBackwardCompatImport:
    """Importing a CSV that predates new fields succeeds with safe defaults."""

    def _make_csv(self, headers: list[str], rows: list[dict]) -> str:
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
        return output.getvalue()

    def test_currency_csv_without_is_base_currency(self):
        """Old currency CSV missing is_base_currency imports without error."""
        from data_io.registry import get_table
        from data_io.services.csv_importer import parse_csv

        descriptor = get_table("finance.currency")
        # Build a minimal CSV without is_base_currency
        old_csv = self._make_csv(
            headers=["code:string", "name:text", "symbol:text"],
            rows=[{"code:string": "EUR", "name:text": "Euro", "symbol:text": "€"}],
        )
        parsed_rows, errors = parse_csv(old_csv, descriptor)
        assert not errors, f"Expected no errors for old CSV, got: {errors}"
        assert len(parsed_rows) == 1

    def test_currency_import_defaults_is_base_currency_to_false(self, auth_client, db):
        """After importing old CSV, is_base_currency defaults to False."""
        from data_io.registry import get_table
        from data_io.services.csv_importer import parse_csv
        from data_io.services.change_preview import compute_diff, apply_diff

        descriptor = get_table("finance.currency")
        old_csv = self._make_csv(
            headers=["code:string", "name:text", "symbol:text"],
            rows=[{"code:string": "GBP", "name:text": "British Pound", "symbol:text": "£"}],
        )
        parsed_rows, errors = parse_csv(old_csv, descriptor)
        assert not errors
        records = compute_diff(parsed_rows, descriptor, mode="upsert")
        apply_diff(records, descriptor, mode="upsert")

        gbp = Currency.objects.get(code="GBP")
        assert gbp.is_base_currency is False, (
            "is_base_currency should default to False when absent from old CSV"
        )

    def test_account_csv_without_color(self, auth_client, db, usd):
        """Old account CSV missing color imports without error, defaults to empty string."""
        from data_io.registry import get_table
        from data_io.services.csv_importer import parse_csv
        from data_io.services.change_preview import compute_diff, apply_diff

        descriptor = get_table("finance.account")
        old_csv = self._make_csv(
            headers=[
                "id:string",
                "name:text",
                "currency:string",
                "open_datetime:datetime",
                "close_datetime:datetime",
            ],
            rows=[
                {
                    "id:string": "test000001ab",
                    "name:text": "Old Account",
                    "currency:string": "USD",
                    "open_datetime:datetime": "2020-01-01T00:00:00Z",
                    "close_datetime:datetime": "",
                }
            ],
        )
        parsed_rows, errors = parse_csv(old_csv, descriptor)
        assert not errors, f"Expected no errors for old account CSV, got: {errors}"
        records = compute_diff(parsed_rows, descriptor, mode="upsert")
        apply_diff(records, descriptor, mode="upsert")

        acc = Account.objects.get(pk="test000001ab")
        assert acc.color == "", "color should default to empty string when absent from old CSV"

    def test_account_csv_without_timestamps(self, auth_client, db, usd):
        """Old account CSV missing created_at/updated_at imports without error."""
        from data_io.registry import get_table
        from data_io.services.csv_importer import parse_csv
        from data_io.services.change_preview import compute_diff, apply_diff

        descriptor = get_table("finance.account")
        old_csv = self._make_csv(
            headers=[
                "id:string",
                "name:text",
                "currency:string",
                "color:string",
                "open_datetime:datetime",
                "close_datetime:datetime",
            ],
            rows=[
                {
                    "id:string": "test000002ab",
                    "name:text": "Timestamp Account",
                    "currency:string": "USD",
                    "color:string": "",
                    "open_datetime:datetime": "2021-01-01T00:00:00Z",
                    "close_datetime:datetime": "",
                }
            ],
        )
        parsed_rows, errors = parse_csv(old_csv, descriptor)
        assert not errors, f"Expected no errors for old account CSV (no timestamps): {errors}"
        records = compute_diff(parsed_rows, descriptor, mode="upsert")
        apply_diff(records, descriptor, mode="upsert")
        # Should exist without error
        assert Account.objects.filter(pk="test000002ab").exists()


# ── T024: Timestamp round-trip fidelity ──────────────────────────────────────


@pytest.mark.django_db
class TestTimestampRoundTrip:
    """Push-and-pull preserves created_at exactly."""

    def test_account_created_at_preserved(self, auth_client, usd):
        """After export + apply, created_at is the original value, not import time."""
        from data_io.registry import get_table
        from data_io.services.csv_exporter import export_table
        from data_io.services.csv_importer import parse_csv
        from data_io.services.change_preview import compute_diff, apply_diff

        # Create account
        acc_resp = auth_client.post(
            "/api/v1/finance/accounts/",
            {"name": "Timestamp Test", "currency": "USD", "open_datetime": "2020-01-01T00:00:00Z"},
            content_type="application/json",
        )
        acc_id = acc_resp.json()["id"]

        original_created_at = Account.objects.get(pk=acc_id).created_at

        # Export and delete
        descriptor = get_table("finance.account")
        csv_bytes = export_table(descriptor)
        Account.objects.filter(pk=acc_id).delete()

        # Re-import
        parsed_rows, errors = parse_csv(csv_bytes.decode(), descriptor)
        assert not errors
        records = compute_diff(parsed_rows, descriptor, mode="upsert")
        apply_diff(records, descriptor, mode="upsert")

        restored = Account.objects.get(pk=acc_id)
        # Require exact microsecond match — no tolerance.
        # If auto_now_add is not bypassed during CREATE, created_at will be the
        # import time (different from the original), and this assertion will fail.
        assert restored.created_at == original_created_at, (
            f"created_at not preserved: original={original_created_at}, "
            f"restored={restored.created_at}"
        )
