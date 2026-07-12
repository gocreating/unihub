"""Attribute-aware helpers: typed value computation and queryset annotation.

Iteration 14 introduced dynamic entity parameters. Filter/sort keys of the form
``attr:<definition_id>`` are resolved here into scalar-subquery annotations so
DRF filter backends can treat them like concrete columns; rows lacking a value
annotate to NULL (honouring the ``__nullsfirst``/``__nullslast`` suffixes).
"""

from decimal import Decimal, InvalidOperation

from django.db.models import DecimalField, OuterRef, QuerySet, Subquery, TextField
from rest_framework import serializers

from core import units
from core.models import AttributeDefinition, AttributeValue

ATTR_KEY_PREFIX = "attr:"

# Data types whose values order/filter by the canonical numeric column.
NUMERIC_DATA_TYPES = frozenset({"number", "dimension"})


def parse_attr_key(key: str) -> str | None:
    """Return the definition id encoded in an ``attr:<id>`` key, else None.

    Args:
        key: A toolbar filter/sort field name.

    Returns:
        The definition id, or None when the key is not attribute-shaped.
    """
    if isinstance(key, str) and key.startswith(ATTR_KEY_PREFIX):
        return key[len(ATTR_KEY_PREFIX) :]
    return None


def attr_alias(definition_id: str) -> str:
    """Return a queryset-annotation-safe alias for a definition id."""
    return "attr_" + "".join(c if c.isalnum() else "_" for c in definition_id)


def resolve_view_definition(view, definition_id: str) -> AttributeDefinition | None:
    """Resolve a definition id against the view's declared attribute content type.

    Args:
        view: A DRF view; opts in by declaring ``attribute_content_type`` as an
            ``"app_label.model"`` string.
        definition_id: The id parsed from an ``attr:<id>`` key.

    Returns:
        The matching AttributeDefinition, or None (unknown ids are skipped so
        the API stays stable as definitions come and go).
    """
    ct_label = getattr(view, "attribute_content_type", None)
    if not ct_label:
        return None
    cache: dict = getattr(view, "_attr_definition_cache", None)
    if cache is None:
        cache = {}
        view._attr_definition_cache = cache
    if definition_id in cache:
        return cache[definition_id]
    app_label, _, model = ct_label.partition(".")
    definition = (
        AttributeDefinition.objects.select_related("content_type")
        .filter(pk=definition_id, content_type__app_label=app_label, content_type__model=model)
        .first()
    )
    cache[definition_id] = definition
    return definition


def annotate_attribute(queryset: QuerySet, definition: AttributeDefinition) -> tuple[QuerySet, str]:
    """Annotate ``queryset`` with the entity's value for ``definition``.

    Args:
        queryset: The entity queryset (model must match the definition's
            content type).
        definition: The attribute definition to surface.

    Returns:
        ``(queryset, alias)`` — the annotated queryset and the annotation name.
        Numeric/dimension definitions annotate the canonical ``value_number``;
        everything else annotates the text ``value``.
    """
    alias = attr_alias(definition.id)
    if alias in queryset.query.annotations:
        return queryset, alias
    values = AttributeValue.objects.filter(
        attribute_definition=definition,
        content_type=definition.content_type,
        object_id=OuterRef("pk"),
    )
    if definition.data_type in NUMERIC_DATA_TYPES:
        expr = Subquery(
            values.values("value_number")[:1],
            output_field=DecimalField(max_digits=20, decimal_places=4),
        )
    else:
        expr = Subquery(values.values("value")[:1], output_field=TextField())
    return queryset.annotate(**{alias: expr}), alias


def filter_type_for(definition: AttributeDefinition) -> str:
    """Map a definition's data type onto the EntityFilterBackend type vocabulary."""
    return "number" if definition.data_type in NUMERIC_DATA_TYPES else "text"


def compute_value_fields(
    definition: AttributeDefinition, value, unit: str = ""
) -> tuple[str, str, Decimal | None]:
    """Validate and normalise a raw attribute value for storage.

    Args:
        definition: The attribute definition the value belongs to.
        value: The raw entered value.
        unit: The entered unit (dimension definitions only).

    Returns:
        ``(value, value_unit, value_number)`` ready for AttributeValue fields.

    Raises:
        serializers.ValidationError: On a non-numeric value for numeric or
            dimension types, a unit outside the definition's family, or a
            select value outside the definition's options.
    """
    text = "" if value is None else str(value)
    if definition.data_type == "dimension":
        table = units.FAMILY_UNITS.get(definition.unit_family)
        if table is None:
            raise serializers.ValidationError(
                {definition.name: "Definition has no valid unit family."}
            )
        if unit not in table:
            raise serializers.ValidationError(
                {
                    definition.name: f"Unsupported unit {unit!r} for family {definition.unit_family!r}."
                }
            )
        try:
            number = Decimal(text)
        except (InvalidOperation, TypeError):
            raise serializers.ValidationError({definition.name: "value must be a number."})
        return text, unit, units.to_canonical(number, unit, table)
    if definition.data_type == "number":
        try:
            number = Decimal(text)
        except (InvalidOperation, TypeError):
            raise serializers.ValidationError({definition.name: "value must be a number."})
        return text, "", number
    if (
        definition.data_type == "single_select"
        and definition.options
        and text not in definition.options
    ):
        raise serializers.ValidationError(
            {definition.name: "Value must be one of the defined options."}
        )
    return text, "", None
