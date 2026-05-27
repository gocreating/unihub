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

    @property
    def depends_on(self) -> list[str]:
        """Unique FK content_type_labels this table directly depends on, in field order."""
        seen: set[str] = set()
        result: list[str] = []
        for fd in self.system_fields:
            if fd.is_fk and fd.fk_content_type_label and fd.fk_content_type_label not in seen:
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
        raise KeyError(
            f"Table '{content_type_label}' is not registered in the io registry."
        )
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
