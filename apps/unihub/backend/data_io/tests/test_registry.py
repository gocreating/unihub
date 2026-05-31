"""Tests for io/registry.py — run before implementation to confirm RED phase."""

import pytest

from data_io.registry import (
    FieldDescriptor,
    TableDescriptor,
    _clear_registry,
    _restore_registry,
    _save_registry,
    get_registry,
    get_table,
    register,
)


@pytest.fixture(autouse=True)
def isolate_registry():
    """Isolate registry state between tests without wiping AppConfig registrations."""
    saved = _save_registry()
    _clear_registry()
    yield
    _restore_registry(saved)


def _make_descriptor(label: str = "fake.model", order: int = 1) -> TableDescriptor:
    return TableDescriptor(
        content_type_label=label,
        display_name="Fake",
        model_class=object,
        system_fields=[
            FieldDescriptor(
                column_name="id", csv_header="id:string", data_type="string", is_pk=True
            )
        ],
        import_order=order,
    )


class TestRegister:
    def test_register_succeeds(self):
        d = _make_descriptor("fake.model")
        register(d)
        assert get_table("fake.model") is d

    def test_duplicate_registration_raises(self):
        register(_make_descriptor("fake.model"))
        with pytest.raises(ValueError, match="already registered"):
            register(_make_descriptor("fake.model"))

    def test_get_table_unknown_raises_key_error(self):
        with pytest.raises(KeyError):
            get_table("nonexistent.model")

    def test_get_registry_returns_snapshot(self):
        d1 = _make_descriptor("a.model", order=2)
        d2 = _make_descriptor("b.model", order=1)
        register(d1)
        register(d2)
        reg = get_registry()
        assert list(reg.keys()) == ["b.model", "a.model"]  # sorted by import_order

    def test_field_descriptor_defaults(self):
        f = FieldDescriptor(column_name="name", csv_header="name:text", data_type="text")
        assert f.is_pk is False
        assert f.is_fk is False
        assert f.nullable is False
        assert f.use_natural_key is False
        assert f.is_json is False
