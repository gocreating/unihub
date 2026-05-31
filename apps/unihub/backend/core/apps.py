from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self) -> None:
        from data_io.registry import FieldDescriptor, TableDescriptor, register
        from core.models import AttributeDefinition

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
                ],
                has_user_attributes=False,
                import_order=2,
            )
        )
