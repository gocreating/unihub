from django.urls import path, include
from rest_framework.routers import DefaultRouter

from finance.views import AccountViewSet, BalanceSheetViewSet, CurrencyViewSet, ExchangeRateViewSet

router = DefaultRouter()
router.register("currencies", CurrencyViewSet, basename="currency")
router.register("accounts", AccountViewSet, basename="account")
router.register("balance-sheets", BalanceSheetViewSet, basename="balancesheet")
router.register("exchange-rates", ExchangeRateViewSet, basename="exchangerate")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "balance-sheets/<str:pk>/balances/",
        BalanceSheetViewSet.as_view({"get": "list_balances"}),
        name="balancesheet-balances-list",
    ),
    path(
        "balance-sheets/<str:pk>/balances/<str:account_id>/",
        BalanceSheetViewSet.as_view({"put": "upsert_balance"}),
        name="balancesheet-balance-upsert",
    ),
    path(
        "balance-sheets/<str:pk>/balances/<str:account_id>/delete/",
        BalanceSheetViewSet.as_view({"delete": "delete_balance"}),
        name="balancesheet-balance-delete",
    ),
    path(
        "balance-sheets/<str:pk>/net-worth/",
        BalanceSheetViewSet.as_view({"get": "net_worth"}),
        name="balancesheet-net-worth",
    ),
]
