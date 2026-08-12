"""Seed default emojis on the system Item parameter definitions (FR-032).

System definitions have no edit UI, so the migration is the only path for them
to carry an emoji; user-created definitions set it at creation time.
"""

from django.db import migrations

DEFAULT_EMOJIS = {
    "color": "🎨",
    "size": "👕",
    "weight": "⚖",
    "length": "📏",
    "width": "📏",
    "height": "📏",
    "volume": "🧴",
}


def seed_emojis(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    try:
        item_ct = ContentType.objects.get(app_label="inventory", model="item")
    except ContentType.DoesNotExist:
        return
    for name, emoji in DEFAULT_EMOJIS.items():
        AttributeDefinition.objects.filter(content_type=item_ct, name=name, is_system=True).update(
            emoji=emoji
        )


def unseed_emojis(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    try:
        item_ct = ContentType.objects.get(app_label="inventory", model="item")
    except ContentType.DoesNotExist:
        return
    AttributeDefinition.objects.filter(
        content_type=item_ct, name__in=DEFAULT_EMOJIS, is_system=True
    ).update(emoji="")


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0015_legacy_ref"),
        ("core", "0004_attributedefinition_emoji"),
    ]

    operations = [
        migrations.RunPython(seed_emojis, unseed_emojis),
    ]
