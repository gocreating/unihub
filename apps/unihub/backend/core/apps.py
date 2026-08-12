from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self) -> None:
        from data_io.registry import (
            FieldDescriptor,
            TableDescriptor,
            auto_system_fields,
            register,
        )
        from core.models import AttributeDefinition, EntityView

        register(
            TableDescriptor(
                content_type_label="core.attributedefinition",
                display_name="Attribute Definitions",
                model_class=AttributeDefinition,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:string", data_type="string", is_pk=True
                    ),
                    FieldDescriptor(
                        column_name="content_type",
                        csv_header="content_type:string",
                        data_type="string",
                        is_fk=True,
                        fk_content_type_label="contenttypes.contenttype",
                        use_natural_key=True,
                    ),
                    FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
                    FieldDescriptor(
                        column_name="data_type", csv_header="data_type:text", data_type="text"
                    ),
                    FieldDescriptor(
                        column_name="is_system", csv_header="is_system:boolean", data_type="boolean"
                    ),
                    FieldDescriptor(
                        column_name="display_order",
                        csv_header="display_order:integer",
                        data_type="integer",
                    ),
                    FieldDescriptor(
                        column_name="options",
                        csv_header="options:text",
                        data_type="text",
                        is_json=True,
                        nullable=True,
                    ),
                    # Added in iterations 26/27; optional so pre-existing
                    # snapshots without the columns remain importable. Omitting
                    # them from the descriptor caused issue #35's family wipe:
                    # a full apply re-created definitions with unit_family=''
                    # and every later dimension-value import crashed.
                    FieldDescriptor(
                        column_name="unit_family",
                        csv_header="unit_family:string",
                        data_type="string",
                        optional=True,
                        default_value="",
                    ),
                    FieldDescriptor(
                        column_name="emoji",
                        csv_header="emoji:string",
                        data_type="string",
                        optional=True,
                        default_value="",
                    ),
                ],
                has_user_attributes=False,
                import_order=2,
            )
        )

        # EntityView (016 round 2): the owner FK is deliberately EXCLUDED from
        # the CSV schema — deployment-specific auth.User integer PKs must never
        # be serialized (phantom-diff class from issue #35). Instead the
        # descriptor declares owner_field, and the import chain stamps the
        # acting user (FR-024: imported views attach to the importing account).
        register(
            TableDescriptor(
                content_type_label="core.entityview",
                display_name="Entity Views",
                model_class=EntityView,
                system_fields=auto_system_fields(EntityView, exclude={"owner_id"}),
                has_user_attributes=False,
                import_order=2,
                owner_field="owner",
            )
        )
