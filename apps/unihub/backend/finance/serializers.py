from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from finance.models import (
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


class PortfolioCreateSerializer(serializers.ModelSerializer):
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
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "first_transaction_time",
            "last_transaction_time",
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
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "base_currency",
            "first_transaction_time",
            "last_transaction_time",
            "created_at",
            "updated_at",
        ]


class TransferSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    asset_change_amount = serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True
    )
    value_change = serializers.DecimalField(
        max_digits=38, decimal_places=18, coerce_to_string=True, allow_null=True, required=False
    )

    class Meta:
        model = Transfer
        fields = [
            "id",
            "asset",
            "asset_name",
            "asset_change_amount",
            "value_change",
            "remark",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_name", "created_at", "updated_at"]


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
        portfolio = attrs.get("portfolio")
        if portfolio and portfolio.state != "active":
            raise serializers.ValidationError(
                {"portfolio": "Cannot add a transaction to a closed portfolio."}
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
