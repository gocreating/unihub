"""Iteration 14 (2/2): drop the migrated Item parameter columns, simplify
scenarios (notes→description, checklist fields removed, display_order added),
and delete the Constraint model."""

from collections import defaultdict

from django.db import migrations, models


def backfill_display_order(apps, schema_editor):
    """Dense display_order per (scenario, container) group, by created_at."""
    ScenarioItem = apps.get_model("inventory", "ScenarioItem")
    groups = defaultdict(list)
    for line in ScenarioItem.objects.order_by("created_at").iterator():
        groups[(line.scenario_id, line.container_id)].append(line)
    for lines in groups.values():
        for index, line in enumerate(lines):
            if line.display_order != index:
                line.display_order = index
                line.save(update_fields=["display_order"])


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0011_seed_parameters"),
    ]

    operations = [
        # Item: parameters now live in core AttributeValues.
        migrations.RemoveField(model_name="item", name="color"),
        migrations.RemoveField(model_name="item", name="size"),
        migrations.RemoveField(model_name="item", name="length_canonical"),
        migrations.RemoveField(model_name="item", name="length_unit"),
        migrations.RemoveField(model_name="item", name="width_canonical"),
        migrations.RemoveField(model_name="item", name="width_unit"),
        migrations.RemoveField(model_name="item", name="height_canonical"),
        migrations.RemoveField(model_name="item", name="height_unit"),
        migrations.RemoveField(model_name="item", name="weight_canonical"),
        migrations.RemoveField(model_name="item", name="weight_unit"),
        migrations.RemoveField(model_name="item", name="volume_canonical"),
        migrations.RemoveField(model_name="item", name="volume_unit"),
        # Scenario: notes → description.
        migrations.RenameField(model_name="scenario", old_name="notes", new_name="description"),
        # ScenarioItem: checklist fields removed; packing-tree order added.
        migrations.RemoveField(model_name="scenarioitem", name="prepared"),
        migrations.RemoveField(model_name="scenarioitem", name="required_quantity"),
        migrations.AddField(
            model_name="scenarioitem",
            name="display_order",
            field=models.IntegerField(default=0),
        ),
        migrations.AlterModelOptions(
            name="scenarioitem",
            options={"ordering": ["display_order", "created_at"]},
        ),
        migrations.RunPython(backfill_display_order, migrations.RunPython.noop),
        # Constraints removed entirely (never data_io-registered).
        migrations.RemoveField(model_name="constraint", name="items"),
        migrations.RemoveField(model_name="constraint", name="scenario"),
        migrations.DeleteModel(name="Constraint"),
    ]
