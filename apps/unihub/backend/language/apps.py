from django.apps import AppConfig


class LanguageConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "language"

    def ready(self) -> None:
        from data_io.registry import FieldDescriptor, TableDescriptor, register
        from language.models import GrammarSheet, Language, WordCard

        register(
            TableDescriptor(
                content_type_label="language.language",
                display_name="Languages",
                model_class=Language,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:integer", data_type="integer", is_pk=True
                    ),
                    FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
                    FieldDescriptor(
                        column_name="code", csv_header="code:string", data_type="string"
                    ),
                    FieldDescriptor(column_name="notes", csv_header="notes:text", data_type="text"),
                ],
                has_user_attributes=False,
                import_order=10,
            )
        )
        register(
            TableDescriptor(
                content_type_label="language.wordcard",
                display_name="Word Cards",
                model_class=WordCard,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:integer", data_type="integer", is_pk=True
                    ),
                    FieldDescriptor(
                        column_name="language_id",
                        csv_header="language_id:integer",
                        data_type="integer",
                        is_fk=True,
                        fk_content_type_label="language.language",
                    ),
                    FieldDescriptor(column_name="word", csv_header="word:text", data_type="text"),
                    FieldDescriptor(
                        column_name="translation", csv_header="translation:text", data_type="text"
                    ),
                    FieldDescriptor(
                        column_name="romanization", csv_header="romanization:text", data_type="text"
                    ),
                    FieldDescriptor(
                        column_name="example", csv_header="example:text", data_type="text"
                    ),
                    FieldDescriptor(column_name="notes", csv_header="notes:text", data_type="text"),
                    FieldDescriptor(
                        column_name="tags", csv_header="tags:text", data_type="text", is_json=True
                    ),
                ],
                has_user_attributes=False,
                import_order=11,
            )
        )
        register(
            TableDescriptor(
                content_type_label="language.grammarsheet",
                display_name="Grammar Sheets",
                model_class=GrammarSheet,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:integer", data_type="integer", is_pk=True
                    ),
                    FieldDescriptor(
                        column_name="language_id",
                        csv_header="language_id:integer",
                        data_type="integer",
                        is_fk=True,
                        fk_content_type_label="language.language",
                    ),
                    FieldDescriptor(column_name="title", csv_header="title:text", data_type="text"),
                    FieldDescriptor(
                        column_name="content", csv_header="content:text", data_type="text"
                    ),
                    FieldDescriptor(
                        column_name="tags", csv_header="tags:text", data_type="text", is_json=True
                    ),
                ],
                has_user_attributes=False,
                import_order=12,
            )
        )
