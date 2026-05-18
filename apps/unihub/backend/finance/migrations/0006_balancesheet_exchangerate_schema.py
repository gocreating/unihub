from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0005_currency_remove_account_type'),
    ]

    operations = [
        # BalanceSheet: date → DateTimeField, drop label + base_currency
        migrations.AlterField(
            model_name='balancesheet',
            name='date',
            field=models.DateTimeField(),
        ),
        migrations.RemoveField(
            model_name='balancesheet',
            name='label',
        ),
        migrations.RemoveField(
            model_name='balancesheet',
            name='base_currency',
        ),

        # ExchangeRate: drop old unique_together before renaming fields
        migrations.AlterUniqueTogether(
            name='exchangerate',
            unique_together=set(),
        ),
        migrations.RenameField(
            model_name='exchangerate',
            old_name='from_currency',
            new_name='base_currency',
        ),
        migrations.RenameField(
            model_name='exchangerate',
            old_name='to_currency',
            new_name='quote_currency',
        ),
        migrations.AlterField(
            model_name='exchangerate',
            name='date',
            field=models.DateTimeField(),
        ),
        # Restore unique_together with new field names
        migrations.AlterUniqueTogether(
            name='exchangerate',
            unique_together={('base_currency', 'quote_currency', 'date')},
        ),
    ]
