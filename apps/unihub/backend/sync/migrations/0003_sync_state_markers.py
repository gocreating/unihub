from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("sync", "0002_remove_device_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="syncconfig",
            name="local_state_commit",
            field=models.CharField(blank=True, max_length=40, null=True),
        ),
        migrations.AddField(
            model_name="syncconfig",
            name="last_known_remote_commit",
            field=models.CharField(blank=True, max_length=40, null=True),
        ),
    ]
