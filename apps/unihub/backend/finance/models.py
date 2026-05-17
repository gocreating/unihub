from django.db import models

from core.nanoid import generate_id


class Account(models.Model):
    ACCOUNT_TYPE_CHOICES = [
        ('asset', 'Asset'),
        ('liability', 'Liability'),
        ('equity', 'Equity'),
    ]

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES)
    currency = models.CharField(max_length=3)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class BalanceSheet(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    date = models.DateField()
    label = models.CharField(max_length=200, blank=True)
    base_currency = models.CharField(max_length=3)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return self.label or str(self.date)


class Balance(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='balances')
    balance_sheet = models.ForeignKey(BalanceSheet, on_delete=models.CASCADE, related_name='balances')
    amount = models.DecimalField(max_digits=20, decimal_places=4)

    class Meta:
        unique_together = [('account', 'balance_sheet')]

    def __str__(self):
        return f'{self.account} / {self.balance_sheet}: {self.amount}'


class ExchangeRate(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    from_currency = models.CharField(max_length=3)
    to_currency = models.CharField(max_length=3)
    rate = models.DecimalField(max_digits=24, decimal_places=8)
    date = models.DateField()

    class Meta:
        unique_together = [('from_currency', 'to_currency', 'date')]
        ordering = ['-date']

    def __str__(self):
        return f'{self.from_currency}/{self.to_currency} {self.rate} ({self.date})'
