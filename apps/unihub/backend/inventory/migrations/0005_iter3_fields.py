"""Iteration 3 (2026-07-11): cost→acquisition, deprecate_time, sku_price, volume.

Non-atomic: the RunPython backfill must commit before the ALTER TABLE ops
(Postgres rejects them in one transaction — "pending trigger events").
Renames are explicit so data is preserved; the acquisition-cost backfill reads
item.cost before it is dropped.
"""

from decimal import Decimal

from django.db import migrations, models


def forward_backfill(apps, schema_editor):
    Item = apps.get_model("inventory", "Item")
    Acquisition = apps.get_model("inventory", "Acquisition")

    # quantity null → 1 (before the NOT NULL alter)
    Item.objects.filter(quantity__isnull=True).update(quantity=Decimal("1"))

    # acquisition.cost ← Σ item.cost (in the first non-blank item currency)
    for acq in Acquisition.objects.all():
        items = list(acq.items.all())
        total = sum((item.cost or Decimal("0")) for item in items) or Decimal("0")
        if total > 0:
            acq.cost = total
            acq.cost_currency = next(
                (item.cost_currency for item in items if item.cost_currency), ""
            )
            acq.save(update_fields=["cost", "cost_currency"])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("inventory", "0004_reseed_system_attrs"),
    ]

    operations = [
        # ── Renames (data-preserving) ──
        migrations.RenameField("item", old_name="price", new_name="sku_price"),
        migrations.RenameField("item", old_name="price_currency", new_name="sku_price_currency"),
        migrations.RenameField("item", old_name="archived_at", new_name="deprecate_time"),
        # ── Add new columns ──
        migrations.AddField(
            model_name="item",
            name="volume_canonical",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="item",
            name="volume_unit",
            field=models.CharField(choices=[("mL", "mL"), ("L", "L")], default="mL", max_length=4),
        ),
        migrations.AddField(
            model_name="acquisition",
            name="request_time",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="acquisition",
            name="cost",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name="acquisition",
            name="cost_currency",
            field=models.CharField(blank=True, max_length=3),
        ),
        migrations.AddField(
            model_name="acquisition",
            name="discount",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name="acquisition",
            name="tax_refund",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=20, null=True),
        ),
        # ── Backfill (reads item.cost before it is dropped) ──
        migrations.RunPython(forward_backfill, reverse_noop),
        # ── Tighten quantity ──
        migrations.AlterField(
            model_name="item",
            name="quantity",
            field=models.DecimalField(decimal_places=4, default=1, max_digits=20),
        ),
        # ── Drop legacy columns ──
        migrations.RemoveField(model_name="item", name="cost"),
        migrations.RemoveField(model_name="item", name="cost_currency"),
        migrations.RemoveField(model_name="item", name="status"),
        migrations.RemoveField(model_name="item", name="model"),
        migrations.RemoveField(model_name="item", name="serial_number"),
        migrations.RemoveField(model_name="acquisition", name="method"),
    ]
