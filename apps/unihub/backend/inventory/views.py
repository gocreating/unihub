"""DRF viewsets for the Inventory domain."""

from django.db import IntegrityError
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.filters import EntityFilterBackend, NullsOrderingFilter
from core.pagination import EntityOffsetPagination
from inventory.models import Acquisition, Item, Scenario, ScenarioItem
from inventory.serializers import (
    AcquisitionSerializer,
    ItemSerializer,
    ScenarioItemSerializer,
    ScenarioSerializer,
)
from inventory.services import would_create_cycle


class ItemViewSet(viewsets.ModelViewSet):
    """Items are created via the Acquisition endpoint, not directly (no POST)."""

    queryset = Item.objects.all()
    serializer_class = ItemSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    # Opt into attr:<definition_id> filter/sort keys (dynamic parameters).
    attribute_content_type = "inventory.item"
    # Keys are the real field paths so a single toolbar key works for BOTH filter
    # and sort (the ordering filter validates the raw field name against
    # ordering_fields). The Catalog's flat mode sends these paths directly.
    filterable_fields = {
        "name": {"lookup": "name", "type": "text"},
        "spec": {"lookup": "spec", "type": "text"},
        "remark": {"lookup": "remark", "type": "text"},
        "quantity": {"lookup": "quantity", "type": "number"},
        "sku_price": {"lookup": "sku_price", "type": "number"},
        "url": {"lookup": "url", "type": "text"},
        "deprecated": {"lookup": "deprecate_time", "type": "date"},
        "deprecate_time": {"lookup": "deprecate_time", "type": "date"},
        # Acquisition-derived columns (used in the Catalog's flat mode).
        "acquisition__source": {"lookup": "acquisition__source", "type": "text"},
        "acquisition__request_time": {"lookup": "acquisition__request_time", "type": "date"},
        "acquisition__obtained_at": {"lookup": "acquisition__obtained_at", "type": "date"},
        # Parameters (color/size/measurements/…) filter via attr:<definition_id>.
    }
    ordering_fields = [
        "name",
        "spec",
        "remark",
        "quantity",
        "sku_price",
        "url",
        "deprecate_time",
        "acquisition__source",
        "acquisition__request_time",
        "acquisition__obtained_at",
    ]
    ordering = ["-acquisition__obtained_at__nullsfirst"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_footer_totals(self, queryset) -> dict:
        """Catalog footer: distinct acquisitions + item count over the filtered set."""
        return {
            "acquisitions": queryset.aggregate(n=Count("acquisition", distinct=True))["n"] or 0,
            "items": queryset.count(),
        }

    def get_queryset(self):
        # No implicit exclusion — deprecate_time is a normal filterable attribute.
        # cost_factors feeds the nested acquisition.net_cost aggregation;
        # attribute_values feeds the parameters list.
        return (
            super()
            .get_queryset()
            .select_related("acquisition")
            .prefetch_related(
                "acquisition__cost_factors",
                "attribute_values__attribute_definition",
            )
        )

    def destroy(self, request, *args, **kwargs):
        """Delete a single item from its acquisition."""
        item = self.get_object()
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AcquisitionViewSet(viewsets.ModelViewSet):
    queryset = Acquisition.objects.prefetch_related(
        "cost_factors", "items__attribute_values__attribute_definition"
    )
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

    def get_footer_totals(self, queryset) -> dict:
        """Catalog footer: acquisition count + aggregate item total over the filtered set."""
        return {
            "acquisitions": queryset.count(),
            "items": queryset.aggregate(n=Count("items"))["n"] or 0,
        }

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

        # New lines append at the end of their sibling group (Organize tree order).
        siblings = ScenarioItem.objects.filter(scenario=scenario, container=container)
        next_order = siblings.count()
        try:
            line = ScenarioItem.objects.create(
                scenario=scenario,
                item_id=data["item_id"],
                notes=data.get("notes", ""),
                container=container,
                display_order=next_order,
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

        if "notes" in data:
            line.notes = data["notes"]
        line.save()
        return Response(self.get_serializer(line).data)

    def move(self, request, *args, **kwargs):
        """Drag-drop endpoint: set the line's container and sibling position.

        Body: ``{"container_id": <line id or null>, "index": <int>}``. Sibling
        display_order values are rewritten densely so order survives reloads.
        """
        line = self.get_object()
        scenario = line.scenario

        container, error = self._resolve_container(
            scenario, request.data.get("container_id"), line=line
        )
        if error:
            return error

        try:
            index = int(request.data.get("index", 0))
        except (TypeError, ValueError):
            return Response({"detail": "index must be an integer."}, status=400)

        siblings = list(
            ScenarioItem.objects.filter(scenario=scenario, container=container)
            .exclude(pk=line.pk)
            .order_by("display_order", "created_at")
        )
        index = max(0, min(index, len(siblings)))
        siblings.insert(index, line)
        line.container = container
        for order, sibling in enumerate(siblings):
            sibling.display_order = order
        line.save(update_fields=["container"])
        ScenarioItem.objects.bulk_update(siblings, ["display_order"])
        line.refresh_from_db()
        return Response(self.get_serializer(line).data)

    def destroy(self, request, *args, **kwargs):
        line = self.get_object()
        # Reset children to top-level before removing this container line.
        line.contained_items.update(container=None)
        line.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
