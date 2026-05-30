from django.db import models

from core.nanoid import generate_id


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
    color = models.CharField(max_length=25, blank=True, default="")  # hex e.g. '#4caf50' (7) or css rgb() (up to 20)
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
