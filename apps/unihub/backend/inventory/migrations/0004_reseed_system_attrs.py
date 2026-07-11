"""Refresh Item/Acquisition system AttributeDefinitions to the refined field set."""

from django.db import migrations

ITEM_ATTRS = [
    {"name": "name", "data_type": "text"},
    {"name": "item_type", "data_type": "single_select", "options": ["stockable", "consumable"]},
    {"name": "model", "data_type": "text"},
    {"name": "serial_number", "data_type": "text"},
    {"name": "spec", "data_type": "long_text"},
    {"name": "remark", "data_type": "long_text"},
    {"name": "quantity", "data_type": "number"},
    {"name": "length", "data_type": "number"},
    {"name": "length_unit", "data_type": "single_select", "options": ["mm", "cm", "m", "in"]},
    {"name": "width", "data_type": "number"},
    {"name": "width_unit", "data_type": "single_select", "options": ["mm", "cm", "m", "in"]},
    {"name": "height", "data_type": "number"},
    {"name": "height_unit", "data_type": "single_select", "options": ["mm", "cm", "m", "in"]},
    {"name": "size", "data_type": "text"},
    {"name": "weight", "data_type": "number"},
    {"name": "weight_unit", "data_type": "single_select", "options": ["g", "kg", "lb"]},
    {"name": "price", "data_type": "number"},
    {"name": "price_currency", "data_type": "text"},
    {"name": "cost", "data_type": "number"},
    {"name": "cost_currency", "data_type": "text"},
    {"name": "color", "data_type": "text"},
    {"name": "url", "data_type": "text"},
    {"name": "status", "data_type": "single_select", "options": ["active", "deprecated"]},
]

ACQUISITION_ATTRS = [
    {"name": "source", "data_type": "text"},
    {
        "name": "method",
        "data_type": "single_select",
        "options": ["purchase", "gift", "transfer", "found", "other"],
    },
    {"name": "obtained_at", "data_type": "date"},
    {"name": "remark", "data_type": "long_text"},
]

# Attribute names removed in this iteration (deleted from the system set).
REMOVED = {
    "Item": ["category", "storage_location", "purchase_time"],
    "Acquisition": ["arrived_at", "cost"],
}


def _reseed(apps, model_name, attrs):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    Model = apps.get_model("inventory", model_name)
    ct = ContentType.objects.get_for_model(Model)

    # Drop removed system attrs.
    AttributeDefinition.objects.filter(
        content_type=ct, is_system=True, name__in=REMOVED.get(model_name, [])
    ).delete()

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
    _reseed(apps, "Item", ITEM_ATTRS)
    _reseed(apps, "Acquisition", ACQUISITION_ATTRS)


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0003_refine_fields"),
        ("core", "0001_initial"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(forward, reverse_noop),
    ]
