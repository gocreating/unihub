from decimal import Decimal

from django.db.models import ProtectedError, Q, Sum
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.filters import EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter
from core.pagination import EntityOffsetPagination
from finance.models import (
    PORTFOLIO_STATE_ACTIVE,
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
    filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
    # `lookup` is the ORM field path — operators come from each condition's
    # `op` (the pre-016 operator-shaped declarations built Q(exact=...) → 500).
    filterable_fields = {
        "name": {"lookup": "name", "type": "text"},
    }
    searchable_fields = {"name": "text"}
    ordering_fields = ["name", "created_at"]
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
    # FR-031: value aggregates are computed HERE, over every transfer. The
    # transactions panel paginates at 25 rows and the largest portfolio has 49
    # transactions, so a client-side sum would silently report half the truth —
    # and a wrong PnL looks exactly like a right one.
    VALUE_PATH = "transactions__transfers__pnl_change"
    filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
    filterable_fields = {
        "name": {"lookup": "name", "type": "text"},
        "description": {"lookup": "description", "type": "text"},
        "state": {"lookup": "state", "type": "single_select"},
        "base_currency": {"lookup": "base_currency", "type": "single_select"},
    }
    searchable_fields = {
        "name": "text",
        "description": "text",
        "base_currency": "text",
        "state": "text",
        "first_transaction_time": "cast",
        "last_transaction_time": "cast",
    }
    ordering_fields = [
        "name",
        "state",
        "base_currency",
        "last_transaction_time",
        "first_transaction_time",
        "net_value_change",
        "created_at",
    ]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        # NULL (not 0) when a portfolio has no transfers — "no data" and "nets
        # to zero" are different facts and both reach the UI.
        return (
            super()
            .get_queryset()
            .annotate(
                value_invested=Sum(self.VALUE_PATH, filter=Q(**{f"{self.VALUE_PATH}__lt": 0})),
                value_returned=Sum(self.VALUE_PATH, filter=Q(**{f"{self.VALUE_PATH}__gt": 0})),
                net_value_change=Sum(self.VALUE_PATH),
            )
            # Re-assert the model's default order (FR-004c). Annotating adds a
            # GROUP BY, which drops Meta.ordering's nulls_last expression and
            # would float never-used portfolios to the top of the list.
            .order_by(*Portfolio._meta.ordering)
        )

    def get_serializer_class(self):
        if self.action in ("create",):
            return PortfolioCreateSerializer
        return PortfolioUpdateSerializer

    @staticmethod
    def _holdings_for(portfolio_ids):
        """FR-046: net quantity per asset for MANY portfolios in ONE query.

        The list page needs a Position cell per row. Calling the detail
        `holdings` action per row would be one query per portfolio — 55 on the
        real data — so the grouping carries the portfolio id and the result is
        bucketed in Python.
        """
        rows = (
            Transfer.objects.filter(
                transaction__portfolio_id__in=list(portfolio_ids), asset__isnull=False
            )
            .values("transaction__portfolio_id", "asset_id", "asset__name")
            .annotate(quantity=Sum("asset_change_amount"))
            .exclude(quantity=0)
            .order_by("asset__name")
        )
        buckets: dict[str, list[dict]] = {pid: [] for pid in portfolio_ids}
        for r in rows:
            buckets.setdefault(r["transaction__portfolio_id"], []).append(
                {
                    "asset_id": r["asset_id"],
                    "asset_name": r["asset__name"],
                    "quantity": str(r["quantity"]),
                }
            )
        return buckets

    def list(self, request, *args, **kwargs):
        """Attach the page's holdings before serializing (see `_holdings_for`)."""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        rows = page if page is not None else list(queryset)
        self.holdings_map = self._holdings_for([p.pk for p in rows])
        serializer = self.get_serializer(rows, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def holdings(self, request, pk=None):
        """FR-034: net quantity per asset across ALL of this portfolio's transfers.

        Assets whose net is exactly zero are omitted — a fully exited position
        is not a holding. Splits need no special handling: a position-only
        transfer (+N, no value change) simply moves the net (FR-035).
        """
        portfolio = self.get_object()
        rows = (
            Transfer.objects.filter(transaction__portfolio=portfolio, asset__isnull=False)
            .values("asset_id", "asset__name")
            .annotate(quantity=Sum("asset_change_amount"))
            .exclude(quantity=0)
            .order_by("asset__name")
        )
        return Response(
            [
                {
                    "asset_id": r["asset_id"],
                    "asset_name": r["asset__name"],
                    "quantity": str(r["quantity"]),
                }
                for r in rows
            ]
        )

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
    filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
    filterable_fields = {
        "portfolio": {"lookup": "portfolio", "type": "single_select"},
        "description": {"lookup": "description", "type": "text"},
        "timestamp": {"lookup": "timestamp", "type": "date"},
    }
    searchable_fields = {
        "description": "text",
        "chain_id": "text",
        "tx_hash": "text",
        "timestamp": "cast",
        "transfers__asset__name": "text",
        "transfers__currency__code": "text",
        "transfers__currency__name": "text",
    }
    ordering_fields = ["timestamp", "created_at"]
    ordering = ["-timestamp"]
    pagination_class = EntityOffsetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        # The transfers__* search legs join a multi-valued relation — a
        # transaction with several matching transfers would list once per
        # match without distinct().
        if (self.request.query_params.get("search") or "").strip():
            qs = qs.distinct()
        return qs

    def destroy(self, request, *args, **kwargs):
        """FR-026: deleting is a mutation too — a closed portfolio blocks it.

        The serializer guards create/update; DELETE never runs a serializer,
        so the same rule has to be stated here.
        """
        instance = self.get_object()
        if instance.portfolio.state != PORTFOLIO_STATE_ACTIVE:
            return Response(
                {
                    "portfolio": (
                        "This portfolio is closed. Reopen it before deleting its "
                        "transactions."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


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
