"""DRF serializers for the Inventory domain."""

from decimal import Decimal

from rest_framework import serializers

from inventory.models import Acquisition, Constraint, Item, Scenario, ScenarioItem

_NON_NEGATIVE_FIELDS = ["quantity", "length", "width", "height", "weight", "price", "cost"]


class AcquisitionSummarySerializer(serializers.ModelSerializer):
    """Compact acquisition representation nested inside an item."""

    class Meta:
        model = Acquisition
        fields = ["id", "source", "method"]


class ItemSerializer(serializers.ModelSerializer):
    acquisition_detail = AcquisitionSummarySerializer(source="acquisition", read_only=True)
    origin_known = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id",
            "name",
            "item_type",
            "category",
            "model",
            "serial_number",
            "quantity",
            "length",
            "width",
            "height",
            "size",
            "weight",
            "price",
            "cost",
            "purchase_time",
            "storage_location",
            "status",
            "acquisition",
            "acquisition_detail",
            "origin_known",
            "archived_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_origin_known(self, obj: Item) -> bool:
        return obj.acquisition_id is not None

    def validate_name(self, value: str) -> str:
        if not value or not value.strip():
            raise serializers.ValidationError("Name is required.")
        return value

    def validate(self, attrs: dict) -> dict:
        for field in _NON_NEGATIVE_FIELDS:
            value = attrs.get(field)
            if value is not None and value < Decimal("0"):
                raise serializers.ValidationError({field: f"{field} must be >= 0."})
        return attrs


class AcquisitionSerializer(serializers.ModelSerializer):
    item_ids = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)
    items = ItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    total_item_cost = serializers.SerializerMethodField()
    has_arrived = serializers.SerializerMethodField()

    class Meta:
        model = Acquisition
        fields = [
            "id",
            "source",
            "method",
            "obtained_at",
            "arrived_at",
            "cost",
            "notes",
            "item_ids",
            "items",
            "item_count",
            "total_item_cost",
            "has_arrived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_item_count(self, obj: Acquisition) -> int:
        return obj.items.count()

    def get_total_item_cost(self, obj: Acquisition) -> str:
        total = sum((item.cost or Decimal("0")) for item in obj.items.all()) or Decimal("0")
        return str(total.quantize(Decimal("0.0001")))

    def get_has_arrived(self, obj: Acquisition) -> bool:
        return obj.arrived_at is not None

    def _apply_item_links(self, acquisition: Acquisition, item_ids: list[str]) -> None:
        # Detach items no longer linked, then link the given set.
        acquisition.items.exclude(id__in=item_ids).update(acquisition=None)
        Item.objects.filter(id__in=item_ids).update(acquisition=acquisition)

    def create(self, validated_data: dict) -> Acquisition:
        item_ids = validated_data.pop("item_ids", [])
        acquisition = super().create(validated_data)
        if item_ids:
            Item.objects.filter(id__in=item_ids).update(acquisition=acquisition)
        return acquisition

    def update(self, instance: Acquisition, validated_data: dict) -> Acquisition:
        item_ids = validated_data.pop("item_ids", None)
        acquisition = super().update(instance, validated_data)
        if item_ids is not None:
            self._apply_item_links(acquisition, item_ids)
        return acquisition


class ScenarioSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    prepared_count = serializers.SerializerMethodField()
    outstanding_count = serializers.SerializerMethodField()
    complete = serializers.SerializerMethodField()

    class Meta:
        model = Scenario
        fields = [
            "id",
            "name",
            "notes",
            "item_count",
            "prepared_count",
            "outstanding_count",
            "complete",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_item_count(self, obj: Scenario) -> int:
        return obj.items.count()

    def get_prepared_count(self, obj: Scenario) -> int:
        return obj.items.filter(prepared=True).count()

    def get_outstanding_count(self, obj: Scenario) -> int:
        return obj.items.filter(prepared=False).count()

    def get_complete(self, obj: Scenario) -> bool:
        total = obj.items.count()
        return total > 0 and obj.items.filter(prepared=False).count() == 0

    def validate_name(self, value: str) -> str:
        if not value or not value.strip():
            raise serializers.ValidationError("Name is required.")
        return value


class ScenarioItemSerializer(serializers.ModelSerializer):
    item_id = serializers.CharField(write_only=True)
    container_id = serializers.CharField(
        write_only=True, required=False, allow_null=True, allow_blank=True
    )
    item = ItemSerializer(read_only=True)
    container = serializers.SerializerMethodField()
    shortfall = serializers.SerializerMethodField()

    class Meta:
        model = ScenarioItem
        fields = [
            "id",
            "item_id",
            "container_id",
            "item",
            "container",
            "required_quantity",
            "prepared",
            "notes",
            "shortfall",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_container(self, obj: ScenarioItem) -> dict | None:
        if obj.container_id is None:
            return None
        return {"id": obj.container_id, "item_name": obj.container.item.name}

    def get_shortfall(self, obj: ScenarioItem) -> str | None:
        from inventory.services import _consumable_shortfall

        shortfall = _consumable_shortfall(obj)
        return str(shortfall) if shortfall and shortfall > 0 else None


class ConstraintSerializer(serializers.ModelSerializer):
    item_ids = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)
    items = serializers.SerializerMethodField()

    class Meta:
        model = Constraint
        fields = [
            "id",
            "name",
            "constraint_type",
            "item_ids",
            "items",
            "target_category",
            "limit_value",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_items(self, obj: Constraint) -> list[dict]:
        return [{"id": item.id, "name": item.name} for item in obj.items.all()]

    def validate(self, attrs: dict) -> dict:
        ctype = attrs.get("constraint_type") or getattr(self.instance, "constraint_type", None)
        item_ids = attrs.get("item_ids")
        if item_ids is None and self.instance is not None:
            item_ids = list(self.instance.items.values_list("id", flat=True))
        item_ids = item_ids or []
        target_category = attrs.get(
            "target_category", getattr(self.instance, "target_category", "")
        )
        limit_value = attrs.get("limit_value", getattr(self.instance, "limit_value", None))

        if ctype == "mutual_exclusive" and len(item_ids) < 2:
            raise serializers.ValidationError(
                {"item_ids": "A mutual-exclusivity constraint needs at least 2 items."}
            )
        if ctype == "required" and not item_ids and not target_category:
            raise serializers.ValidationError(
                {"item_ids": "A required constraint needs an item set or a target category."}
            )
        if ctype == "weight_limit" and (limit_value is None or limit_value <= Decimal("0")):
            raise serializers.ValidationError(
                {"limit_value": "A weight-limit constraint needs a positive limit_value."}
            )
        return attrs

    def create(self, validated_data: dict) -> Constraint:
        item_ids = validated_data.pop("item_ids", [])
        constraint = super().create(validated_data)
        if item_ids:
            constraint.items.set(Item.objects.filter(id__in=item_ids))
        return constraint

    def update(self, instance: Constraint, validated_data: dict) -> Constraint:
        item_ids = validated_data.pop("item_ids", None)
        constraint = super().update(instance, validated_data)
        if item_ids is not None:
            constraint.items.set(Item.objects.filter(id__in=item_ids))
        return constraint
