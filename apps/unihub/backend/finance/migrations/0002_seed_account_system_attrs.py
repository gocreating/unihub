from django.db import migrations


def seed_account_attrs(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    Account = apps.get_model("finance", "Account")

    ct = ContentType.objects.get_for_model(Account)
    attrs = [
        {"name": "name", "data_type": "text", "display_order": 0},
        {
            "name": "account_type",
            "data_type": "single_select",
            "display_order": 1,
            "options": ["asset", "liability", "equity"],
        },
        {"name": "currency", "data_type": "text", "display_order": 2},
    ]
    for attr in attrs:
        options = attr.pop("options", [])
        AttributeDefinition.objects.get_or_create(
            content_type=ct,
            name=attr["name"],
            defaults={**attr, "is_system": True, "options": options},
        )


def unseed_account_attrs(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    AttributeDefinition = apps.get_model("core", "AttributeDefinition")
    Account = apps.get_model("finance", "Account")
    ct = ContentType.objects.get_for_model(Account)
    AttributeDefinition.objects.filter(content_type=ct, is_system=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0001_initial"),
        ("core", "0001_initial"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(seed_account_attrs, unseed_account_attrs),
    ]
