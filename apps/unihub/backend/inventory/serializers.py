"""DRF serializers for the Inventory domain (refinement iteration)."""

from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from rest_framework import serializers

from core.attributes import compute_value_fields
from core.models import AttributeDefinition, AttributeValue
from inventory.models import Acquisition, CostFactor, Item, Scenario, ScenarioItem

_NON_NEGATIVE = ["quantity", "sku_price"]


def _validate_parameters(raw: list) -> list[dict]:
    """Validate a raw ``parameters`` payload into storable rows.

    Args:
        raw: List of ``{definition_id, value, unit?}`` dicts.

    Returns:
        Rows of ``{definition, value, value_unit, value_number}``.

    Raises:
        serializers.ValidationError: On malformed rows, unknown/foreign
            definitions, duplicate keys, or type-invalid values.
    """
    if not isinstance(raw, list):
        raise serializers.ValidationError({"parameters": "Expected a list of parameter rows."})
    item_ct = ContentType.objects.get(app_label="inventory", model="item")
    rows: list[dict] = []
    seen: set[str] = set()
    for entry in raw:
        if not isinstance(entry, dict) or "definition_id" not in entry:
            raise serializers.ValidationError(
                {"parameters": "Each row needs a definition_id and value."}
            )
        definition_id = entry["definition_id"]
        if definition_id in seen:
            raise serializers.ValidationError(
                {"parameters": "At most one value per parameter key."}
            )
        seen.add(definition_id)
        definition = AttributeDefinition.objects.filter(
            pk=definition_id, content_type=item_ct
        ).first()
        if definition is None:
            raise serializers.ValidationError(
                {"parameters": f"Unknown parameter definition {definition_id!r}."}
            )
        value, value_unit, value_number = compute_value_fields(
            definition, entry.get("value", ""), entry.get("unit", "") or ""
        )
        rows.append(
            {
                "definition": definition,
                "value": value,
                "value_unit": value_unit,
                "value_number": value_number,
            }
        )
    return rows


def _write_parameters(item: Item, rows: list[dict]) -> None:
    """Upsert-replace the item's parameter values with ``rows``."""
    item_ct = ContentType.objects.get_for_model(Item)
    keep: list[str] = []
    for row in rows:
        AttributeValue.objects.update_or_create(
            attribute_definition=row["definition"],
            content_type=item_ct,
            object_id=item.id,
            defaults={
                "value": row["value"],
                "value_unit": row["value_unit"],
                "value_number": row["value_number"],
            },
        )
        keep.append(row["definition"].id)
    AttributeValue.objects.filter(content_type=item_ct, object_id=item.id).exclude(
        attribute_definition_id__in=keep
    ).delete()


def _net_cost(acquisition: Acquisition) -> list[dict]:
    """Per-currency sum of the acquisition's cost-factor values.

    Args:
        acquisition: The acquisition whose cost factors are aggregated.

    Returns:
        One ``{"currency", "total"}`` entry per currency, sorted by currency;
        the factor value carries its own sign (no FX conversion).
    """
    totals: dict[str, Decimal] = {}
    for factor in acquisition.cost_factors.all():
        key = factor.currency or ""
        totals[key] = totals.get(key, Decimal("0")) + factor.value
    return [
        {"currency": cur, "total": str(total.quantize(Decimal("0.0001")))}
        for cur, total in sorted(totals.items())
    ]


class AcquisitionSummarySerializer(serializers.ModelSerializer):
    """Compact acquisition representation nested inside an item."""

    net_cost = serializers.SerializerMethodField()

    class Meta:
        model = Acquisition
        fields = ["id", "source", "request_time", "obtained_at", "net_cost"]

    def get_net_cost(self, obj: Acquisition) -> list[dict]:
        """net_cost = per-currency sum of cost-factor values (value carries its sign)."""
        return _net_cost(obj)


class ItemSerializer(serializers.ModelSerializer):
    acquisition = AcquisitionSummarySerializer(read_only=True)
    total_price = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    parameters = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id",
            "name",
            "quantity",
            "spec",
            "remark",
            "sku_price",
            "sku_price_currency",
            "total_price",
            "url",
            "status",
            "deprecate_time",
            "parameters",
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

    def get_parameters(self, obj: Item) -> list[dict]:
        """The item's parameter rows (shared attribute values), stable order."""
        values = sorted(
            obj.attribute_values.all(),
            key=lambda v: (v.attribute_definition.display_order, v.attribute_definition.name),
        )
        return [
            {
                "definition_id": v.attribute_definition_id,
                "name": v.attribute_definition.name,
                "data_type": v.attribute_definition.data_type,
                "unit_family": v.attribute_definition.unit_family,
                "value": v.value,
                "unit": v.value_unit,
                "value_number": str(v.value_number) if v.value_number is not None else None,
            }
            for v in values
        ]

    def to_internal_value(self, data: dict) -> dict:
        """Handle the write-side ``parameters`` list outside declared fields."""
        validated = super().to_internal_value(data)
        if "parameters" in data:
            validated["_parameters"] = _validate_parameters(data.get("parameters") or [])
        return validated

    @transaction.atomic
    def update(self, instance: Item, validated_data: dict) -> Item:
        rows = validated_data.pop("_parameters", None)
        instance = super().update(instance, validated_data)
        if rows is not None:
            _write_parameters(instance, rows)
        return instance

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
        fields = ["id", "value", "currency", "type", "display_order"]
        # display_order is assigned server-side from the payload order.
        read_only_fields = ["id", "display_order"]


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
        return _net_cost(obj)

    @staticmethod
    def _derive_accumulated(items_data: list[dict]) -> list[dict]:
        """One accumulated factor per distinct item currency (Σ sku_price × quantity)."""
        totals: dict[str, Decimal] = {}
        for item in items_data:
            sku_price = item.get("sku_price")
            if sku_price is not None:
                currency = item.get("sku_price_currency", "") or ""
                totals[currency] = totals.get(currency, Decimal("0")) + sku_price * item.get(
                    "quantity", 1
                )
        if not totals:
            # No priced items → keep the ≥1-factor invariant with a zero accumulated.
            return [{"value": Decimal("0"), "currency": "", "type": "accumulated"}]
        return [
            {"value": total, "currency": currency, "type": "accumulated"}
            for currency, total in sorted(totals.items())
        ]

    @staticmethod
    def _reject_duplicate_accumulated(factors: list[dict]) -> None:
        currencies = [f["currency"] for f in factors if f.get("type") == "accumulated"]
        if len(currencies) != len(set(currencies)):
            raise serializers.ValidationError(
                {"cost_factors": "At most one accumulated factor per currency."}
            )

    def validate(self, attrs: dict) -> dict:
        factors = attrs.get("cost_factors")
        if self.instance is None:
            if not attrs.get("items"):
                raise serializers.ValidationError(
                    {"items": "An acquisition needs at least 1 item."}
                )
            # accumulated is system-derived on create; clients may only send manual factors.
            if factors and any(f.get("type") == "accumulated" for f in factors):
                raise serializers.ValidationError(
                    {"cost_factors": "The accumulated factor is system-managed."}
                )
        else:
            if "cost_factors" in attrs and not attrs["cost_factors"]:
                raise serializers.ValidationError(
                    {"cost_factors": "An acquisition needs at least 1 cost factor."}
                )
            if factors:
                self._reject_duplicate_accumulated(factors)
        return attrs

    @staticmethod
    def _write_factors(acquisition: Acquisition, factors: list[dict]) -> None:
        for order, factor in enumerate(factors):
            CostFactor.objects.create(
                acquisition=acquisition,
                value=factor["value"],
                currency=factor.get("currency", ""),
                type=factor.get("type", "other"),
                display_order=order,
            )

    @staticmethod
    def _create_item(acquisition: Acquisition, item_data: dict) -> Item:
        parameter_rows = item_data.pop("_parameters", None)
        item = Item.objects.create(acquisition=acquisition, **item_data)
        if parameter_rows:
            _write_parameters(item, parameter_rows)
        return item

    @transaction.atomic
    def create(self, validated_data: dict) -> Acquisition:
        items_data = validated_data.pop("items", [])
        factors_data = validated_data.pop("cost_factors", None) or []
        acquisition = Acquisition.objects.create(**validated_data)
        for item_data in items_data:
            self._create_item(acquisition, item_data)
        # Derived accumulated (per currency) first, then any manual factors.
        self._write_factors(acquisition, self._derive_accumulated(items_data) + list(factors_data))
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
                self._create_item(instance, item_data)
        # cost_factors, when provided, replace the whole set in payload order (must remain ≥1).
        if factors_data is not None:
            instance.cost_factors.all().delete()
            self._write_factors(instance, factors_data)
        return instance


class ScenarioSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Scenario
        fields = [
            "id",
            "name",
            "description",
            "item_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_item_count(self, obj: Scenario) -> int:
        return obj.items.count()

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
            "display_order",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "display_order", "created_at"]

    def get_container(self, obj: ScenarioItem) -> dict | None:
        if obj.container_id is None:
            return None
        return {"id": obj.container_id, "item_name": obj.container.item.name}
