"""Iteration 5: the CostFactor `type` system attribute becomes free-form text.

Reseeds the seeded AttributeDefinition from single_select (with options) → text.
"""

from django.db import migrations


def _set_type_attr(apps, data_type, options):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    CostFactor = apps.get_model("inventory", "CostFactor")
    ct = ContentType.objects.get_for_model(CostFactor)
    AttributeDefinition.objects.filter(content_type=ct, name="type", is_system=True).update(
        data_type=data_type, options=options
    )


def forward(apps, schema_editor):
    _set_type_attr(apps, "text", [])


def reverse(apps, schema_editor):
    _set_type_attr(
        apps,
        "single_select",
        ["accumulated", "shipping", "discount", "tax_refund", "paid_by_other", "other"],
    )


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0009_costfactor_order_freeform"),
        ("core", "0001_initial"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
