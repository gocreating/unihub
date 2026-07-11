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
    queryset = Item.objects.all()
    serializer_class = ItemSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    filterable_fields = {
        "name": {"lookup": "name", "type": "text"},
        "item_type": {"lookup": "item_type", "type": "single_select"},
        "category": {"lookup": "category", "type": "text"},
        "model": {"lookup": "model", "type": "text"},
        "serial_number": {"lookup": "serial_number", "type": "text"},
        "weight": {"lookup": "weight", "type": "number"},
        "price": {"lookup": "price", "type": "number"},
        "cost": {"lookup": "cost", "type": "number"},
        "purchase_time": {"lookup": "purchase_time", "type": "date"},
        "status": {"lookup": "status", "type": "single_select"},
        "storage_location": {"lookup": "storage_location", "type": "text"},
    }
    ordering_fields = [
        "name",
        "item_type",
        "category",
        "model",
        "serial_number",
        "weight",
        "price",
        "cost",
        "purchase_time",
        "status",
    ]
    ordering = ["name"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        """Exclude archived items by default; include them with ?archived=true."""
        qs = super().get_queryset().select_related("acquisition")
        archived = self.request.query_params.get("archived")
        if archived == "true":
            return qs.filter(archived_at__isnull=False)
        return qs.filter(archived_at__isnull=True)

    def destroy(self, request, *args, **kwargs):
        """Guarded delete: block when the item is still referenced unless confirmed."""
        item = self.get_object()
        if request.query_params.get("confirm") != "true":
            acquisitions = 1 if item.acquisition_id else 0
            scenarios = item.scenario_items.count()
            containers = (
                ScenarioItem.objects.filter(item=item).exclude(contained_items__isnull=True).count()
            )
            if acquisitions or scenarios or containers:
                return Response(
                    {
                        "reference_summary": {
                            "acquisitions": acquisitions,
                            "scenarios": scenarios,
                            "containers": containers,
                        },
                        "message": (
                            "This item is referenced by other records. "
                            "Add ?confirm=true to delete it anyway."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AcquisitionViewSet(viewsets.ModelViewSet):
    queryset = Acquisition.objects.all()
    serializer_class = AcquisitionSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    filterable_fields = {
        "source": {"lookup": "source", "type": "text"},
        "method": {"lookup": "method", "type": "single_select"},
        "obtained_at": {"lookup": "obtained_at", "type": "date"},
        "arrived_at": {"lookup": "arrived_at", "type": "date"},
        "cost": {"lookup": "cost", "type": "number"},
    }
    ordering_fields = ["source", "method", "obtained_at", "arrived_at", "cost"]
    ordering = ["-obtained_at"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


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
