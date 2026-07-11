"""DRF serializers for the Inventory domain (refinement iteration)."""

from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from inventory import units
from inventory.models import Acquisition, Constraint, CostFactor, Item, Scenario, ScenarioItem

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
    "volume": (
        "volume_canonical",
        "volume_unit",
        units.volume_to_canonical,
        units.volume_from_canonical,
        units.VOLUME_UNITS,
    ),
}

_NON_NEGATIVE = ["quantity", "sku_price"]


class AcquisitionSummarySerializer(serializers.ModelSerializer):
    """Compact acquisition representation nested inside an item."""

    class Meta:
        model = Acquisition
        fields = ["id", "source", "obtained_at"]


class ItemSerializer(serializers.ModelSerializer):
    acquisition = AcquisitionSummarySerializer(read_only=True)
    total_price = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id",
            "name",
            "quantity",
            "spec",
            "remark",
            "size",
            "sku_price",
            "sku_price_currency",
            "total_price",
            "color",
            "url",
            "status",
            "deprecate_time",
            "acquisition",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "acquisition", "created_at", "updated_at"]

    def get_total_price(self, obj: Item) -> str | None:
        if obj.sku_price is None:
            return None
        return str((obj.sku_price * obj.quantity).quantize(Decimal("0.0001")))

    def get_status(self, obj: Item) -> str:
        return "deprecated" if obj.deprecate_time is not None else "active"

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

    def validate(self, attrs: dict) -> dict:
        for field in _NON_NEGATIVE:
            value = attrs.get(field)
            if value is not None and value < Decimal("0"):
                raise serializers.ValidationError({field: f"{field} must be >= 0."})
        return attrs


class CostFactorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostFactor
        fields = ["id", "value", "currency", "type"]
        read_only_fields = ["id"]


class AcquisitionSerializer(serializers.ModelSerializer):
    items = ItemSerializer(many=True, required=False)
    cost_factors = CostFactorSerializer(many=True, required=False)
    item_count = serializers.SerializerMethodField()
    net_cost = serializers.SerializerMethodField()

    class Meta:
        model = Acquisition
        fields = [
            "id",
            "source",
            "request_time",
            "obtained_at",
            "remark",
            "cost_factors",
            "net_cost",
            "items",
            "item_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_item_count(self, obj: Acquisition) -> int:
        return obj.items.count()

    def get_net_cost(self, obj: Acquisition) -> list[dict]:
        """net_cost = per-currency sum of cost-factor values (value carries its sign)."""
        totals: dict[str, Decimal] = {}
        for factor in obj.cost_factors.all():
            key = factor.currency or ""
            totals[key] = totals.get(key, Decimal("0")) + factor.value
        return [
            {"currency": cur, "total": str(total.quantize(Decimal("0.0001")))}
            for cur, total in sorted(totals.items())
        ]

    @staticmethod
    def _accumulated_default(items_data: list[dict]) -> tuple[Decimal, str]:
        """Derive the accumulated factor value (Σ item total_price) and its currency."""
        total = Decimal("0")
        currency = ""
        for item in items_data:
            sku_price = item.get("sku_price")
            if sku_price is not None:
                total += sku_price * item.get("quantity", 1)
                currency = currency or item.get("sku_price_currency", "")
        return total, currency

    def validate(self, attrs: dict) -> dict:
        if self.instance is None:
            if not attrs.get("items"):
                raise serializers.ValidationError(
                    {"items": "An acquisition needs at least 1 item."}
                )
            # cost_factors may be omitted on create → an accumulated factor is auto-added.
        else:
            if "cost_factors" in attrs and not attrs["cost_factors"]:
                raise serializers.ValidationError(
                    {"cost_factors": "An acquisition needs at least 1 cost factor."}
                )
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict) -> Acquisition:
        items_data = validated_data.pop("items", [])
        factors_data = validated_data.pop("cost_factors", None)
        acquisition = Acquisition.objects.create(**validated_data)
        for item_data in items_data:
            Item.objects.create(acquisition=acquisition, **item_data)
        if factors_data:
            for factor in factors_data:
                CostFactor.objects.create(acquisition=acquisition, **factor)
        else:
            value, currency = self._accumulated_default(items_data)
            CostFactor.objects.create(
                acquisition=acquisition, value=value, currency=currency, type="accumulated"
            )
        return acquisition

    @transaction.atomic
    def update(self, instance: Acquisition, validated_data: dict) -> Acquisition:
        items_data = validated_data.pop("items", None)
        factors_data = validated_data.pop("cost_factors", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # New item rows (no id) are appended; existing items edited/removed via item endpoints.
        if items_data:
            for item_data in items_data:
                Item.objects.create(acquisition=instance, **item_data)
        # cost_factors, when provided, replace the whole set (must remain >= 1).
        if factors_data is not None:
            instance.cost_factors.all().delete()
            for factor in factors_data:
                CostFactor.objects.create(acquisition=instance, **factor)
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
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_container(self, obj: ScenarioItem) -> dict | None:
        if obj.container_id is None:
            return None
        return {"id": obj.container_id, "item_name": obj.container.item.name}


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
