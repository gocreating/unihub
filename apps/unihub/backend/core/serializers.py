from django.db import transaction
from rest_framework import serializers

from core.models import AttributeDefinition, AttributeValue, EntityView


class AttributeDefinitionSerializer(serializers.ModelSerializer):
    content_type_label = serializers.SerializerMethodField()

    class Meta:
        model = AttributeDefinition
        fields = [
            "id",
            "content_type",
            "content_type_label",
            "name",
            "data_type",
            "unit_family",
            "emoji",
            "is_system",
            "display_order",
            "options",
        ]
        read_only_fields = ["id", "is_system", "content_type_label"]

    def get_content_type_label(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"

    def validate(self, attrs: dict) -> dict:
        """Dimension definitions require a unit family; others must not carry one."""
        data_type = attrs.get("data_type", getattr(self.instance, "data_type", None))
        unit_family = attrs.get("unit_family", getattr(self.instance, "unit_family", ""))
        if data_type == "dimension" and not unit_family:
            raise serializers.ValidationError(
                {"unit_family": "A dimension attribute requires a unit family."}
            )
        if data_type != "dimension" and unit_family:
            raise serializers.ValidationError(
                {"unit_family": "Only dimension attributes may set a unit family."}
            )
        return attrs


class AttributeValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttributeValue
        fields = [
            "id",
            "attribute_definition",
            "content_type",
            "object_id",
            "value",
            "value_unit",
            "value_number",
            "value_number_max",
        ]
        read_only_fields = ["id"]


class EntityViewSerializer(serializers.ModelSerializer):
    """Saved entity view. ``owner`` is never serialized — it is stamped from the
    request user by the viewset and every queryset is owner-scoped."""

    class Meta:
        model = EntityView
        fields = [
            "id",
            "table_key",
            "name",
            "config",
            "pinned",
            "position",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        """Strip surrounding whitespace and reject blank names."""
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("This field may not be blank.")
        return stripped

    def validate_table_key(self, value: str) -> str:
        """Reject blank table keys and any change on an existing view."""
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("This field may not be blank.")
        if self.instance is not None and stripped != self.instance.table_key:
            raise serializers.ValidationError("table_key is immutable.")
        return stripped

    def validate_config(self, value: object) -> dict:
        """Require a JSON object; the deep shape is owned by the frontend."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("config must be a JSON object.")
        return value

    def validate_is_default(self, value: bool) -> bool:
        """The default role is transferable (round 3); it can never be unset.

        Promotion (``false → true``) is allowed and demotes the incumbent in
        :meth:`update`. Clearing the flag on the current holder would leave the
        table with no fallback view, so it is rejected (FR-026).
        """
        if self.instance is not None and self.instance.is_default and not value:
            raise serializers.ValidationError(
                "The default view cannot be unset; set another view as default instead."
            )
        return value

    def validate(self, attrs: dict) -> dict:
        """Enforce the single-default-view rule as a 400.

        Round 4: names are non-identifying labels — duplicates are legal, so
        no name-collision check remains here (FR-016).
        """
        request = self.context.get("request")
        owner = getattr(request, "user", None)
        if owner is None or not owner.is_authenticated:
            return attrs
        table_key = attrs.get("table_key", getattr(self.instance, "table_key", None))
        if self.instance is None and attrs.get("is_default") and table_key:
            if EntityView.objects.filter(
                owner=owner, table_key=table_key, is_default=True
            ).exists():
                raise serializers.ValidationError(
                    {"is_default": "This table already has a default view."}
                )
        return attrs

    def update(self, instance: EntityView, validated_data: dict) -> EntityView:
        """Transfer the default role atomically when this view is promoted.

        The partial ``UniqueConstraint(owner, table_key, WHERE is_default)`` is
        checked per statement, so the incumbent MUST be cleared before this row
        is saved; the transaction makes the two-statement window invisible to
        readers. Promotion also pins the view — the fallback must stay reachable
        as a tab (FR-003) — while the demoted row keeps its pin, position, name,
        and config verbatim (FR-026).
        """
        if not validated_data.get("is_default"):
            return super().update(instance, validated_data)

        with transaction.atomic():
            EntityView.objects.filter(
                owner=instance.owner, table_key=instance.table_key, is_default=True
            ).exclude(pk=instance.pk).update(is_default=False)
            validated_data["pinned"] = True
            return super().update(instance, validated_data)


class AttributeValueUpsertSerializer(serializers.Serializer):
    attribute_definition_id = serializers.CharField(max_length=12)
    value = serializers.CharField(allow_blank=True)
    unit = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_attribute_definition_id(self, value):
        try:
            AttributeDefinition.objects.get(pk=value)
        except AttributeDefinition.DoesNotExist:
            raise serializers.ValidationError("AttributeDefinition not found.")
        return value
