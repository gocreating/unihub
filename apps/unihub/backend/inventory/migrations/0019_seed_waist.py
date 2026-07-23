"""Seed the 腰圍 (waist) system parameter definition (FR-029k, iteration 42)."""

from django.db import migrations


def seed(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    try:
        item_ct = ContentType.objects.get(app_label="inventory", model="item")
    except ContentType.DoesNotExist:
        return
    AttributeDefinition.objects.get_or_create(
        content_type=item_ct,
        name="waist",
        defaults={
            "data_type": "dimension",
            "unit_family": "length",
            "emoji": "📏",
            "display_order": 22,
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
    AttributeDefinition.objects.filter(content_type=item_ct, name="waist", is_system=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0018_item_deprecated"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
