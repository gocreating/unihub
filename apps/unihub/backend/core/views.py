from django.contrib.contenttypes.models import ContentType
from rest_framework import status, viewsets
from rest_framework.response import Response

from core.attributes import compute_value_fields
from core.models import AttributeDefinition, AttributeValue
from core.serializers import (
    AttributeDefinitionSerializer,
    AttributeValueSerializer,
    AttributeValueUpsertSerializer,
)


class AttributeDefinitionViewSet(viewsets.ModelViewSet):
    serializer_class = AttributeDefinitionSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = AttributeDefinition.objects.select_related("content_type")
        ct_param = self.request.query_params.get("content_type")
        if ct_param:
            try:
                app_label, model = ct_param.split(".")
                ct = ContentType.objects.get(app_label=app_label, model=model)
                qs = qs.filter(content_type=ct)
            except (ValueError, ContentType.DoesNotExist):
                return AttributeDefinition.objects.none()
        return qs

    def partial_update(self, request, *args, **kwargs):
        """Guard system definitions: only display_order/options may change (Principle I)."""
        attr_def = self.get_object()
        if attr_def.is_system:
            locked = {"name", "data_type", "unit_family", "content_type"}
            touched = locked.intersection(request.data.keys())
            if touched:
                return Response(
                    {"detail": f"System attributes cannot change: {', '.join(sorted(touched))}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        attr_def = self.get_object()
        if attr_def.is_system:
            return Response(
                {"detail": "System attributes cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if request.query_params.get("confirm") != "true":
            count = AttributeValue.objects.filter(attribute_definition=attr_def).count()
            return Response(
                {
                    "affected_entity_count": count,
                    "message": f"Deleting this attribute will remove {count} value record(s). Add ?confirm=true to proceed.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        attr_def.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AttributeValueViewSet(viewsets.ViewSet):
    """List and bulk-upsert attribute values for a specific entity."""

    def list(self, request):
        ct_param = request.query_params.get("content_type")
        object_id = request.query_params.get("object_id")
        if not ct_param or not object_id:
            return Response(
                {"detail": "content_type and object_id query params are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            app_label, model = ct_param.split(".")
            ct = ContentType.objects.get(app_label=app_label, model=model)
        except (ValueError, ContentType.DoesNotExist):
            return Response({"detail": "Invalid content_type."}, status=status.HTTP_400_BAD_REQUEST)

        values = AttributeValue.objects.filter(content_type=ct, object_id=object_id).select_related(
            "attribute_definition"
        )
        serializer = AttributeValueSerializer(values, many=True)
        return Response(serializer.data)

    def bulk_upsert(self, request):
        ct_param = request.data.get("content_type")
        object_id = request.data.get("object_id")
        attrs = request.data.get("attributes", [])

        if not ct_param or not object_id:
            return Response(
                {"detail": "content_type and object_id are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            app_label, model = ct_param.split(".")
            ct = ContentType.objects.get(app_label=app_label, model=model)
        except (ValueError, ContentType.DoesNotExist):
            return Response({"detail": "Invalid content_type."}, status=status.HTTP_400_BAD_REQUEST)

        upsert_serializer = AttributeValueUpsertSerializer(data=attrs, many=True)
        upsert_serializer.is_valid(raise_exception=True)

        definitions = AttributeDefinition.objects.in_bulk(
            [item["attribute_definition_id"] for item in upsert_serializer.validated_data]
        )
        results = []
        for item in upsert_serializer.validated_data:
            definition = definitions[item["attribute_definition_id"]]
            value, value_unit, value_number, value_number_max = compute_value_fields(
                definition, item["value"], item.get("unit", "")
            )
            obj, _ = AttributeValue.objects.update_or_create(
                attribute_definition_id=definition.id,
                content_type=ct,
                object_id=object_id,
                defaults={
                    "value": value,
                    "value_unit": value_unit,
                    "value_number": value_number,
                    "value_number_max": value_number_max,
                },
            )
            results.append(obj)

        return Response(
            AttributeValueSerializer(results, many=True).data, status=status.HTTP_200_OK
        )
