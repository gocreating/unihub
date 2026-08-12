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
from sync.services.git_service import (
    DivergedException,
    GitError,
    GitSyncService,
    NothingStagedException,
    PreviewStaleException,
)


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


class SyncHistoryView(APIView):
    """GET /api/v1/sync/history/ — the data repository's commit graph payload."""

    def get(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        svc = _get_git_service(config)
        try:
            remote_head = svc.reset_to_remote()
        except GitError as exc:
            return Response(
                {"error": "git_error", "message": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        history_rewritten = False
        commits: list[dict] = []
        has_more = False

        if remote_head is not None:
            stored = config.last_known_remote_commit
            if stored and stored != remote_head:
                # A previously-seen remote head that is no longer an ancestor
                # of the new head means the remote history was rewritten.
                history_rewritten = not svc.is_ancestor(stored, remote_head)

            try:
                limit = min(max(int(request.query_params.get("limit", 50)), 1), 200)
            except ValueError:
                limit = 50
            before = request.query_params.get("before")
            commits, has_more = svc.history(limit=limit, before=before)

            from sync.services.compatibility import classify_commit

            for commit in commits:
                compat = classify_commit(svc.clone_dir, commit["sha"])
                commit["compatible"] = compat.compatible
                commit["incompatible_reason"] = compat.reason
                commit["is_remote_head"] = commit["sha"] == remote_head
                commit["is_local_state"] = commit["sha"] == config.local_state_commit

            SyncConfig.objects.filter(pk=config.pk).update(last_known_remote_commit=remote_head)

        return Response(
            {
                "commits": commits,
                "has_more": has_more,
                "remote_head": remote_head,
                "local_commit": config.local_state_commit,
                "has_local_changes": svc.local_changes_exist(),
                "history_rewritten": history_rewritten,
            }
        )


class SyncPublishView(APIView):
    """POST /api/v1/sync/publish/ — export tables to CSV, commit, and push."""

    def post(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = _get_git_service(config).publish(
                base_commit=request.data.get("base_commit"),
                diff_digest=request.data.get("diff_digest"),
                excluded=request.data.get("excluded"),
            )
        except PreviewStaleException:
            return Response({"error": "preview_stale"}, status=status.HTTP_409_CONFLICT)
        except NothingStagedException:
            return Response({"error": "nothing_staged"}, status=status.HTTP_400_BAD_REQUEST)
        except DivergedException:
            return Response({"error": "diverged"}, status=status.HTTP_409_CONFLICT)

        if result is None:
            return Response({"status": "up_to_date"})

        from datetime import datetime, timezone

        SyncConfig.objects.filter(pk=config.pk).update(
            last_published_at=datetime.now(timezone.utc),
            last_published_commit=result.commit_sha,
            local_state_commit=result.commit_sha,
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

        try:
            result = _get_git_service(config).force_publish(
                base_commit=request.data.get("base_commit"),
                diff_digest=request.data.get("diff_digest"),
                excluded=request.data.get("excluded"),
            )
        except PreviewStaleException:
            return Response({"error": "preview_stale"}, status=status.HTTP_409_CONFLICT)
        except NothingStagedException:
            return Response({"error": "nothing_staged"}, status=status.HTTP_400_BAD_REQUEST)

        if result is None:
            return Response({"status": "up_to_date"})

        from datetime import datetime, timezone

        SyncConfig.objects.filter(pk=config.pk).update(
            last_published_at=datetime.now(timezone.utc),
            last_published_commit=result.commit_sha,
            local_state_commit=result.commit_sha,
        )
        return Response(
            {
                "status": "published",
                "commit_sha": result.commit_sha,
                "tables_exported": result.tables_exported,
            }
        )


class SyncPublishPreviewView(APIView):
    """GET /api/v1/sync/publish/preview/ — compute per-table publish diff."""

    def get(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            preview = _get_git_service(config).publish_preview()
        except GitError as exc:
            return Response(
                {"error": "git_error", "message": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if preview is None:
            return Response({"status": "up_to_date"})
        return Response(
            {
                "status": "has_changes",
                "base_commit": preview.base_commit,
                "diff_digest": preview.diff_digest,
                "changes": preview.changes,
            }
        )


def _checkout_target(config: SyncConfig, commit: str | None):
    """Shared checkout validation: reset, resolve, and gate the target commit.

    Returns:
        (svc, error_response) — exactly one is None.
    """
    if not commit:
        return None, Response({"error": "missing_commit"}, status=status.HTTP_400_BAD_REQUEST)

    svc = _get_git_service(config)
    try:
        svc.reset_to_remote()
    except GitError as exc:
        return None, Response(
            {"error": "git_error", "message": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if not svc.commit_exists(commit):
        return None, Response({"error": "unknown_commit"}, status=status.HTTP_400_BAD_REQUEST)

    from sync.services.compatibility import classify_commit

    compat = classify_commit(svc.clone_dir, commit)
    if not compat.compatible:
        return None, Response(
            {"error": "incompatible_commit", "reason": compat.reason},
            status=status.HTTP_409_CONFLICT,
        )
    return svc, None


class SyncCheckoutPreviewView(APIView):
    """GET /api/v1/sync/checkout/preview/?commit=<sha> — diff a snapshot vs the DB."""

    def get(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        commit = request.query_params.get("commit")
        svc, error = _checkout_target(config, commit)
        if error is not None:
            return error

        from sync.services.apply_helper import preview_from_commit
        from sync.services.digest import diff_digest

        changes = preview_from_commit(svc.clone_dir, commit)
        if not changes:
            return Response({"status": "up_to_date"})
        return Response(
            {
                "status": "has_changes",
                "base_commit": commit,
                "diff_digest": diff_digest(changes),
                "changes": changes,
            }
        )


class SyncCheckoutConfirmView(APIView):
    """POST /api/v1/sync/checkout/confirm/ — apply the staged subset of a snapshot."""

    def post(self, request: Request) -> Response:
        config = SyncConfig.objects.first()
        if config is None:
            return Response({"error": "not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        commit = request.data.get("commit")
        digest = request.data.get("diff_digest")
        excluded = request.data.get("excluded") or []
        if not digest:
            return Response({"error": "missing_digest"}, status=status.HTTP_400_BAD_REQUEST)

        svc, error = _checkout_target(config, commit)
        if error is not None:
            return error

        from data_io.services.change_preview import apply_selected
        from sync.services.apply_helper import preview_from_commit
        from sync.services.digest import diff_digest

        changes = preview_from_commit(svc.clone_dir, commit)
        if diff_digest(changes) != digest:
            return Response({"error": "preview_stale"}, status=status.HTTP_409_CONFLICT)

        excluded_refs = {(ref["table"], ref["pk"]) for ref in excluded}
        all_refs = {(ch["table"], row["pk"]) for ch in changes for row in ch["rows"]}
        if all_refs and not (all_refs - excluded_refs):
            return Response({"error": "nothing_staged"}, status=status.HTTP_400_BAD_REQUEST)

        diffs_by_table = {ch["table"]: ch["rows"] for ch in changes}
        results, auto_included = apply_selected(
            diffs_by_table, excluded_refs, acting_user=request.user
        )

        from datetime import datetime, timezone

        update_fields = {
            "last_applied_at": datetime.now(timezone.utc),
            "last_applied_commit": commit,
        }
        if not excluded_refs:
            # Only a FULL checkout leaves the DB exactly at the snapshot.
            update_fields["local_state_commit"] = commit
        SyncConfig.objects.filter(pk=config.pk).update(**update_fields)

        return Response({"status": "applied", "results": results, "auto_included": auto_included})
