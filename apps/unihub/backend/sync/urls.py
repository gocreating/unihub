from django.urls import path

from sync.views import (
    SyncApplyConfirmView,
    SyncApplyPreviewView,
    SyncConfigView,
    SyncForcePublishView,
    SyncPublishView,
    SyncStatusView,
)

urlpatterns = [
    path("config/", SyncConfigView.as_view()),
    path("status/", SyncStatusView.as_view()),
    path("publish/", SyncPublishView.as_view()),
    path("force-publish/", SyncForcePublishView.as_view()),
    path("apply/preview/", SyncApplyPreviewView.as_view()),
    path("apply/confirm/", SyncApplyConfirmView.as_view()),
]
