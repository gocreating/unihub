"""EntityView round 4: view names become non-identifying labels (FR-016).

Constraint-only migration — no field changes, so the data_io descriptor, the
exported CSV headers, and the OpenAPI schema are all unaffected. Dropping a
constraint is non-destructive and instant: every existing row already
satisfies the weaker rule.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_entityview_is_default"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="entityview",
            name="unique_view_name_per_table",
        ),
    ]
