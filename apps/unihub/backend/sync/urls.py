from django.urls import path

from sync.views import (
    SyncCheckoutConfirmView,
    SyncCheckoutPreviewView,
    SyncConfigView,
    SyncForcePublishView,
    SyncHistoryView,
    SyncPublishPreviewView,
    SyncPublishView,
    SyncStatusView,
)

urlpatterns = [
    path("config/", SyncConfigView.as_view()),
    path("status/", SyncStatusView.as_view()),
    path("history/", SyncHistoryView.as_view()),
    path("publish/preview/", SyncPublishPreviewView.as_view()),
    path("publish/", SyncPublishView.as_view()),
    path("force-publish/", SyncForcePublishView.as_view()),
    path("checkout/preview/", SyncCheckoutPreviewView.as_view()),
    path("checkout/confirm/", SyncCheckoutConfirmView.as_view()),
]
