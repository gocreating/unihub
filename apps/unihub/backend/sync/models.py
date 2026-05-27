from django.db import models


class SyncConfig(models.Model):
    """Singleton configuration for data sync via a private GitHub repository.

    At most one row exists; the view layer enforces this via upsert semantics.
    The PAT is stored Fernet-encrypted and never returned in API responses.
    """

    repo_url = models.URLField(max_length=500)
    pat_encrypted = models.TextField()
    device_name = models.CharField(max_length=100)
    last_published_at = models.DateTimeField(null=True, blank=True)
    last_published_commit = models.CharField(max_length=40, null=True, blank=True)
    last_applied_at = models.DateTimeField(null=True, blank=True)
    last_applied_commit = models.CharField(max_length=40, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Sync Config"
        verbose_name_plural = "Sync Configs"
