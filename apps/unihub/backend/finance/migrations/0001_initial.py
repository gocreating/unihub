from django.db import migrations, models
import django.db.models.deletion
import core.nanoid


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Account',
            fields=[
                ('id', models.CharField(default=core.nanoid.generate_id, editable=False, max_length=12, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('account_type', models.CharField(choices=[('asset', 'Asset'), ('liability', 'Liability'), ('equity', 'Equity')], max_length=20)),
                ('currency', models.CharField(max_length=3)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='BalanceSheet',
            fields=[
                ('id', models.CharField(default=core.nanoid.generate_id, editable=False, max_length=12, primary_key=True, serialize=False)),
                ('date', models.DateField()),
                ('label', models.CharField(blank=True, max_length=200)),
                ('base_currency', models.CharField(max_length=3)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-date'],
            },
        ),
        migrations.CreateModel(
            name='Balance',
            fields=[
                ('id', models.CharField(default=core.nanoid.generate_id, editable=False, max_length=12, primary_key=True, serialize=False)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='balances', to='finance.account')),
                ('balance_sheet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='balances', to='finance.balancesheet')),
                ('amount', models.DecimalField(decimal_places=4, max_digits=20)),
            ],
        ),
        migrations.AddConstraint(
            model_name='balance',
            constraint=models.UniqueConstraint(fields=['account', 'balance_sheet'], name='unique_balance_per_account_sheet'),
        ),
    ]
