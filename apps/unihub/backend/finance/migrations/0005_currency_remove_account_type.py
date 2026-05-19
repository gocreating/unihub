from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0004_exchangerate"),
    ]

    operations = [
        migrations.CreateModel(
            name="Currency",
            fields=[
                ("code", models.CharField(max_length=3, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=100)),
                ("symbol", models.CharField(blank=True, max_length=10)),
            ],
            options={
                "verbose_name_plural": "currencies",
                "ordering": ["code"],
            },
        ),
        migrations.RemoveField(
            model_name="account",
            name="account_type",
        ),
    ]
