"""Refresh system AttributeDefinitions for iteration 4 (cost factors, no item_type)."""

from django.db import migrations

COSTFACTOR_ATTRS = [
    {"name": "value", "data_type": "number"},
    {"name": "currency", "data_type": "text"},
    {
        "name": "type",
        "data_type": "single_select",
        "options": ["accumulated", "shipping", "discount", "tax_refund", "paid_by_other", "other"],
    },
]

# Attribute names removed from existing content types this iteration.
REMOVED = {
    "Item": ["item_type"],
    "Acquisition": ["cost", "cost_currency", "discount", "tax_refund"],
}


def _drop(apps, model_name, names):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    Model = apps.get_model("inventory", model_name)
    ct = ContentType.objects.get_for_model(Model)
    AttributeDefinition.objects.filter(content_type=ct, is_system=True, name__in=names).delete()


def _seed(apps, model_name, attrs):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    Model = apps.get_model("inventory", model_name)
    ct = ContentType.objects.get_for_model(Model)
    for order, attr in enumerate(attrs):
        options = attr.get("options", [])
        obj, created = AttributeDefinition.objects.get_or_create(
            content_type=ct,
            name=attr["name"],
            defaults={
                "data_type": attr["data_type"],
                "is_system": True,
                "display_order": order,
                "options": options,
            },
        )
        if not created:
            obj.data_type = attr["data_type"]
            obj.display_order = order
            obj.options = options
            obj.is_system = True
            obj.save()


def forward(apps, schema_editor):
    _drop(apps, "Item", REMOVED["Item"])
    _drop(apps, "Acquisition", REMOVED["Acquisition"])
    _seed(apps, "CostFactor", COSTFACTOR_ATTRS)


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0007_cost_factors"),
        ("core", "0001_initial"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(forward, reverse_noop),
    ]
