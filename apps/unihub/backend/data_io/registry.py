from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


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
    optional: bool = False  # If True, absence in an imported CSV is not an error
    default_value: Any = None  # Value used when the column is absent in an old CSV


@dataclass
class TableDescriptor:
    """Registry entry for a single exportable/importable table."""

    content_type_label: str  # e.g. "finance.account"
    display_name: str
    model_class: type
    system_fields: list[FieldDescriptor] = field(default_factory=list)
    has_user_attributes: bool = False
    import_order: int = 99
    # Per-user tables: name of a model field that is NEVER serialized (exclude
    # it from system_fields) and is stamped with the acting user on import.
    # Importing such a table without an acting user is an explicit error.
    owner_field: str | None = None

    @property
    def depends_on(self) -> list[str]:
        """Unique FK content_type_labels this table directly depends on, in field order.

        FKs resolved via natural key (use_natural_key=True) are excluded — they
        reference Django system tables (e.g. contenttypes.contenttype) that are
        always present and are never part of a user import batch.
        """
        seen: set[str] = set()
        result: list[str] = []
        for fd in self.system_fields:
            if (
                fd.is_fk
                and fd.fk_content_type_label
                and not fd.use_natural_key
                and fd.fk_content_type_label not in seen
            ):
                seen.add(fd.fk_content_type_label)
                result.append(fd.fk_content_type_label)
        return result


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
        raise KeyError(f"Table '{content_type_label}' is not registered in the io registry.")
    return _registry[content_type_label]


def topo_sort(labels: list[str]) -> list[str]:
    """Return labels sorted in topological dependency order (dependencies first).

    Only edges between labels in the input set are considered. Unknown labels and
    cycles fall back to the original input order for the affected nodes.
    """
    label_set = set(labels)
    in_degree: dict[str, int] = {lbl: 0 for lbl in labels}
    dependents: dict[str, list[str]] = {lbl: [] for lbl in labels}

    for label in labels:
        try:
            descriptor = get_table(label)
        except KeyError:
            continue
        for dep in descriptor.depends_on:
            if dep in label_set:
                in_degree[label] += 1
                dependents[dep].append(label)

    queue = [lbl for lbl in labels if in_degree[lbl] == 0]
    result: list[str] = []

    while queue:
        node = queue.pop(0)
        result.append(node)
        for dependent in dependents[node]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    result_set = set(result)
    result.extend(lbl for lbl in labels if lbl not in result_set)
    return result


def _field_to_data_type(field_obj: Any) -> str:
    """Map a Django field instance to a data_io data_type string.

    Args:
        field_obj: A Django model field from ``model._meta.concrete_fields``.

    Returns:
        One of: ``"boolean"``, ``"datetime"``, ``"decimal"``, ``"float"``,
        ``"integer"``, ``"json"``, ``"string"``, ``"text"``.
    """
    from django.db import models as dj

    if isinstance(field_obj, (dj.BooleanField, dj.NullBooleanField)):
        return "boolean"
    if isinstance(field_obj, (dj.DateTimeField, dj.DateField)):
        return "datetime"
    if isinstance(field_obj, dj.DecimalField):
        return "decimal"
    if isinstance(field_obj, dj.FloatField):
        return "float"
    if isinstance(
        field_obj,
        (
            dj.IntegerField,
            dj.AutoField,
            dj.BigAutoField,
            dj.SmallAutoField,
            dj.SmallIntegerField,
            dj.BigIntegerField,
            dj.PositiveIntegerField,
            dj.PositiveSmallIntegerField,
        ),
    ):
        return "integer"
    if isinstance(field_obj, dj.JSONField):
        return "json"
    # ForeignKey is a relation stored as a char/int column
    if hasattr(field_obj, "remote_field") and field_obj.remote_field is not None:
        return "string"
    # CharField and TextField: use "string" for short identifiers, "text" for long
    max_len = getattr(field_obj, "max_length", None)
    if max_len is not None and max_len <= 50:
        return "string"
    return "text"


def _field_default_value(field_obj: Any) -> Any:
    """Return a safe default value for a Django field when it is absent in an old CSV.

    Args:
        field_obj: A Django model field.

    Returns:
        A Python value appropriate as the missing-column default.
    """
    from django.db import models as dj
    from django.db.models.fields import NOT_PROVIDED

    if isinstance(field_obj, (dj.BooleanField, dj.NullBooleanField)):
        raw = field_obj.default
        if raw is not NOT_PROVIDED:
            return raw
        return False if not field_obj.null else None
    if field_obj.null:
        return None
    raw = field_obj.default
    if raw is not NOT_PROVIDED and not callable(raw):
        return raw
    if isinstance(field_obj, (dj.CharField, dj.TextField)) and field_obj.blank:
        return ""
    return None


def auto_system_fields(
    model_class: type,
    exclude: set[str] | None = None,
    fk_overrides: dict[str, dict[str, Any]] | None = None,
) -> list[FieldDescriptor]:
    """Generate FieldDescriptors from ``model_class._meta.concrete_fields``.

    This function ensures every concrete model field is represented in the
    sync registry without requiring manual maintenance.  When a new field is
    added to a model it is automatically included in the next export/import
    without any change to the registration code.

    Args:
        model_class: The Django model class to introspect.
        exclude: Set of field ``attname`` values to skip (e.g. ``{"updated_at"}``).
        fk_overrides: Maps FK field attname to additional ``FieldDescriptor`` kwargs.
            Required for FK fields that need ``fk_content_type_label``::

                {
                    "account_id": {
                        "is_fk": True,
                        "fk_content_type_label": "finance.account",
                    }
                }

    Returns:
        List of ``FieldDescriptor`` objects, one per concrete model field.
    """
    exclude = exclude or set()
    fk_overrides = fk_overrides or {}
    descriptors: list[FieldDescriptor] = []

    for f in model_class._meta.concrete_fields:
        attname: str = f.attname
        if attname in exclude:
            continue

        data_type = _field_to_data_type(f)
        csv_header = f"{attname}:{data_type}"
        is_pk = bool(f.primary_key)
        is_fk = bool(f.is_relation and hasattr(f, "column"))
        # nullable=True means the DB column accepts NULL; mirrors field.null.
        # Do not conflate with field.blank (which allows empty strings in forms).
        nullable = bool(f.null)
        is_json = data_type == "json"

        # Determine whether this field is optional in older CSV imports.
        # PK fields are always required.  Non-PK fields are optional when they
        # have a safe default (blank, null, or an explicit default value) so
        # that CSVs created before this field was added can still be imported.
        if is_pk:
            optional = False
            default = None
        else:
            from django.db.models.fields import NOT_PROVIDED

            auto_now = getattr(f, "auto_now", False)
            auto_now_add = getattr(f, "auto_now_add", False)
            has_default = (
                f.null
                or getattr(f, "blank", False)
                or auto_now
                or auto_now_add
                or (getattr(f, "default", NOT_PROVIDED) is not NOT_PROVIDED)
            )
            optional = bool(has_default)
            default = _field_default_value(f)

        kwargs: dict[str, Any] = {
            "column_name": attname,
            "csv_header": csv_header,
            "data_type": data_type,
            "is_pk": is_pk,
            "is_fk": is_fk,
            "nullable": nullable,
            "is_json": is_json,
            "optional": optional,
            "default_value": default,
        }

        # Merge caller-supplied FK overrides (e.g. fk_content_type_label)
        if attname in fk_overrides:
            kwargs.update(fk_overrides[attname])

        descriptors.append(FieldDescriptor(**kwargs))

    return descriptors


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
