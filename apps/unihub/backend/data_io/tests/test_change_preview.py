"""Tests for data_io/services/change_preview.py — compute_diff and apply_diff."""

import pytest

from data_io.registry import FieldDescriptor, TableDescriptor, _restore_registry, _save_registry, register
from data_io.services.change_preview import compute_diff


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
            FieldDescriptor(column_name="code", csv_header="code:string", data_type="string", is_pk=True),
            FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
            FieldDescriptor(column_name="symbol", csv_header="symbol:text", data_type="text", nullable=True),
        ],
        has_user_attributes=False,
        import_order=1,
    )
    register(d)
    return d


@pytest.mark.django_db
class TestComputeDiff:
    def test_new_pk_produces_create_record(self, currency_descriptor):
        rows = [{"code:string": "USD", "name:text": "US Dollar", "symbol:text": "$"}]
        records = compute_diff(rows, currency_descriptor, mode="upsert")
        creates = [r for r in records if r["operation"] == "create"]
        assert len(creates) == 1
        assert creates[0]["pk"] == "USD"
        assert creates[0]["before"] is None
        assert creates[0]["after"]["name:text"] == "US Dollar"

    def test_existing_pk_with_changed_field_produces_update(self, db, currency_descriptor):
        from finance.models import Currency

        Currency.objects.create(code="USD", name="Old Name", symbol="$")
        rows = [{"code:string": "USD", "name:text": "New Name", "symbol:text": "$"}]
        records = compute_diff(rows, currency_descriptor, mode="upsert")
        updates = [r for r in records if r["operation"] == "update"]
        assert len(updates) == 1
        assert updates[0]["pk"] == "USD"
        assert "name:text" in updates[0]["changed_fields"]
        assert updates[0]["before"]["name:text"] == "Old Name"
        assert updates[0]["after"]["name:text"] == "New Name"

    def test_existing_pk_unchanged_not_included(self, db, currency_descriptor):
        from finance.models import Currency

        Currency.objects.create(code="USD", name="US Dollar", symbol="$")
        rows = [{"code:string": "USD", "name:text": "US Dollar", "symbol:text": "$"}]
        records = compute_diff(rows, currency_descriptor, mode="upsert")
        assert records == []

    def test_upsert_mode_does_not_emit_delete_for_absent_rows(self, db, currency_descriptor):
        from finance.models import Currency

        Currency.objects.create(code="EUR", name="Euro", symbol="€")
        rows = [{"code:string": "USD", "name:text": "US Dollar", "symbol:text": "$"}]
        records = compute_diff(rows, currency_descriptor, mode="upsert")
        deletes = [r for r in records if r["operation"] == "delete"]
        assert deletes == []

    def test_replace_mode_emits_delete_for_absent_db_rows(self, db, currency_descriptor):
        from finance.models import Currency

        Currency.objects.create(code="EUR", name="Euro", symbol="€")
        rows = [{"code:string": "USD", "name:text": "US Dollar", "symbol:text": "$"}]
        records = compute_diff(rows, currency_descriptor, mode="replace")
        deletes = [r for r in records if r["operation"] == "delete"]
        assert len(deletes) == 1
        assert deletes[0]["pk"] == "EUR"
