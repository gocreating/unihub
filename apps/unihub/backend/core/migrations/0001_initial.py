from django.db import migrations, models
import django.db.models.deletion
import core.nanoid


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="AttributeDefinition",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=core.nanoid.generate_id,
                        editable=False,
                        max_length=12,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "content_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="contenttypes.contenttype"
                    ),
                ),
                ("name", models.CharField(max_length=200)),
                (
                    "data_type",
                    models.CharField(
                        choices=[
                            ("text", "Text"),
                            ("long_text", "Long Text"),
                            ("number", "Number"),
                            ("date", "Date"),
                            ("boolean", "Boolean"),
                            ("single_select", "Single Select"),
                        ],
                        max_length=20,
                    ),
                ),
                ("is_system", models.BooleanField(default=False)),
                ("display_order", models.PositiveIntegerField(default=0)),
                ("options", models.JSONField(blank=True, default=list)),
            ],
            options={
                "ordering": ["display_order", "name"],
            },
        ),
        migrations.CreateModel(
            name="AttributeValue",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=core.nanoid.generate_id,
                        editable=False,
                        max_length=12,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "attribute_definition",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="values",
                        to="core.attributedefinition",
                    ),
                ),
                (
                    "content_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="contenttypes.contenttype"
                    ),
                ),
                ("object_id", models.CharField(max_length=12)),
                ("value", models.TextField(blank=True)),
            ],
        ),
        migrations.AddConstraint(
            model_name="attributedefinition",
            constraint=models.UniqueConstraint(
                fields=["content_type", "name"], name="unique_attr_def_per_content_type"
            ),
        ),
        migrations.AddConstraint(
            model_name="attributevalue",
            constraint=models.UniqueConstraint(
                fields=["attribute_definition", "content_type", "object_id"],
                name="unique_attr_value_per_entity",
            ),
        ),
        migrations.AddIndex(
            model_name="attributevalue",
            index=models.Index(
                fields=["content_type", "object_id"], name="core_attributevalue_ct_obj_idx"
            ),
        ),
    ]
