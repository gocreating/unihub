"""Seed the diameter and temperature system parameter definitions (FR-026).

Iteration 30: the legacy sheets carry 直徑/耐溫 keyed values with no matching
definition; system definitions have no edit UI, so they are migration-seeded
(dimension type, length/temperature families, default emojis).
"""

from django.db import migrations

NEW_DEFS = [
    {"name": "diameter", "unit_family": "length", "emoji": "📏", "display_order": 20},
    {"name": "temperature", "unit_family": "temperature", "emoji": "🌡", "display_order": 21},
]


def seed(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    try:
        item_ct = ContentType.objects.get(app_label="inventory", model="item")
    except ContentType.DoesNotExist:
        return
    for entry in NEW_DEFS:
        AttributeDefinition.objects.get_or_create(
            content_type=item_ct,
            name=entry["name"],
            defaults={
                "data_type": "dimension",
                "unit_family": entry["unit_family"],
                "emoji": entry["emoji"],
                "display_order": entry["display_order"],
                "is_system": True,
            },
        )


def unseed(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    try:
        item_ct = ContentType.objects.get(app_label="inventory", model="item")
    except ContentType.DoesNotExist:
        return
    AttributeDefinition.objects.filter(
        content_type=item_ct,
        name__in=[e["name"] for e in NEW_DEFS],
        is_system=True,
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0016_seed_parameter_emojis"),
        ("core", "0004_attributedefinition_emoji"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
