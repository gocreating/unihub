from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from finance.models import (
    PORTFOLIO_STATE_ACTIVE,
    PORTFOLIO_STATE_CLOSED,
    Account,
    Asset,
    Balance,
    BalanceSheet,
    Currency,
    ExchangeRate,
    Portfolio,
    Transaction,
    Transfer,
)


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = ["id", "name", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        """FR-038: a currency is NOT an asset.

        The legacy import once created 新台幣/美元 as Assets so cash could be
        recorded; the model now has a currency leg for that, and this guard stops
        the conflation returning by hand.
        """
        candidate = value.strip()
        folded = candidate.casefold()
        for code, name, symbol in Currency.objects.values_list("code", "name", "symbol"):
            if folded in {code.casefold(), name.casefold()} or (
                symbol and candidate == symbol
            ):
                raise serializers.ValidationError(
                    f'"{candidate}" is the currency {code}. Record cash as a currency '
                    "transfer instead of creating an asset for it."
                )
        return candidate


class PortfolioCreateSerializer(serializers.ModelSerializer):
    # FR-031: read-only annotations from PortfolioViewSet.get_queryset().
    value_invested = serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True, read_only=True, allow_null=True
    )
    value_returned = serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True, read_only=True, allow_null=True
    )
    net_value_change = serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True, read_only=True, allow_null=True
    )
    # FR-046: the Position column. Bulk-computed once per page by
    # PortfolioViewSet.list(); [] on any other action, where the detail
    # `holdings` endpoint is the right source.
    holdings = serializers.SerializerMethodField()

    def get_holdings(self, obj) -> list[dict]:
        view = self.context.get("view")
        return getattr(view, "holdings_map", {}).get(obj.pk, [])

    class Meta:
        model = Portfolio
        fields = [
            "id",
            "name",
            "base_currency",
            "description",
            "state",
            "first_transaction_time",
            "last_transaction_time",
            "value_invested",
            "value_returned",
            "net_value_change",
            "holdings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "first_transaction_time",
            "last_transaction_time",
            "value_invested",
            "value_returned",
            "net_value_change",
            "created_at",
            "updated_at",
        ]

    def validate_base_currency(self, value):
        value = value.upper()
        if not Currency.objects.filter(code=value).exists():
            raise serializers.ValidationError(
                f'Currency "{value}" does not exist. Add it in Currency management first.'
            )
        return value


class PortfolioUpdateSerializer(serializers.ModelSerializer):
    # FR-031: read-only annotations from PortfolioViewSet.get_queryset().
    value_invested = serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True, read_only=True, allow_null=True
    )
    value_returned = serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True, read_only=True, allow_null=True
    )
    net_value_change = serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True, read_only=True, allow_null=True
    )
    # FR-046: the Position column. Bulk-computed once per page by
    # PortfolioViewSet.list(); [] on any other action, where the detail
    # `holdings` endpoint is the right source.
    holdings = serializers.SerializerMethodField()

    def get_holdings(self, obj) -> list[dict]:
        view = self.context.get("view")
        return getattr(view, "holdings_map", {}).get(obj.pk, [])

    class Meta:
        model = Portfolio
        fields = [
            "id",
            "name",
            "base_currency",
            "description",
            "state",
            "first_transaction_time",
            "last_transaction_time",
            "value_invested",
            "value_returned",
            "net_value_change",
            "holdings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "base_currency",
            "first_transaction_time",
            "last_transaction_time",
            "value_invested",
            "value_returned",
            "net_value_change",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        """FR-026: a closed portfolio is frozen — except for reopening it.

        The naive "reject every write while closed" rule also makes the
        portfolio unreopenable, so the ONE permitted change is setting the
        state back to active.
        """
        instance = self.instance
        if instance is not None and instance.state == PORTFOLIO_STATE_CLOSED:
            becoming_active = attrs.get("state") == PORTFOLIO_STATE_ACTIVE
            other_changes = {
                field: value
                for field, value in attrs.items()
                if field != "state" and value != getattr(instance, field)
            }
            if not becoming_active or other_changes:
                raise serializers.ValidationError(
                    {
                        "portfolio": (
                            "This portfolio is closed. Reopen it before making "
                            "any other change."
                        )
                    }
                )
        return attrs


def _decimal(**kwargs):
    return serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True, **kwargs
    )


class TransferSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    currency_symbol = serializers.CharField(source="currency.symbol", read_only=True)
    pnl_change = _decimal(allow_null=True, required=False)
    currency_amount = _decimal(allow_null=True, required=False)
    asset_change_amount = _decimal(allow_null=True, required=False)

    class Meta:
        model = Transfer
        fields = [
            "id",
            "pnl_change",
            "currency",
            "currency_symbol",
            "currency_amount",
            "asset",
            "asset_name",
            "asset_change_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_name", "currency_symbol", "created_at", "updated_at"]

    def validate(self, attrs):
        """FR-037: optional PnL plus EXACTLY ONE of currency / asset.

        Mirrors the database CheckConstraint so the caller gets a 400 with a
        readable message instead of an IntegrityError.
        """
        currency = attrs.get("currency")
        asset = attrs.get("asset")
        if bool(currency) == bool(asset):
            raise serializers.ValidationError(
                "A transfer must record either a currency change or an asset change — "
                "exactly one, never both."
            )
        if currency and attrs.get("currency_amount") is None:
            raise serializers.ValidationError(
                {"currency_amount": "Required for a currency (cash) transfer."}
            )
        if asset and attrs.get("asset_change_amount") is None:
            raise serializers.ValidationError(
                {"asset_change_amount": "Required for an asset (position) transfer."}
            )
        return attrs


class TransactionSerializer(serializers.ModelSerializer):
    transfers = TransferSerializer(many=True)
    portfolio_name = serializers.CharField(source="portfolio.name", read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "portfolio",
            "portfolio_name",
            "timestamp",
            "description",
            "chain_id",
            "tx_hash",
            "transfers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "portfolio_name", "created_at", "updated_at"]

    def validate(self, attrs):
        # FR-026: a closed portfolio freezes its transactions. On create the
        # target comes from the payload; on update it comes from the existing
        # row, since `portfolio` is not resent.
        portfolio = attrs.get("portfolio") or (
            self.instance.portfolio if self.instance is not None else None
        )
        if portfolio and portfolio.state != PORTFOLIO_STATE_ACTIVE:
            raise serializers.ValidationError(
                {
                    "portfolio": (
                        "This portfolio is closed. Reopen it before adding or "
                        "changing its transactions."
                    )
                }
            )
        transfers = attrs.get("transfers", [])
        if not transfers:
            raise serializers.ValidationError({"transfers": "At least one transfer is required."})
        return attrs

    def create(self, validated_data):
        transfers_data = validated_data.pop("transfers")
        with transaction.atomic():
            txn = Transaction.objects.create(**validated_data)
            for t_data in transfers_data:
                Transfer.objects.create(transaction=txn, **t_data)
        return txn

    def update(self, instance, validated_data):
        transfers_data = validated_data.pop("transfers", None)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if transfers_data is not None:
                instance.transfers.all().delete()
                for t_data in transfers_data:
                    Transfer.objects.create(transaction=instance, **t_data)
        return instance


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ["code", "name", "symbol", "is_base_currency"]


class AccountSerializer(serializers.ModelSerializer):
    open_datetime = serializers.DateTimeField(required=True)

    class Meta:
        model = Account
        fields = [
            "id",
            "name",
            "currency",
            "color",
            "open_datetime",
            "close_datetime",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_currency(self, value):
        value = value.upper()
        if not Currency.objects.filter(code=value).exists():
            raise serializers.ValidationError(
                f'Currency "{value}" does not exist. Add it in Currency management first.'
            )
        return value


class BalanceSheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = BalanceSheet
        fields = ["id", "date", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class BalanceSerializer(serializers.ModelSerializer):
    account_id = serializers.CharField(source="account.id", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    currency = serializers.CharField(source="account.currency", read_only=True)
    color = serializers.CharField(source="account.color", read_only=True)
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, coerce_to_string=True)

    class Meta:
        model = Balance
        fields = ["id", "account_id", "account_name", "currency", "color", "amount"]
        read_only_fields = ["id", "account_id", "account_name", "currency", "color"]


class BalanceUpsertSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, coerce_to_string=True)


class ExchangeRateSerializer(serializers.ModelSerializer):
    rate = serializers.DecimalField(max_digits=24, decimal_places=8, coerce_to_string=True)

    class Meta:
        model = ExchangeRate
        fields = ["id", "base_currency", "quote_currency", "rate", "date"]
        read_only_fields = ["id"]

    def validate_rate(self, value):
        if value <= Decimal("0"):
            raise serializers.ValidationError("rate must be greater than 0.")
        return value

    def validate_base_currency(self, value):
        value = value.upper()
        if not Currency.objects.filter(code=value).exists():
            raise serializers.ValidationError(f'Currency "{value}" does not exist.')
        return value

    def validate_quote_currency(self, value):
        value = value.upper()
        if not Currency.objects.filter(code=value).exists():
            raise serializers.ValidationError(f'Currency "{value}" does not exist.')
        return value
