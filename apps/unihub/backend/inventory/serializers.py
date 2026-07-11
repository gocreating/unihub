"""DRF serializers for the Inventory domain (refinement iteration)."""

from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from inventory import units
from inventory.models import Acquisition, Constraint, Item, Scenario, ScenarioItem

# measure name → (canonical field, unit field, to_canonical, from_canonical, unit table)
_MEASURES = {
    "length": (
        "length_canonical",
        "length_unit",
        units.length_to_canonical,
        units.length_from_canonical,
        units.LENGTH_UNITS,
    ),
    "width": (
        "width_canonical",
        "width_unit",
        units.length_to_canonical,
        units.length_from_canonical,
        units.LENGTH_UNITS,
    ),
    "height": (
        "height_canonical",
        "height_unit",
        units.length_to_canonical,
        units.length_from_canonical,
        units.LENGTH_UNITS,
    ),
    "weight": (
        "weight_canonical",
        "weight_unit",
        units.weight_to_canonical,
        units.weight_from_canonical,
        units.WEIGHT_UNITS,
    ),
}

_NON_NEGATIVE = ["quantity", "price", "cost"]


class AcquisitionSummarySerializer(serializers.ModelSerializer):
    """Compact acquisition representation nested inside an item."""

    class Meta:
        model = Acquisition
        fields = ["id", "source", "method", "obtained_at"]


class ItemSerializer(serializers.ModelSerializer):
    acquisition = AcquisitionSummarySerializer(read_only=True)

    class Meta:
        model = Item
        fields = [
            "id",
            "name",
            "item_type",
            "model",
            "serial_number",
            "spec",
            "remark",
            "quantity",
            "size",
            "price",
            "price_currency",
            "cost",
            "cost_currency",
            "color",
            "url",
            "status",
            "acquisition",
            "archived_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "acquisition", "created_at", "updated_at"]

    # ── Measurement objects ({value, unit}) handled outside declared fields ──

    @staticmethod
    def _fmt(value: Decimal) -> str:
        """Format a decimal without trailing zeros or scientific notation."""
        normalized = value.normalize()
        return format(normalized, "f")

    def to_representation(self, instance: Item) -> dict:
        data = super().to_representation(instance)
        for name, (canon_f, unit_f, _to, _from, _tbl) in _MEASURES.items():
            canonical = getattr(instance, canon_f)
            unit = getattr(instance, unit_f)
            if canonical is None:
                data[name] = None
            else:
                value = _from(canonical, unit)
                data[name] = {"value": self._fmt(value), "unit": unit}
        return data

    def to_internal_value(self, data: dict) -> dict:
        measures = {}
        for name, (canon_f, unit_f, to_canon, _from, table) in _MEASURES.items():
            if name in data:
                raw = data.get(name)
                if raw in (None, ""):
                    measures[canon_f] = None
                    continue
                if not isinstance(raw, dict) or "value" not in raw or "unit" not in raw:
                    raise serializers.ValidationError({name: "Expected an object {value, unit}."})
                unit = raw["unit"]
                if unit not in table:
                    raise serializers.ValidationError({name: f"Unsupported unit {unit!r}."})
                try:
                    value = Decimal(str(raw["value"]))
                except (TypeError, ValueError):
                    raise serializers.ValidationError({name: "value must be a number."})
                if value < 0:
                    raise serializers.ValidationError({name: f"{name} must be >= 0."})
                measures[canon_f] = to_canon(value, unit)
                measures[unit_f] = unit
        validated = super().to_internal_value(data)
        validated.update(measures)
        return validated

    def validate_name(self, value: str) -> str:
        if not value or not value.strip():
            raise serializers.ValidationError("Name is required.")
        return value

    def validate_status(self, value: str) -> str:
        if value not in {"active", "deprecated"}:
            raise serializers.ValidationError("status must be 'active' or 'deprecated'.")
        return value

    def validate(self, attrs: dict) -> dict:
        for field in _NON_NEGATIVE:
            value = attrs.get(field)
            if value is not None and value < Decimal("0"):
                raise serializers.ValidationError({field: f"{field} must be >= 0."})
        return attrs


class AcquisitionSerializer(serializers.ModelSerializer):
    items = ItemSerializer(many=True, required=False)
    item_count = serializers.SerializerMethodField()
    total_item_cost = serializers.SerializerMethodField()

    class Meta:
        model = Acquisition
        fields = [
            "id",
            "source",
            "method",
            "obtained_at",
            "remark",
            "items",
            "item_count",
            "total_item_cost",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_item_count(self, obj: Acquisition) -> int:
        return obj.items.count()

    def get_total_item_cost(self, obj: Acquisition) -> list[dict]:
        """Aggregate item cost grouped by currency (no cross-currency sum)."""
        totals: dict[str, Decimal] = {}
        for item in obj.items.all():
            if item.cost is None:
                continue
            key = item.cost_currency or ""
            totals[key] = totals.get(key, Decimal("0")) + item.cost
        return [
            {"currency": cur, "total": str(total.quantize(Decimal("0.0001")))}
            for cur, total in sorted(totals.items())
        ]

    @transaction.atomic
    def create(self, validated_data: dict) -> Acquisition:
        items_data = validated_data.pop("items", [])
        acquisition = Acquisition.objects.create(**validated_data)
        for item_data in items_data:
            Item.objects.create(acquisition=acquisition, **item_data)
        return acquisition

    def update(self, instance: Acquisition, validated_data: dict) -> Acquisition:
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # New item rows (no id) are appended; editing/removing existing items
        # is done through the item endpoints (PATCH/DELETE /items/{id}/).
        if items_data:
            for item_data in items_data:
                Item.objects.create(acquisition=instance, **item_data)
        return instance


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
        from inventory.services import consumable_shortfall

        shortfall = consumable_shortfall(obj)
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
        limit_value = attrs.get("limit_value", getattr(self.instance, "limit_value", None))

        if ctype == "mutual_exclusive" and len(item_ids) < 2:
            raise serializers.ValidationError(
                {"item_ids": "A mutual-exclusivity constraint needs at least 2 items."}
            )
        if ctype == "required" and len(item_ids) < 1:
            raise serializers.ValidationError(
                {"item_ids": "A required constraint needs at least 1 item."}
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
