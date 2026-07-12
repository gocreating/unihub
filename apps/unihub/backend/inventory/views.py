"""DRF viewsets for the Inventory domain."""

from django.db import IntegrityError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.filters import EntityFilterBackend, NullsOrderingFilter
from core.pagination import EntityOffsetPagination
from inventory.models import Acquisition, Constraint, Item, Scenario, ScenarioItem
from inventory.serializers import (
    AcquisitionSerializer,
    ConstraintSerializer,
    ItemSerializer,
    ScenarioItemSerializer,
    ScenarioSerializer,
)
from inventory.services import build_checklist, would_create_cycle


class ItemViewSet(viewsets.ModelViewSet):
    """Items are created via the Acquisition endpoint, not directly (no POST)."""

    queryset = Item.objects.all()
    serializer_class = ItemSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    # Keys are the real field paths so a single toolbar key works for BOTH filter
    # and sort (the ordering filter validates the raw field name against
    # ordering_fields). The Catalog's flat mode sends these paths directly.
    filterable_fields = {
        "name": {"lookup": "name", "type": "text"},
        "spec": {"lookup": "spec", "type": "text"},
        "size": {"lookup": "size", "type": "text"},
        "color": {"lookup": "color", "type": "text"},
        "quantity": {"lookup": "quantity", "type": "number"},
        "sku_price": {"lookup": "sku_price", "type": "number"},
        "weight_canonical": {"lookup": "weight_canonical", "type": "number"},
        "length_canonical": {"lookup": "length_canonical", "type": "number"},
        "width_canonical": {"lookup": "width_canonical", "type": "number"},
        "height_canonical": {"lookup": "height_canonical", "type": "number"},
        "volume_canonical": {"lookup": "volume_canonical", "type": "number"},
        "url": {"lookup": "url", "type": "text"},
        "deprecated": {"lookup": "deprecate_time", "type": "date"},
        "deprecate_time": {"lookup": "deprecate_time", "type": "date"},
        # Acquisition-derived columns (used in the Catalog's flat mode).
        "acquisition__source": {"lookup": "acquisition__source", "type": "text"},
        "acquisition__request_time": {"lookup": "acquisition__request_time", "type": "date"},
        "acquisition__obtained_at": {"lookup": "acquisition__obtained_at", "type": "date"},
    }
    ordering_fields = [
        "name",
        "spec",
        "size",
        "color",
        "quantity",
        "sku_price",
        "weight_canonical",
        "length_canonical",
        "width_canonical",
        "height_canonical",
        "volume_canonical",
        "url",
        "deprecate_time",
        "acquisition__source",
        "acquisition__request_time",
        "acquisition__obtained_at",
    ]
    ordering = ["-acquisition__obtained_at__nullsfirst"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        # No implicit exclusion — deprecate_time is a normal filterable attribute.
        # cost_factors feeds the nested acquisition.net_cost aggregation.
        return (
            super()
            .get_queryset()
            .select_related("acquisition")
            .prefetch_related("acquisition__cost_factors")
        )

    def destroy(self, request, *args, **kwargs):
        """Delete a single item from its acquisition."""
        item = self.get_object()
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AcquisitionViewSet(viewsets.ModelViewSet):
    queryset = Acquisition.objects.all()
    serializer_class = AcquisitionSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    filterable_fields = {
        "source": {"lookup": "source", "type": "text"},
        "request_time": {"lookup": "request_time", "type": "date"},
        "obtained_at": {"lookup": "obtained_at", "type": "date"},
    }
    ordering_fields = ["source", "request_time", "obtained_at"]
    ordering = ["-obtained_at__nullsfirst"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    @action(detail=False, methods=["get"], url_path="sources")
    def sources(self, request):
        """Return distinct previously-used source values for auto-complete."""
        q = request.query_params.get("q", "")
        qs = Acquisition.objects.exclude(source="").values_list("source", flat=True)
        if q:
            qs = qs.filter(source__icontains=q)
        distinct = sorted(set(qs))[:20]
        return Response(distinct)


class ScenarioViewSet(viewsets.ModelViewSet):
    queryset = Scenario.objects.all()
    serializer_class = ScenarioSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    filterable_fields = {
        "name": {"lookup": "name", "type": "text"},
    }
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    @action(detail=True, methods=["get"], url_path="checklist")
    def checklist(self, request, pk=None):
        """Return the composite checklist: progress, lines, and violations."""
        scenario = self.get_object()
        return Response(build_checklist(scenario))


class ScenarioItemViewSet(viewsets.ModelViewSet):
    serializer_class = ScenarioItemSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_scenario(self) -> Scenario:
        return Scenario.objects.get(pk=self.kwargs["scenario_id"])

    def get_queryset(self):
        return ScenarioItem.objects.filter(scenario_id=self.kwargs["scenario_id"]).select_related(
            "item", "container__item"
        )

    def _resolve_container(self, scenario, container_id, line=None):
        """Return (container, error_response) for a container_id assignment."""
        if not container_id:
            return None, None
        try:
            container = ScenarioItem.objects.get(pk=container_id)
        except ScenarioItem.DoesNotExist:
            return None, Response(
                {"detail": "Container line not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if container.scenario_id != scenario.id:
            return None, Response(
                {"detail": "Container must belong to the same scenario."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if line is not None and would_create_cycle(line, container):
            return None, Response(
                {"detail": "Container assignment would create a cycle."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return container, None

    def create(self, request, *args, **kwargs):
        scenario = self.get_scenario()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        container, error = self._resolve_container(scenario, data.get("container_id"))
        if error:
            return error

        try:
            line = ScenarioItem.objects.create(
                scenario=scenario,
                item_id=data["item_id"],
                required_quantity=data.get("required_quantity", 1),
                prepared=data.get("prepared", False),
                notes=data.get("notes", ""),
                container=container,
            )
        except IntegrityError:
            return Response(
                {"detail": "This item is already in the scenario."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(self.get_serializer(line).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        line = self.get_object()
        scenario = line.scenario
        serializer = self.get_serializer(line, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "container_id" in request.data:
            container, error = self._resolve_container(
                scenario, data.get("container_id"), line=line
            )
            if error:
                return error
            line.container = container

        for field in ("required_quantity", "prepared", "notes"):
            if field in data:
                setattr(line, field, data[field])
        line.save()
        return Response(self.get_serializer(line).data)

    def destroy(self, request, *args, **kwargs):
        line = self.get_object()
        # Reset children to top-level before removing this container line.
        line.contained_items.update(container=None)
        line.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConstraintViewSet(viewsets.ModelViewSet):
    serializer_class = ConstraintSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Constraint.objects.filter(scenario_id=self.kwargs["scenario_id"]).prefetch_related(
            "items"
        )

    def perform_create(self, serializer):
        serializer.save(scenario_id=self.kwargs["scenario_id"])
