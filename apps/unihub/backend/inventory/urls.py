from django.urls import include, path
from rest_framework.routers import DefaultRouter

from inventory.views import (
    AcquisitionViewSet,
    ItemViewSet,
    ScenarioItemViewSet,
    ScenarioViewSet,
)

router = DefaultRouter()
router.register("items", ItemViewSet, basename="item")
router.register("acquisitions", AcquisitionViewSet, basename="acquisition")
router.register("scenarios", ScenarioViewSet, basename="scenario")

scenario_items = ScenarioItemViewSet.as_view({"get": "list", "post": "create"})
scenario_item_detail = ScenarioItemViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
scenario_item_move = ScenarioItemViewSet.as_view({"post": "move"})

urlpatterns = [
    path("", include(router.urls)),
    path("scenarios/<str:scenario_id>/items/", scenario_items, name="scenario-items"),
    path(
        "scenarios/<str:scenario_id>/items/<str:pk>/",
        scenario_item_detail,
        name="scenario-item-detail",
    ),
    path(
        "scenarios/<str:scenario_id>/items/<str:pk>/move/",
        scenario_item_move,
        name="scenario-item-move",
    ),
]
