"""Refinement iteration (2026-07-11): reshape Item/Acquisition/Constraint.

Order matters: add new columns first, copy/backfill data via RunPython while the
old columns still exist and before the acquisition FK becomes NOT NULL, then drop
old columns and tighten the FK.
"""

import django.db.models.deletion
from django.db import migrations, models

LENGTH_UNITS = {"mm": 1, "cm": 10, "m": 1000, "in": 25.4}
WEIGHT_UNITS = {"g": 1, "kg": 1000, "lb": 453.592}
# Legacy item.status values → refined {active, deprecated}.
STATUS_MAP = {"available": "active", "in_use": "active", "": "active"}


def forward_backfill(apps, schema_editor):
    Item = apps.get_model("inventory", "Item")
    Acquisition = apps.get_model("inventory", "Acquisition")

    # 1. Copy legacy raw measurements into canonical columns (assume base unit).
    for item in Item.objects.all():
        item.length_canonical = item.length
        item.width_canonical = item.width
        item.height_canonical = item.height
        item.weight_canonical = item.weight
        item.status = STATUS_MAP.get(item.status, "deprecated" if item.status else "active")
        item.save(
            update_fields=[
                "length_canonical",
                "width_canonical",
                "height_canonical",
                "weight_canonical",
                "status",
            ]
        )

    # 2. Backfill a synthetic "unknown origin" acquisition for orphan items.
    orphans = Item.objects.filter(acquisition__isnull=True)
    if orphans.exists():
        placeholder = Acquisition.objects.create(source="", method="", remark="Unknown origin")
        orphans.update(acquisition=placeholder)


def reverse_noop(apps, schema_editor):
    # Data backfill is not reversed (columns are re-added empty on downgrade).
    pass


class Migration(migrations.Migration):
    # Non-atomic: the RunPython backfill must commit before the subsequent
    # ALTER TABLE operations, otherwise Postgres rejects them with
    # "pending trigger events" (they share one transaction under atomic=True).
    atomic = False

    dependencies = [
        ("inventory", "0002_seed_system_attrs"),
    ]

    operations = [
        # ── Add new columns (nullable / defaulted → safe on existing rows) ──
        migrations.AddField(
            model_name="acquisition",
            name="remark",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="item",
            name="spec",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="item",
            name="remark",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="item",
            name="color",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="item",
            name="url",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="item",
            name="price_currency",
            field=models.CharField(blank=True, max_length=3),
        ),
        migrations.AddField(
            model_name="item",
            name="cost_currency",
            field=models.CharField(blank=True, max_length=3),
        ),
        migrations.AddField(
            model_name="item",
            name="length_canonical",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="item",
            name="length_unit",
            field=models.CharField(
                choices=[("mm", "mm"), ("cm", "cm"), ("m", "m"), ("in", "in")],
                default="mm",
                max_length=4,
            ),
        ),
        migrations.AddField(
            model_name="item",
            name="width_canonical",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="item",
            name="width_unit",
            field=models.CharField(
                choices=[("mm", "mm"), ("cm", "cm"), ("m", "m"), ("in", "in")],
                default="mm",
                max_length=4,
            ),
        ),
        migrations.AddField(
            model_name="item",
            name="height_canonical",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="item",
            name="height_unit",
            field=models.CharField(
                choices=[("mm", "mm"), ("cm", "cm"), ("m", "m"), ("in", "in")],
                default="mm",
                max_length=4,
            ),
        ),
        migrations.AddField(
            model_name="item",
            name="weight_canonical",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="item",
            name="weight_unit",
            field=models.CharField(
                choices=[("g", "g"), ("kg", "kg"), ("lb", "lb")], default="g", max_length=4
            ),
        ),
        # ── Backfill canonical values, status, and orphan acquisitions ──
        migrations.RunPython(forward_backfill, reverse_noop),
        # ── Drop legacy columns ──
        migrations.RemoveField(model_name="acquisition", name="arrived_at"),
        migrations.RemoveField(model_name="acquisition", name="cost"),
        migrations.RemoveField(model_name="acquisition", name="notes"),
        migrations.RemoveField(model_name="constraint", name="target_category"),
        migrations.RemoveField(model_name="item", name="category"),
        migrations.RemoveField(model_name="item", name="storage_location"),
        migrations.RemoveField(model_name="item", name="purchase_time"),
        migrations.RemoveField(model_name="item", name="length"),
        migrations.RemoveField(model_name="item", name="width"),
        migrations.RemoveField(model_name="item", name="height"),
        migrations.RemoveField(model_name="item", name="weight"),
        # ── Tighten schema (after backfill) ──
        migrations.AlterModelOptions(
            name="item",
            options={"ordering": ["-acquisition__obtained_at"]},
        ),
        migrations.AlterField(
            model_name="item",
            name="acquisition",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="items",
                to="inventory.acquisition",
            ),
        ),
        migrations.AlterField(
            model_name="item",
            name="status",
            field=models.CharField(
                choices=[("active", "Active"), ("deprecated", "Deprecated")],
                default="active",
                max_length=12,
            ),
        ),
        migrations.AlterField(
            model_name="constraint",
            name="limit_value",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True),
        ),
    ]
