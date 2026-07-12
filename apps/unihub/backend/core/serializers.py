from rest_framework import serializers

from core.models import AttributeDefinition, AttributeValue


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
        ]
        read_only_fields = ["id"]


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
