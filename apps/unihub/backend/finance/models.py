from django.db import models
from django.db.models import F, Max, Min

from core.nanoid import generate_id


class Asset(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


PORTFOLIO_STATE_ACTIVE = "active"
PORTFOLIO_STATE_CLOSED = "closed"
PORTFOLIO_STATE_CHOICES = [
    (PORTFOLIO_STATE_ACTIVE, "Active"),
    (PORTFOLIO_STATE_CLOSED, "Closed"),
]


class Portfolio(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    name = models.CharField(max_length=255)
    base_currency = models.CharField(max_length=10)
    description = models.TextField(blank=True, default="")
    state = models.CharField(
        max_length=20, choices=PORTFOLIO_STATE_CHOICES, default=PORTFOLIO_STATE_ACTIVE
    )
    first_transaction_time = models.DateTimeField(null=True, blank=True)
    last_transaction_time = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # FR-047: most-recently-transacted first; among portfolios that have
        # never been transacted (all null, all tied) the active ones lead.
        ordering = [
            F("last_transaction_time").desc(nulls_last=True),
            "state",
            "-created_at",
        ]

    def __str__(self):
        return self.name

    def refresh_transaction_times(self) -> None:
        result = self.transactions.aggregate(first=Min("timestamp"), last=Max("timestamp"))
        Portfolio.objects.filter(pk=self.pk).update(
            first_transaction_time=result["first"],
            last_transaction_time=result["last"],
        )


class Transaction(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    portfolio = models.ForeignKey(Portfolio, on_delete=models.PROTECT, related_name="transactions")
    timestamp = models.DateTimeField()
    description = models.CharField(max_length=500, blank=True, default="")
    chain_id = models.CharField(max_length=32, blank=True, default="")
    tx_hash = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.portfolio} @ {self.timestamp}"


class Transfer(models.Model):
    """One leg of a transaction (FR-037).

    A transfer carries an optional PnL impact plus EXACTLY ONE of:
      * a **currency change** — cash moving in or out, or
      * an **asset change** — a position growing or shrinking.

    Cash and positions are distinguished structurally, not by the convention
    "value present, quantity absent". The earlier shape had no way to record
    cash at all except by creating Asset rows for 新台幣/美元, which conflated
    currencies with assets — the thing this model exists to keep apart.
    """

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name="transfers")

    # Optional PnL impact, denominated in the PORTFOLIO's base currency.
    # (38,18): legacy 18-decimals tokens carry wei-level values (FR-008c).
    pnl_change = models.DecimalField(max_digits=38, decimal_places=18, null=True, blank=True)

    # A cash leg …
    currency = models.ForeignKey(
        "Currency", on_delete=models.PROTECT, related_name="transfers", null=True, blank=True
    )
    currency_amount = models.DecimalField(max_digits=38, decimal_places=18, null=True, blank=True)

    # … or a position leg.
    asset = models.ForeignKey(
        Asset, on_delete=models.PROTECT, related_name="transfers", null=True, blank=True
    )
    asset_change_amount = models.DecimalField(
        max_digits=38, decimal_places=18, null=True, blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            # Exactly one leg kind — enforced in the database so no code path,
            # import or shell session can create an ambiguous transfer.
            models.CheckConstraint(
                condition=(
                    models.Q(currency__isnull=False, asset__isnull=True)
                    | models.Q(currency__isnull=True, asset__isnull=False)
                ),
                name="transfer_exactly_one_of_currency_or_asset",
            ),
        ]

    def __str__(self):
        if self.currency_id:
            return f"{self.currency_id} {self.currency_amount}"
        return f"{self.asset} x{self.asset_change_amount}"


class Currency(models.Model):
    code = models.CharField(max_length=3, primary_key=True)
    name = models.CharField(max_length=100)
    symbol = models.CharField(max_length=10, blank=True)
    is_base_currency = models.BooleanField(default=False)

    class Meta:
        ordering = ["code"]
        verbose_name_plural = "currencies"

    def __str__(self):
        return f"{self.code} – {self.name}"


class Account(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    name = models.CharField(max_length=200)
    currency = models.CharField(max_length=3)
    color = models.CharField(
        max_length=25, blank=True, default=""
    )  # hex e.g. '#4caf50' (7) or css rgb() (up to 20)
    open_datetime = models.DateTimeField(null=True, blank=True)
    close_datetime = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class BalanceSheet(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    date = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return str(self.date)


class Balance(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="balances")
    balance_sheet = models.ForeignKey(
        BalanceSheet, on_delete=models.CASCADE, related_name="balances"
    )
    amount = models.DecimalField(max_digits=20, decimal_places=4)

    class Meta:
        unique_together = [("account", "balance_sheet")]

    def __str__(self):
        return f"{self.account} / {self.balance_sheet}: {self.amount}"


class ExchangeRate(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    base_currency = models.CharField(max_length=3)
    quote_currency = models.CharField(max_length=3)
    rate = models.DecimalField(max_digits=24, decimal_places=8)
    date = models.DateTimeField()

    class Meta:
        unique_together = [("base_currency", "quote_currency", "date")]
        ordering = ["-date"]

    def __str__(self):
        return f"{self.base_currency}/{self.quote_currency} {self.rate} ({self.date})"
