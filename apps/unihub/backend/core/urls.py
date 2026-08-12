from django.urls import path, include
from rest_framework.routers import DefaultRouter

from core.views import AttributeDefinitionViewSet, AttributeValueViewSet, EntityViewViewSet

router = DefaultRouter()
router.register("attribute-definitions", AttributeDefinitionViewSet, basename="attributedefinition")
router.register("entity-views", EntityViewViewSet, basename="entityview")

urlpatterns = [
    path("", include(router.urls)),
    path("attribute-values/", AttributeValueViewSet.as_view({"get": "list"})),
    path("attribute-values/bulk-upsert/", AttributeValueViewSet.as_view({"post": "bulk_upsert"})),
]
