from __future__ import annotations

import re

from rest_framework import serializers

from sync.models import SyncConfig
from sync.services.crypto import encrypt_pat

_GITHUB_HTTPS_RE = re.compile(r"^https://github\.com/[^/]+/[^/]+/?$")


class SyncConfigReadSerializer(serializers.ModelSerializer):
    is_configured = serializers.SerializerMethodField()
    pat = serializers.SerializerMethodField()

    class Meta:
        model = SyncConfig
        fields = [
            "is_configured",
            "repo_url",
            "pat",
            "last_published_at",
            "last_published_commit",
            "last_applied_at",
            "last_applied_commit",
        ]

    def get_is_configured(self, obj: SyncConfig) -> bool:  # noqa: ARG002
        return True

    def get_pat(self, obj: SyncConfig) -> str:
        from sync.services.crypto import decrypt_pat
        return decrypt_pat(obj.pat_encrypted)


class SyncConfigWriteSerializer(serializers.Serializer):
    """Write serializer — accepts plaintext PAT, encrypts before saving.

    PAT is optional when updating an existing config (blank = keep existing).
    PAT is required when creating the first config.
    """

    repo_url = serializers.URLField(max_length=500)
    pat = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")

    def validate_repo_url(self, value: str) -> str:
        if not _GITHUB_HTTPS_RE.match(value):
            raise serializers.ValidationError(
                "Must be a valid GitHub HTTPS repository URL "
                "(e.g. https://github.com/user/repo)."
            )
        return value.rstrip("/")

    def validate(self, attrs: dict) -> dict:
        pat = attrs.get("pat", "").strip()
        if not pat and not SyncConfig.objects.exists():
            raise serializers.ValidationError({"pat": "PAT is required for the initial configuration."})
        return attrs

    def save(self) -> SyncConfig:
        data = self.validated_data
        pat = data.get("pat", "").strip()
        existing_pk = SyncConfig.objects.values_list("pk", flat=True).first()
        if existing_pk:
            update_fields = {"repo_url": data["repo_url"]}
            if pat:
                update_fields["pat_encrypted"] = encrypt_pat(pat)
            SyncConfig.objects.filter(pk=existing_pk).update(**update_fields)
            return SyncConfig.objects.get(pk=existing_pk)
        return SyncConfig.objects.create(
            repo_url=data["repo_url"],
            pat_encrypted=encrypt_pat(pat),
        )


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
