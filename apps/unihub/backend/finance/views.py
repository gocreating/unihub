from decimal import Decimal

from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from finance.models import Account, Balance, BalanceSheet, ExchangeRate
from finance.serializers import (
    AccountSerializer,
    BalanceSerializer,
    BalanceSheetSerializer,
    BalanceUpsertSerializer,
    ExchangeRateSerializer,
)


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'account_type', 'currency']
    ordering = ['name']
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if request.query_params.get('confirm') != 'true':
            count = Balance.objects.filter(account=account).count()
            if count > 0:
                return Response(
                    {
                        'affected_balance_count': count,
                        'message': f'Deleting this account will remove {count} balance record(s). Add ?confirm=true to proceed.',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        account.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BalanceSheetViewSet(viewsets.ModelViewSet):
    queryset = BalanceSheet.objects.all()
    serializer_class = BalanceSheetSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['date', 'label']
    ordering = ['-date']
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    @action(detail=True, methods=['get'], url_path='balances')
    def list_balances(self, request, pk=None):
        sheet = self.get_object()
        balances = Balance.objects.filter(balance_sheet=sheet).select_related('account')
        serializer = BalanceSerializer(balances, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['put'], url_path=r'balances/(?P<account_id>[A-Za-z0-9]{12})')
    def upsert_balance(self, request, pk=None, account_id=None):
        sheet = self.get_object()
        try:
            account = Account.objects.get(pk=account_id)
        except Account.DoesNotExist:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = BalanceUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        balance, _ = Balance.objects.update_or_create(
            account=account,
            balance_sheet=sheet,
            defaults={'amount': serializer.validated_data['amount']},
        )
        return Response(BalanceSerializer(balance).data)

    @action(detail=True, methods=['delete'], url_path=r'balances/(?P<account_id>[A-Za-z0-9]{12})/delete')
    def delete_balance(self, request, pk=None, account_id=None):
        sheet = self.get_object()
        try:
            balance = Balance.objects.get(balance_sheet=sheet, account_id=account_id)
        except Balance.DoesNotExist:
            return Response({'detail': 'Balance not found.'}, status=status.HTTP_404_NOT_FOUND)
        balance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='net-worth')
    def net_worth(self, request, pk=None):
        sheet = self.get_object()
        balances = Balance.objects.filter(balance_sheet=sheet).select_related('account')

        # Group by currency
        currency_data: dict[str, dict[str, Decimal]] = {}
        for balance in balances:
            currency = balance.account.currency
            if currency not in currency_data:
                currency_data[currency] = {'assets': Decimal('0'), 'liabilities': Decimal('0')}
            if balance.account.account_type in ('asset', 'equity'):
                currency_data[currency]['assets'] += balance.amount
            else:
                currency_data[currency]['liabilities'] += balance.amount

        per_currency = []
        for currency, data in currency_data.items():
            net = data['assets'] - data['liabilities']
            per_currency.append({
                'currency': currency,
                'total_assets': str(data['assets'].quantize(Decimal('0.0000'))),
                'total_liabilities': str(data['liabilities'].quantize(Decimal('0.0000'))),
                'net_worth': str(net.quantize(Decimal('0.0000'))),
            })

        base = sheet.base_currency
        covered = []
        missing_rates = []
        total_net_worth = Decimal('0')

        for entry in per_currency:
            currency = entry['currency']
            net = Decimal(entry['net_worth'])
            if currency == base:
                total_net_worth += net
                covered.append(currency)
            else:
                rate = ExchangeRate.objects.filter(
                    from_currency=currency,
                    to_currency=base,
                    date__lte=sheet.date,
                ).order_by('-date').first()
                if rate:
                    total_net_worth += net * rate.rate
                    covered.append(currency)
                else:
                    missing_rates.append({
                        'currency': currency,
                        'message': f'No exchange rate found for {currency} → {base} on or before {sheet.date}',
                    })

        return Response({
            'balance_sheet_id': sheet.id,
            'date': str(sheet.date),
            'base_currency': base,
            'per_currency': per_currency,
            'base_currency_total': {
                'net_worth': str(total_net_worth.quantize(Decimal('0.0000'))),
                'covered_currencies': covered,
                'missing_rates': missing_rates,
            },
        })


class ExchangeRateViewSet(viewsets.ModelViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['date', 'from_currency', 'to_currency']
    ordering = ['-date']
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        from_currency = self.request.query_params.get('from_currency')
        to_currency = self.request.query_params.get('to_currency')
        if from_currency:
            qs = qs.filter(from_currency=from_currency.upper())
        if to_currency:
            qs = qs.filter(to_currency=to_currency.upper())
        return qs
