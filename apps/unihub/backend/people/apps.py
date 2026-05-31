from django.apps import AppConfig


class PeopleConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "people"

    def ready(self) -> None:
        from data_io.registry import FieldDescriptor, TableDescriptor, register
        from people.models import Person, Relationship

        register(
            TableDescriptor(
                content_type_label="people.person",
                display_name="Persons",
                model_class=Person,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:integer", data_type="integer", is_pk=True
                    ),
                    FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
                    FieldDescriptor(
                        column_name="nickname", csv_header="nickname:text", data_type="text"
                    ),
                    FieldDescriptor(
                        column_name="email", csv_header="email:string", data_type="string"
                    ),
                    FieldDescriptor(
                        column_name="phone", csv_header="phone:string", data_type="string"
                    ),
                    FieldDescriptor(column_name="notes", csv_header="notes:text", data_type="text"),
                    FieldDescriptor(
                        column_name="tags", csv_header="tags:text", data_type="text", is_json=True
                    ),
                ],
                has_user_attributes=False,
                import_order=30,
            )
        )
        register(
            TableDescriptor(
                content_type_label="people.relationship",
                display_name="Relationships",
                model_class=Relationship,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:integer", data_type="integer", is_pk=True
                    ),
                    FieldDescriptor(
                        column_name="from_person_id",
                        csv_header="from_person_id:integer",
                        data_type="integer",
                        is_fk=True,
                        fk_content_type_label="people.person",
                    ),
                    FieldDescriptor(
                        column_name="to_person_id",
                        csv_header="to_person_id:integer",
                        data_type="integer",
                        is_fk=True,
                        fk_content_type_label="people.person",
                    ),
                    FieldDescriptor(
                        column_name="kind", csv_header="kind:string", data_type="string"
                    ),
                    FieldDescriptor(column_name="notes", csv_header="notes:text", data_type="text"),
                ],
                has_user_attributes=False,
                import_order=31,
            )
        )
