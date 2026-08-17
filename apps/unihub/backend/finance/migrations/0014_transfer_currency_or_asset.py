"""Transfer redesign (FR-037/FR-038/FR-039).

Hand-written rather than autodetected, because the order matters:

  1. schema first (add the currency leg, RENAME value_change → pnl_change so no
     value is lost, relax the asset columns, drop remark),
  2. then convert the legacy cash rows that were modelled as Assets,
  3. then add the exactly-one CheckConstraint — it cannot hold before step 2.

Step 2 is the correction of a modelling mistake: 新台幣/美元 were created as
Asset rows during the legacy import so that cash could be recorded at all,
which conflated currencies with assets. Every such transfer becomes a currency
leg; `pnl_change` is never touched, so no financial figure moves.
"""

from django.db import migrations, models
import django.db.models.deletion


def cash_assets_to_currency_legs(apps, schema_editor):
    Asset = apps.get_model("finance", "Asset")
    Currency = apps.get_model("finance", "Currency")
    Transfer = apps.get_model("finance", "Transfer")

    # An Asset is really a currency when its name matches a Currency's name or
    # code (the legacy export flagged these `is_settleable`).
    by_name = {c.name: c.code for c in Currency.objects.all()}
    by_code = {c.code: c.code for c in Currency.objects.all()}

    for asset in Asset.objects.all():
        code = by_name.get(asset.name) or by_code.get(asset.name)
        if not code:
            continue
        # Move the quantity onto the currency leg; keep pnl_change verbatim.
        for transfer in Transfer.objects.filter(asset=asset):
            transfer.currency_id = code
            transfer.currency_amount = transfer.asset_change_amount
            transfer.asset = None
            transfer.asset_change_amount = None
            transfer.save(update_fields=["currency", "currency_amount", "asset", "asset_change_amount"])
        asset.delete()


def currency_legs_back_to_assets(apps, schema_editor):
    """Reverse: re-create an Asset per currency used and move legs back."""
    Asset = apps.get_model("finance", "Asset")
    Currency = apps.get_model("finance", "Currency")
    Transfer = apps.get_model("finance", "Transfer")

    for code in (
        Transfer.objects.filter(currency__isnull=False)
        .values_list("currency_id", flat=True)
        .distinct()
    ):
        currency = Currency.objects.get(code=code)
        asset, _ = Asset.objects.get_or_create(name=currency.name)
        for transfer in Transfer.objects.filter(currency_id=code):
            transfer.asset = asset
            transfer.asset_change_amount = transfer.currency_amount
            transfer.currency = None
            transfer.currency_amount = None
            transfer.save(update_fields=["currency", "currency_amount", "asset", "asset_change_amount"])


class Migration(migrations.Migration):
    dependencies = [("finance", "0013_alter_portfolio_description")]

    operations = [
        # ── 1. schema ────────────────────────────────────────────────────
        migrations.RenameField(
            model_name="transfer", old_name="value_change", new_name="pnl_change"
        ),
        migrations.AddField(
            model_name="transfer",
            name="currency",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="transfers",
                to="finance.currency",
            ),
        ),
        migrations.AddField(
            model_name="transfer",
            name="currency_amount",
            field=models.DecimalField(blank=True, decimal_places=18, max_digits=38, null=True),
        ),
        migrations.AlterField(
            model_name="transfer",
            name="asset",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="transfers",
                to="finance.asset",
            ),
        ),
        migrations.AlterField(
            model_name="transfer",
            name="asset_change_amount",
            field=models.DecimalField(blank=True, decimal_places=18, max_digits=38, null=True),
        ),
        migrations.RemoveField(model_name="transfer", name="remark"),
        # ── 2. data ──────────────────────────────────────────────────────
        migrations.RunPython(cash_assets_to_currency_legs, currency_legs_back_to_assets),
        # ── 3. constraint LAST ───────────────────────────────────────────
        migrations.AddConstraint(
            model_name="transfer",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(currency__isnull=False, asset__isnull=True)
                    | models.Q(currency__isnull=True, asset__isnull=False)
                ),
                name="transfer_exactly_one_of_currency_or_asset",
            ),
        ),
    ]
