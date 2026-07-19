from django.db import migrations

ITEM_ATTRS = [
    {"name": "name", "data_type": "text"},
    {"name": "item_type", "data_type": "single_select", "options": ["stockable", "consumable"]},
    {"name": "category", "data_type": "text"},
    {"name": "model", "data_type": "text"},
    {"name": "serial_number", "data_type": "text"},
    {"name": "quantity", "data_type": "number"},
    {"name": "length", "data_type": "number"},
    {"name": "width", "data_type": "number"},
    {"name": "height", "data_type": "number"},
    {"name": "size", "data_type": "text"},
    {"name": "weight", "data_type": "number"},
    {"name": "price", "data_type": "number"},
    {"name": "cost", "data_type": "number"},
    {"name": "purchase_time", "data_type": "date"},
    {"name": "storage_location", "data_type": "text"},
    {
        "name": "status",
        "data_type": "single_select",
        "options": ["available", "in_use", "lost", "retired"],
    },
]

ACQUISITION_ATTRS = [
    {"name": "source", "data_type": "text"},
    {
        "name": "method",
        "data_type": "single_select",
        "options": ["purchase", "gift", "transfer", "found", "other"],
    },
    {"name": "obtained_at", "data_type": "date"},
    {"name": "arrived_at", "data_type": "date"},
    {"name": "cost", "data_type": "number"},
]

SCENARIO_ATTRS = [
    {"name": "name", "data_type": "text"},
    {"name": "notes", "data_type": "long_text"},
]


def _seed(apps, model_name, attrs):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    Model = apps.get_model("inventory", model_name)
    ct = ContentType.objects.get_for_model(Model)
    for order, attr in enumerate(attrs):
        options = attr.get("options", [])
        AttributeDefinition.objects.get_or_create(
            content_type=ct,
            name=attr["name"],
            defaults={
                "data_type": attr["data_type"],
                "is_system": True,
                "display_order": order,
                "options": options,
            },
        )


def _unseed(apps, model_name):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    Model = apps.get_model("inventory", model_name)
    ct = ContentType.objects.get_for_model(Model)
    AttributeDefinition.objects.filter(content_type=ct, is_system=True).delete()


def seed_system_attrs(apps, schema_editor):
    _seed(apps, "Item", ITEM_ATTRS)
    _seed(apps, "Acquisition", ACQUISITION_ATTRS)
    _seed(apps, "Scenario", SCENARIO_ATTRS)


def unseed_system_attrs(apps, schema_editor):
    _unseed(apps, "Item")
    _unseed(apps, "Acquisition")
    _unseed(apps, "Scenario")


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0001_initial"),
        ("core", "0001_initial"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(seed_system_attrs, unseed_system_attrs),
    ]
