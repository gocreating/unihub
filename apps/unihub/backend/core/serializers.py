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
            "is_system",
            "display_order",
            "options",
        ]
        read_only_fields = ["id", "is_system", "content_type_label"]

    def get_content_type_label(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"


class AttributeValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttributeValue
        fields = ["id", "attribute_definition", "content_type", "object_id", "value"]
        read_only_fields = ["id"]


class AttributeValueUpsertSerializer(serializers.Serializer):
    attribute_definition_id = serializers.CharField(max_length=12)
    value = serializers.CharField(allow_blank=True)

    def validate_attribute_definition_id(self, value):
        try:
            AttributeDefinition.objects.get(pk=value)
        except AttributeDefinition.DoesNotExist:
            raise serializers.ValidationError("AttributeDefinition not found.")
        return value
