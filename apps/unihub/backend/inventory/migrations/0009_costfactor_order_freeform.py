"""Iteration 5: CostFactor gains display_order, free-form type, per-currency accumulated.

Non-atomic: the RunPython backfill (assign display_order, merge any duplicate
`(acquisition, currency)` accumulated rows) runs BEFORE the unique constraint is added.
"""

from django.db import migrations, models


def backfill(apps, schema_editor):
    Acquisition = apps.get_model("inventory", "Acquisition")

    for acq in Acquisition.objects.all():
        factors = list(acq.cost_factors.order_by("created_at"))
        # Assign a stable display order from existing creation order.
        for order, factor in enumerate(factors):
            factor.display_order = order
            factor.save(update_fields=["display_order"])

        # Guard the incoming unique constraint: collapse any duplicate accumulated
        # rows sharing a currency into the first (summing their values).
        seen: dict[str, object] = {}
        for factor in factors:
            if factor.type != "accumulated":
                continue
            key = factor.currency or ""
            if key in seen:
                keeper = seen[key]
                keeper.value = keeper.value + factor.value
                keeper.save(update_fields=["value"])
                factor.delete()
            else:
                seen[key] = factor


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("inventory", "0008_reseed_system_attrs"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="costfactor",
            options={"ordering": ["display_order", "created_at"]},
        ),
        migrations.AddField(
            model_name="costfactor",
            name="display_order",
            field=models.IntegerField(default=0),
        ),
        migrations.RunPython(backfill, reverse_noop),
        migrations.AlterField(
            model_name="costfactor",
            name="type",
            field=models.CharField(default="accumulated", max_length=20),
        ),
        migrations.AddConstraint(
            model_name="costfactor",
            constraint=models.UniqueConstraint(
                condition=models.Q(("type", "accumulated")),
                fields=("acquisition", "currency"),
                name="uniq_accumulated_per_currency",
            ),
        ),
    ]
