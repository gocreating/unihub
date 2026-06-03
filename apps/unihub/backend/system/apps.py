from django.apps import AppConfig


class SystemConfig(AppConfig):
    """System information app — version and health metadata."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "system"
