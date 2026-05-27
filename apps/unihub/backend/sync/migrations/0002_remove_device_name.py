from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("sync", "0001_initial"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="syncconfig",
            name="device_name",
        ),
    ]
