from django.apps import AppConfig


class IOConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "data_io"
    verbose_name = "Import/Export"

    def ready(self) -> None:
        pass
