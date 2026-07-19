"""Iteration 4 (2026-07-11): cost factors, remove item_type, integer quantity.

Non-atomic: the RunPython backfill reads the scalar cost/discount/tax_refund
columns and creates CostFactor rows BEFORE those columns are dropped.
"""

from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models

from core.nanoid import generate_id


def forward_backfill(apps, schema_editor):
    Acquisition = apps.get_model("inventory", "Acquisition")
    CostFactor = apps.get_model("inventory", "CostFactor")

    for acq in Acquisition.objects.all():
        currency = acq.cost_currency or ""
        factors = []
        # accumulated = the old total cost (0 when none recorded)
        factors.append(("accumulated", acq.cost if acq.cost is not None else Decimal("0")))
        if acq.discount:
            factors.append(("discount", -acq.discount))
        if acq.tax_refund:
            factors.append(("tax_refund", -acq.tax_refund))
        for ftype, value in factors:
            CostFactor.objects.create(
                id=generate_id(), acquisition=acq, value=value, currency=currency, type=ftype
            )


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("inventory", "0006_reseed_system_attrs"),
    ]

    operations = [
        # ── Create CostFactor ──
        migrations.CreateModel(
            name="CostFactor",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=generate_id,
                        editable=False,
                        max_length=12,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("value", models.DecimalField(decimal_places=4, max_digits=20)),
                ("currency", models.CharField(blank=True, max_length=3)),
                (
                    "type",
                    models.CharField(
                        choices=[
                            ("accumulated", "Accumulated"),
                            ("shipping", "Shipping"),
                            ("discount", "Discount"),
                            ("tax_refund", "Tax refund"),
                            ("paid_by_other", "Paid by other"),
                            ("other", "Other"),
                        ],
                        default="accumulated",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "acquisition",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cost_factors",
                        to="inventory.acquisition",
                    ),
                ),
            ],
            options={"ordering": ["created_at"]},
        ),
        # ── Backfill cost factors from the scalar cost columns (before drop) ──
        migrations.RunPython(forward_backfill, reverse_noop),
        # ── Drop legacy scalar cost fields + item_type ──
        migrations.RemoveField(model_name="acquisition", name="cost"),
        migrations.RemoveField(model_name="acquisition", name="cost_currency"),
        migrations.RemoveField(model_name="acquisition", name="discount"),
        migrations.RemoveField(model_name="acquisition", name="tax_refund"),
        migrations.RemoveField(model_name="item", name="item_type"),
        # ── quantity: Decimal → Integer ──
        migrations.AlterField(
            model_name="item",
            name="quantity",
            field=models.IntegerField(default=1),
        ),
    ]
