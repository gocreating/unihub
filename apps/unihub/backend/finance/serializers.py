from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers

from core.models import AttributeValue
from finance.models import Account, Balance, BalanceSheet, Currency, ExchangeRate


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ['code', 'name', 'symbol']


class CustomAttributeSerializer(serializers.Serializer):
    attribute_definition_id = serializers.CharField()
    attribute_name = serializers.CharField()
    value = serializers.CharField(allow_blank=True)


class AccountSerializer(serializers.ModelSerializer):
    custom_attributes = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = ['id', 'name', 'currency', 'created_at', 'updated_at', 'custom_attributes']
        read_only_fields = ['id', 'created_at', 'updated_at', 'custom_attributes']

    def get_custom_attributes(self, obj):
        ct = ContentType.objects.get_for_model(Account)
        values = AttributeValue.objects.filter(
            content_type=ct, object_id=obj.id, attribute_definition__is_system=False
        ).select_related('attribute_definition')
        return [
            {
                'attribute_definition_id': v.attribute_definition_id,
                'attribute_name': v.attribute_definition.name,
                'value': v.value,
            }
            for v in values
        ]

    def validate_currency(self, value):
        value = value.upper()
        if not Currency.objects.filter(code=value).exists():
            raise serializers.ValidationError(f'Currency "{value}" does not exist. Add it in Currency management first.')
        return value


class BalanceSheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = BalanceSheet
        fields = ['id', 'date', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class BalanceSerializer(serializers.ModelSerializer):
    account_id = serializers.CharField(source='account.id', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    currency = serializers.CharField(source='account.currency', read_only=True)
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, coerce_to_string=True)

    class Meta:
        model = Balance
        fields = ['id', 'account_id', 'account_name', 'currency', 'amount']
        read_only_fields = ['id', 'account_id', 'account_name', 'currency']


class BalanceUpsertSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, coerce_to_string=True)


class ExchangeRateSerializer(serializers.ModelSerializer):
    rate = serializers.DecimalField(max_digits=24, decimal_places=8, coerce_to_string=True)

    class Meta:
        model = ExchangeRate
        fields = ['id', 'base_currency', 'quote_currency', 'rate', 'date']
        read_only_fields = ['id']

    def validate_rate(self, value):
        if value <= Decimal('0'):
            raise serializers.ValidationError('rate must be greater than 0.')
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
