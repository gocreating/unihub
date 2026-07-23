"""EntityView round 2: ``is_default`` flag + ViewConfig v1 → v2 pin migration.

The stored ``config`` payloads move from the view-wide ``stickyLeft`` /
``stickyRight`` booleans to per-column ``pin: 'left' | 'right'`` entries
(matching feature 017's per-column pin model): ``stickyLeft`` becomes a left
pin on the first VISIBLE column (by ``order``), ``stickyRight`` a right pin on
the last visible one.
"""

from django.db import migrations, models


def migrate_config(config: object) -> object:
    """Rewrite a v1 ViewConfig dict into v2; pass anything else through.

    Args:
        config: The stored ``EntityView.config`` JSON value.

    Returns:
        The v2 config (sticky keys removed, pins applied), or the input
        unchanged when it is not a v1-shaped dict.
    """
    if not isinstance(config, dict):
        return config
    if "stickyLeft" not in config and "stickyRight" not in config:
        return config

    out = {k: v for k, v in config.items() if k not in ("stickyLeft", "stickyRight")}
    columns = out.get("columns")
    if isinstance(columns, list):
        new_columns = [dict(c) if isinstance(c, dict) else c for c in columns]
        visible = [c for c in new_columns if isinstance(c, dict) and c.get("visible")]
        visible.sort(key=lambda c: c.get("order", 0))
        if config.get("stickyLeft") and visible:
            visible[0]["pin"] = "left"
        if config.get("stickyRight") and visible:
            visible[-1]["pin"] = "right"
        out["columns"] = new_columns
    return out


def _forwards(apps, schema_editor) -> None:
    entity_view = apps.get_model("core", "EntityView")
    for view in entity_view.objects.all().iterator():
        migrated = migrate_config(view.config)
        if migrated != view.config:
            view.config = migrated
            view.save(update_fields=["config"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_entityview"),
    ]

    operations = [
        migrations.AddField(
            model_name="entityview",
            name="is_default",
            field=models.BooleanField(default=False),
        ),
        migrations.AddConstraint(
            model_name="entityview",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_default", True)),
                fields=("owner", "table_key"),
                name="unique_default_view_per_table",
            ),
        ),
        migrations.RunPython(_forwards, migrations.RunPython.noop),
    ]
