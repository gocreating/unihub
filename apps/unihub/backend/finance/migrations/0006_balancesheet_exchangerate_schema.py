from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0005_currency_remove_account_type"),
    ]

    operations = [
        # BalanceSheet: date → DateTimeField, drop label + base_currency
        migrations.AlterField(
            model_name="balancesheet",
            name="date",
            field=models.DateTimeField(),
        ),
        migrations.RemoveField(
            model_name="balancesheet",
            name="label",
        ),
        migrations.RemoveField(
            model_name="balancesheet",
            name="base_currency",
        ),
        # ExchangeRate: remove named constraint before renaming fields (SQLite compatibility)
        migrations.RemoveConstraint(
            model_name="exchangerate",
            name="unique_exchange_rate_per_date",
        ),
        migrations.RenameField(
            model_name="exchangerate",
            old_name="from_currency",
            new_name="base_currency",
        ),
        migrations.RenameField(
            model_name="exchangerate",
            old_name="to_currency",
            new_name="quote_currency",
        ),
        migrations.AlterField(
            model_name="exchangerate",
            name="date",
            field=models.DateTimeField(),
        ),
        # Restore constraint with new field names
        migrations.AddConstraint(
            model_name="exchangerate",
            constraint=models.UniqueConstraint(
                fields=["base_currency", "quote_currency", "date"],
                name="unique_exchange_rate_per_date",
            ),
        ),
    ]
