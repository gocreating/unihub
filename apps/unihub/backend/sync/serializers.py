from __future__ import annotations

import re

from rest_framework import serializers

from sync.models import SyncConfig
from sync.services.crypto import encrypt_pat

_GITHUB_HTTPS_RE = re.compile(r"^https://github\.com/[^/]+/[^/]+/?$")


class SyncConfigReadSerializer(serializers.ModelSerializer):
    """Read-only serializer — never exposes the encrypted PAT."""

    is_configured = serializers.SerializerMethodField()

    class Meta:
        model = SyncConfig
        fields = [
            "is_configured",
            "repo_url",
            "device_name",
            "last_published_at",
            "last_published_commit",
            "last_applied_at",
            "last_applied_commit",
        ]

    def get_is_configured(self, obj: SyncConfig) -> bool:  # noqa: ARG002
        return True


class SyncConfigWriteSerializer(serializers.Serializer):
    """Write serializer — accepts plaintext PAT, encrypts before saving."""

    repo_url = serializers.URLField(max_length=500)
    pat = serializers.CharField(write_only=True)
    device_name = serializers.CharField(max_length=100)

    def validate_repo_url(self, value: str) -> str:
        if not _GITHUB_HTTPS_RE.match(value):
            raise serializers.ValidationError(
                "Must be a valid GitHub HTTPS repository URL "
                "(e.g. https://github.com/user/repo)."
            )
        return value.rstrip("/")

    def validate_pat(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("PAT may not be blank.")
        return value

    def save(self) -> SyncConfig:
        data = self.validated_data
        config, _ = SyncConfig.objects.update_or_create(
            pk=SyncConfig.objects.values_list("pk", flat=True).first() or None,
            defaults={
                "repo_url": data["repo_url"],
                "pat_encrypted": encrypt_pat(data["pat"]),
                "device_name": data["device_name"],
            },
        )
        return config


class SyncStatusSerializer(serializers.Serializer):
    """Response shape for GET /api/v1/sync/status/."""

    status = serializers.ChoiceField(
        choices=["in_sync", "ahead", "behind", "diverged", "no_remote", "error"]
    )
    ahead_count = serializers.IntegerField()
    behind_count = serializers.IntegerField()
    remote_commit = serializers.CharField(allow_null=True)
    error_message = serializers.CharField(allow_null=True)


class SyncPublishResponseSerializer(serializers.Serializer):
    """Response for successful publish."""

    commit_sha = serializers.CharField()
    published_at = serializers.DateTimeField()
    tables_exported = serializers.ListField(child=serializers.CharField())


class SyncUpToDateSerializer(serializers.Serializer):
    """Shared no-op response for publish/apply when nothing changed."""

    status = serializers.CharField()
    message = serializers.CharField()
