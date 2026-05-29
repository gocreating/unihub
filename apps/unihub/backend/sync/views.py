from __future__ import annotations

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from sync.models import SyncConfig
from sync.serializers import (
    SyncConfigReadSerializer,
    SyncConfigWriteSerializer,
    SyncStatusSerializer,
)
from sync.services.crypto import decrypt_pat
from sync.services.git_service import DivergedException, GitSyncService


def _get_git_service(config: SyncConfig) -> GitSyncService:
    from django.conf import settings

    return GitSyncService(
        repo_url=config.repo_url,
        pat=decrypt_pat(config.pat_encrypted),
        clone_dir=settings.SYNC_REPO_DIR,
    )


class SyncConfigView(APIView):
    """GET / PUT / DELETE /api/v1/sync/config/ — singleton sync configuration."""

    def get(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"is_configured": False})
        return Response(SyncConfigReadSerializer(config).data)

    def put(self, request: Request) -> Response:
        serializer = SyncConfigWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = serializer.save()
        return Response(SyncConfigReadSerializer(config).data)

    def delete(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SyncStatusView(APIView):
    """GET /api/v1/sync/status/ — check remote ahead/behind state."""

    def get(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        result = GitSyncService.status(_get_git_service(config))
        serializer = SyncStatusSerializer(
            {
                "status": result.status,
                "ahead_count": result.ahead_count,
                "behind_count": result.behind_count,
                "remote_commit": result.remote_commit,
                "error_message": result.error_message,
            }
        )
        return Response(serializer.data)


class SyncPublishView(APIView):
    """POST /api/v1/sync/publish/ — export tables to CSV, commit, and push."""

    def post(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = _get_git_service(config).publish()
        except DivergedException:
            return Response({"error": "diverged"}, status=status.HTTP_409_CONFLICT)

        if result is None:
            return Response({"status": "up_to_date"})

        from datetime import datetime, timezone
        SyncConfig.objects.filter(pk=config.pk).update(
            last_published_at=datetime.now(timezone.utc),
            last_published_commit=result.commit_sha,
        )
        return Response(
            {
                "status": "published",
                "commit_sha": result.commit_sha,
                "tables_exported": result.tables_exported,
            }
        )


class SyncForcePublishView(APIView):
    """POST /api/v1/sync/force-publish/ — force-push, overwriting remote history."""

    def post(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        result = _get_git_service(config).force_publish()

        if result is None:
            return Response({"status": "up_to_date"})

        from datetime import datetime, timezone
        SyncConfig.objects.filter(pk=config.pk).update(
            last_published_at=datetime.now(timezone.utc),
            last_published_commit=result.commit_sha,
        )
        return Response(
            {
                "status": "published",
                "commit_sha": result.commit_sha,
                "tables_exported": result.tables_exported,
            }
        )


class SyncApplyPreviewView(APIView):
    """GET /api/v1/sync/apply/preview/ — fetch remote and return per-table diff."""

    def get(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        changes = _get_git_service(config).apply_preview()
        if changes is None:
            return Response({"status": "up_to_date"})
        return Response({"status": "has_changes", "changes": changes})


class SyncApplyConfirmView(APIView):
    """POST /api/v1/sync/apply/confirm/ — pull and import all tables."""

    def post(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        results = _get_git_service(config).apply_confirm()

        from datetime import datetime, timezone
        SyncConfig.objects.filter(pk=config.pk).update(
            last_applied_at=datetime.now(timezone.utc),
        )
        return Response({"status": "applied", "results": results})
