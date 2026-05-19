"""
BalanceSheet and Balance models are defined in 0001_initial.py.
This migration seeds system AttributeDefinitions for BalanceSheet.
"""

from django.db import migrations


def seed_balancesheet_attrs(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    BalanceSheet = apps.get_model("finance", "BalanceSheet")

    ct = ContentType.objects.get_for_model(BalanceSheet)
    attrs = [
        {"name": "date", "data_type": "date", "display_order": 0},
        {"name": "label", "data_type": "text", "display_order": 1},
        {"name": "base_currency", "data_type": "text", "display_order": 2},
    ]
    for attr in attrs:
        AttributeDefinition.objects.get_or_create(
            content_type=ct,
            name=attr["name"],
            defaults={**attr, "is_system": True},
        )


def unseed_balancesheet_attrs(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    BalanceSheet = apps.get_model("finance", "BalanceSheet")
    ct = ContentType.objects.get_for_model(BalanceSheet)
    AttributeDefinition.objects.filter(content_type=ct, is_system=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0002_seed_account_system_attrs"),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_balancesheet_attrs, unseed_balancesheet_attrs),
    ]
