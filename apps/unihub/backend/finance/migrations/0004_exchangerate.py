from django.db import migrations, models
import core.nanoid


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0003_balancesheet_balance"),
    ]

    operations = [
        migrations.CreateModel(
            name="ExchangeRate",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=core.nanoid.generate_id,
                        editable=False,
                        max_length=12,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("from_currency", models.CharField(max_length=3)),
                ("to_currency", models.CharField(max_length=3)),
                ("rate", models.DecimalField(decimal_places=8, max_digits=24)),
                ("date", models.DateField()),
            ],
            options={
                "ordering": ["-date"],
            },
        ),
        migrations.AddConstraint(
            model_name="exchangerate",
            constraint=models.UniqueConstraint(
                fields=["from_currency", "to_currency", "date"],
                name="unique_exchange_rate_per_date",
            ),
        ),
    ]
