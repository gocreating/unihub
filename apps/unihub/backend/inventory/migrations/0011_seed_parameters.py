"""Iteration 14 (1/2): seed the seven system parameter definitions and copy
each Item's concrete parameter values into shared AttributeValues.

Runs BEFORE the column drop (0012) so the data migrates losslessly.
"""

from django.db import migrations

# (name, data_type, unit_family) — display_order follows list position.
SYSTEM_DEFS = [
    ("color", "text", ""),
    ("size", "text", ""),
    ("weight", "dimension", "weight"),
    ("length", "dimension", "length"),
    ("width", "dimension", "length"),
    ("height", "dimension", "length"),
    ("volume", "dimension", "volume"),
]

# (definition name, canonical field, unit field)
MEASURES = [
    ("weight", "weight_canonical", "weight_unit"),
    ("length", "length_canonical", "length_unit"),
    ("width", "width_canonical", "width_unit"),
    ("height", "height_canonical", "height_unit"),
    ("volume", "volume_canonical", "volume_unit"),
]


def _fmt(value) -> str:
    """Format a decimal without trailing zeros or scientific notation."""
    normalized = value.normalize()
    return format(normalized, "f")


def seed_and_copy(apps, schema_editor):
    from core import units as core_units

    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    AttributeValue = apps.get_model("core", "AttributeValue")
    Item = apps.get_model("inventory", "Item")

    item_ct, _ = ContentType.objects.get_or_create(app_label="inventory", model="item")

    # The pre-iteration-14 convention seeded system defs MIRRORING the concrete
    # columns (name, quantity, weight:number + weight_unit:single_select, …).
    # Parameters are now real attribute data: purge the obsolete mirrors (they
    # never held values) and reshape the seven parameter keys to their new
    # types. User-created definitions (is_system=False) are never touched.
    keep = {name for name, _dt, _fam in SYSTEM_DEFS}
    AttributeDefinition.objects.filter(content_type=item_ct, is_system=True).exclude(
        name__in=keep
    ).delete()

    definitions = {}
    for order, (name, data_type, family) in enumerate(SYSTEM_DEFS):
        definition, _created = AttributeDefinition.objects.update_or_create(
            content_type=item_ct,
            name=name,
            defaults={
                "data_type": data_type,
                "unit_family": family,
                "is_system": True,
                "display_order": order,
                "options": [],
            },
        )
        definitions[name] = definition

    for item in Item.objects.all().iterator():
        rows = []
        if item.color:
            rows.append((definitions["color"], item.color, "", None))
        if item.size:
            rows.append((definitions["size"], item.size, "", None))
        for name, canonical_field, unit_field in MEASURES:
            canonical = getattr(item, canonical_field)
            if canonical is None:
                continue
            unit = getattr(item, unit_field)
            table = core_units.FAMILY_UNITS[definitions[name].unit_family]
            display = core_units.from_canonical(canonical, unit, table)
            rows.append((definitions[name], _fmt(display), unit, canonical))
        for definition, value, unit, number in rows:
            AttributeValue.objects.update_or_create(
                attribute_definition_id=definition.id,
                content_type=item_ct,
                object_id=item.id,
                defaults={"value": value, "value_unit": unit, "value_number": number},
            )


class Migration(migrations.Migration):
    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
        ("core", "0002_dimension_attrs"),
        ("inventory", "0010_reseed_costfactor_type"),
    ]

    operations = [
        migrations.RunPython(seed_and_copy, migrations.RunPython.noop),
    ]
