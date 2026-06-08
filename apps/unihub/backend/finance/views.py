from decimal import Decimal

from django.db.models import ProtectedError, Q
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.filters import EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter
from core.pagination import EntityOffsetPagination
from finance.models import (
    Account,
    Asset,
    Balance,
    BalanceSheet,
    Currency,
    ExchangeRate,
    Portfolio,
    Transaction,
)
from finance.serializers import (
    AccountSerializer,
    AssetSerializer,
    BalanceSerializer,
    BalanceSheetSerializer,
    BalanceUpsertSerializer,
    CurrencySerializer,
    ExchangeRateSerializer,
    PortfolioCreateSerializer,
    PortfolioUpdateSerializer,
    TransactionSerializer,
)


class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    filterable_fields = {
        "name": {"lookup": "icontains", "type": "text"},
        "category": {"lookup": "icontains", "type": "text"},
    }
    ordering_fields = ["name", "category", "created_at"]
    ordering = ["name"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete asset: it is referenced by existing transfers."},
                status=status.HTTP_409_CONFLICT,
            )


class PortfolioViewSet(viewsets.ModelViewSet):
    queryset = Portfolio.objects.all()
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    filterable_fields = {
        "name": {"lookup": "icontains", "type": "text"},
        "state": {"lookup": "exact", "type": "single_select"},
        "base_currency": {"lookup": "exact", "type": "single_select"},
    }
    ordering_fields = [
        "name",
        "state",
        "base_currency",
        "last_transaction_time",
        "first_transaction_time",
        "created_at",
    ]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action in ("create",):
            return PortfolioCreateSerializer
        return PortfolioUpdateSerializer

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete portfolio: it has associated transactions."},
                status=status.HTTP_409_CONFLICT,
            )


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = (
        Transaction.objects.select_related("portfolio").prefetch_related("transfers__asset").all()
    )
    serializer_class = TransactionSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    filterable_fields = {
        "portfolio": {"lookup": "exact", "type": "single_select"},
        "description": {"lookup": "icontains", "type": "text"},
        "timestamp": {"lookup": "date", "type": "date"},
    }
    ordering_fields = ["timestamp", "created_at"]
    ordering = ["-timestamp"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


class CurrencyViewSet(viewsets.ModelViewSet):
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer
    filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
    filterable_fields = {
        "code": {"lookup": "code", "type": "text"},
        "name": {"lookup": "name", "type": "text"},
        "symbol": {"lookup": "symbol", "type": "text"},
        "is_base_currency": {"lookup": "is_base_currency", "type": "boolean"},
    }
    # Quick search (019): booleans excluded — "true"/"false" text is noise (R3).
    searchable_fields = {
        "code": "text",
        "name": "text",
        "symbol": "text",
    }
    ordering_fields = ["code", "name", "symbol", "is_base_currency"]
    ordering = ["code"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
    filterable_fields = {
        "name": {"lookup": "name", "type": "text"},
        "currency": {"lookup": "currency", "type": "single_select"},
        "color": {"lookup": "color", "type": "text"},
        "open_datetime": {"lookup": "open_datetime", "type": "date"},
        "close_datetime": {"lookup": "close_datetime", "type": "date"},
    }
    searchable_fields = {
        "name": "text",
        "currency": "text",
        "color": "text",
        "open_datetime": "cast",
        "close_datetime": "cast",
    }
    ordering_fields = ["name", "currency", "color", "open_datetime", "close_datetime"]
    ordering = ["name"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        """Filter accounts by open/close datetime when `as_of` param is provided."""
        qs = super().get_queryset()
        as_of = self.request.query_params.get("as_of")
        if as_of:
            dt = parse_datetime(as_of)
            if dt:
                qs = qs.filter(Q(open_datetime__isnull=True) | Q(open_datetime__lte=dt)).filter(
                    Q(close_datetime__isnull=True) | Q(close_datetime__gte=dt)
                )
        return qs

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if request.query_params.get("confirm") != "true":
            count = Balance.objects.filter(account=account).count()
            if count > 0:
                return Response(
                    {
                        "affected_balance_count": count,
                        "message": f"Deleting this account will remove {count} balance record(s). Add ?confirm=true to proceed.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        account.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BalanceSheetViewSet(viewsets.ModelViewSet):
    queryset = BalanceSheet.objects.all()
    serializer_class = BalanceSheetSerializer
    filter_backends = [EntityFilterBackend, NullsOrderingFilter]
    filterable_fields = {
        "date": {"lookup": "date", "type": "date"},
    }
    ordering_fields = ["date"]
    ordering = ["-date"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    @action(detail=True, methods=["get"], url_path="balances")
    def list_balances(self, request, pk=None):
        sheet = self.get_object()
        balances = Balance.objects.filter(balance_sheet=sheet).select_related("account")
        serializer = BalanceSerializer(balances, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["put"], url_path=r"balances/(?P<account_id>[A-Za-z0-9]{12})")
    def upsert_balance(self, request, pk=None, account_id=None):
        sheet = self.get_object()
        try:
            account = Account.objects.get(pk=account_id)
        except Account.DoesNotExist:
            return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = BalanceUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        balance, _ = Balance.objects.update_or_create(
            account=account,
            balance_sheet=sheet,
            defaults={"amount": serializer.validated_data["amount"]},
        )
        return Response(BalanceSerializer(balance).data)

    @action(
        detail=True, methods=["delete"], url_path=r"balances/(?P<account_id>[A-Za-z0-9]{12})/delete"
    )
    def delete_balance(self, request, pk=None, account_id=None):
        sheet = self.get_object()
        try:
            balance = Balance.objects.get(balance_sheet=sheet, account_id=account_id)
        except Balance.DoesNotExist:
            return Response({"detail": "Balance not found."}, status=status.HTTP_404_NOT_FOUND)
        balance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="net-worth")
    def net_worth(self, request, pk=None):
        sheet = self.get_object()
        balances = Balance.objects.filter(balance_sheet=sheet).select_related("account")

        # Group by currency — all balances contribute directly to net worth
        currency_totals: dict[str, Decimal] = {}
        for balance in balances:
            currency = balance.account.currency
            currency_totals[currency] = currency_totals.get(currency, Decimal("0")) + balance.amount

        per_currency = [
            {"currency": currency, "net_worth": str(total.quantize(Decimal("0.0000")))}
            for currency, total in currency_totals.items()
        ]

        return Response(
            {
                "balance_sheet_id": sheet.id,
                "date": str(sheet.date),
                "per_currency": per_currency,
            }
        )


class ExchangeRateViewSet(viewsets.ModelViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
    filterable_fields = {
        "base_currency": {"lookup": "base_currency", "type": "single_select"},
        "quote_currency": {"lookup": "quote_currency", "type": "single_select"},
        "rate": {"lookup": "rate", "type": "number"},
        "date": {"lookup": "date", "type": "date"},
    }
    # The entity has NO text columns — rate/date match via their text form (R3).
    searchable_fields = {
        "base_currency": "text",
        "quote_currency": "text",
        "rate": "cast",
        "date": "cast",
    }
    ordering_fields = ["date", "base_currency", "quote_currency", "rate"]
    ordering = ["-date"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        """Filter by base_currency and quote_currency legacy query params."""
        qs = super().get_queryset()
        base = self.request.query_params.get("base_currency")
        quote = self.request.query_params.get("quote_currency")
        if base:
            qs = qs.filter(base_currency=base.upper())
        if quote:
            qs = qs.filter(quote_currency=quote.upper())
        return qs
