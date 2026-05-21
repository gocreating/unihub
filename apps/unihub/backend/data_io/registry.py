from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FieldDescriptor:
    """Describes a single column in a registered table's CSV schema."""

    column_name: str
    csv_header: str  # e.g. "id:string" or "[priority]:single_select"
    data_type: str
    is_pk: bool = False
    is_fk: bool = False
    fk_content_type_label: str | None = None
    nullable: bool = False
    use_natural_key: bool = False  # For FK fields serialized as "app_label.model"
    is_json: bool = False  # For JSONField (serialized as JSON string in CSV)


@dataclass
class TableDescriptor:
    """Registry entry for a single exportable/importable table."""

    content_type_label: str  # e.g. "finance.account"
    display_name: str
    model_class: type
    system_fields: list[FieldDescriptor] = field(default_factory=list)
    has_user_attributes: bool = False
    import_order: int = 99


_registry: dict[str, TableDescriptor] = {}


def register(descriptor: TableDescriptor) -> None:
    """Register a table descriptor. Raises ValueError on duplicate registration."""
    if descriptor.content_type_label in _registry:
        raise ValueError(
            f"Table '{descriptor.content_type_label}' is already registered in the io registry."
        )
    _registry[descriptor.content_type_label] = descriptor


def get_registry() -> dict[str, TableDescriptor]:
    """Return a snapshot of the registry (sorted by import_order)."""
    return dict(sorted(_registry.items(), key=lambda kv: kv[1].import_order))


def get_table(content_type_label: str) -> TableDescriptor:
    """Return the descriptor for a registered table. Raises KeyError if not found."""
    if content_type_label not in _registry:
        raise KeyError(
            f"Table '{content_type_label}' is not registered in the io registry."
        )
    return _registry[content_type_label]


def _clear_registry() -> None:
    """Remove all registered tables. Used in tests only."""
    _registry.clear()


def _save_registry() -> dict[str, TableDescriptor]:
    """Return a shallow copy of the current registry. Used in tests only."""
    return dict(_registry)


def _restore_registry(saved: dict[str, TableDescriptor]) -> None:
    """Replace registry contents with a previously saved snapshot. Used in tests only."""
    _registry.clear()
    _registry.update(saved)
