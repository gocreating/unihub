from django.apps import AppConfig


class MusicConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "music"

    def ready(self) -> None:
        from data_io.registry import FieldDescriptor, TableDescriptor, register
        from music.models import Song

        register(
            TableDescriptor(
                content_type_label="music.song",
                display_name="Songs",
                model_class=Song,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:integer", data_type="integer", is_pk=True
                    ),
                    FieldDescriptor(column_name="title", csv_header="title:text", data_type="text"),
                    FieldDescriptor(
                        column_name="artist", csv_header="artist:text", data_type="text"
                    ),
                    FieldDescriptor(column_name="album", csv_header="album:text", data_type="text"),
                    FieldDescriptor(
                        column_name="year",
                        csv_header="year:integer",
                        data_type="integer",
                        nullable=True,
                    ),
                    FieldDescriptor(
                        column_name="genre", csv_header="genre:string", data_type="string"
                    ),
                    FieldDescriptor(
                        column_name="language", csv_header="language:string", data_type="string"
                    ),
                    FieldDescriptor(
                        column_name="rating",
                        csv_header="rating:integer",
                        data_type="integer",
                        nullable=True,
                    ),
                    FieldDescriptor(column_name="notes", csv_header="notes:text", data_type="text"),
                    FieldDescriptor(
                        column_name="tags", csv_header="tags:text", data_type="text", is_json=True
                    ),
                ],
                has_user_attributes=False,
                import_order=20,
            )
        )
