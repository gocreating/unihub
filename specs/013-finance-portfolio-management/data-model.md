# Data Model: Finance Portfolio Management

**Phase 1 output** | Branch: `013-finance-portfolio-management`

---

## Entity Relationship

```
Asset ─────────────────────────────────────────────┐
                                                    │
Portfolio ──── Transaction (1:N) ──── Transfer (1:N)┤
               portfolio FK (PROTECT)   asset FK (PROTECT)
               state: active|closed
               first_transaction_time (derived)
               last_transaction_time (derived)
```

- One Portfolio → many Transactions
- One Transaction → many Transfers (minimum 1)
- One Asset → many Transfers (asset referenced; deletion blocked if transfers exist)
- `Transaction.portfolio` is `PROTECT` (portfolio cannot be deleted while it has transactions)
- `Transfer.asset` is `PROTECT` (asset cannot be deleted while referenced by transfers)
- `Transfer.transaction` is `CASCADE` (deleting a transaction deletes all its transfers)

---

## Model Definitions

### Asset

```python
class Asset(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
```

**Validation**: `name` required. `category` is free-form text.

---

### Portfolio

```python
PORTFOLIO_STATE_ACTIVE = 'active'
PORTFOLIO_STATE_CLOSED = 'closed'
PORTFOLIO_STATE_CHOICES = [
    (PORTFOLIO_STATE_ACTIVE, 'Active'),
    (PORTFOLIO_STATE_CLOSED, 'Closed'),
]

class Portfolio(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id)
    name = models.CharField(max_length=255)
    base_currency = models.CharField(max_length=10)  # ISO 4217 code; immutable after creation
    state = models.CharField(
        max_length=20, choices=PORTFOLIO_STATE_CHOICES, default=PORTFOLIO_STATE_ACTIVE
    )
    first_transaction_time = models.DateTimeField(null=True, blank=True)  # derived; read-only
    last_transaction_time = models.DateTimeField(null=True, blank=True)   # derived; read-only
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = [F('last_transaction_time').desc(nulls_last=True), '-created_at']

    def refresh_transaction_times(self) -> None:
        """Recalculate first/last_transaction_time from current transactions."""
        from django.db.models import Min, Max
        result = self.transactions.aggregate(
            first=Min('timestamp'), last=Max('timestamp')
        )
        Portfolio.objects.filter(pk=self.pk).update(
            first_transaction_time=result['first'],
            last_transaction_time=result['last'],
        )
```

**Validation**:
- `name` required.
- `base_currency` validated against `Currency.code` on create; immutable (rejected on update).
- `state` toggleable between `active` and `closed` at any time.
- `first_transaction_time` and `last_transaction_time` are never set directly by API callers.

**Signal** (`post_save` and `post_delete` on Transaction):
```python
@receiver(post_save, sender=Transaction)
@receiver(post_delete, sender=Transaction)
def update_portfolio_times(sender, instance, **kwargs):
    instance.portfolio.refresh_transaction_times()
```

---

### Transaction

```python
class Transaction(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id)
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.PROTECT, related_name='transactions'
    )
    timestamp = models.DateTimeField()
    description = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-timestamp']
```

**Validation**:
- `portfolio` required; portfolio must be `state == 'active'` at create time.
- `timestamp` required.
- Must contain at least one Transfer (enforced in serializer `validate()`).
- `portfolio` is not updatable after creation (immutable FK).

---

### Transfer

```python
class Transfer(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id)
    transaction = models.ForeignKey(
        Transaction, on_delete=models.CASCADE, related_name='transfers'
    )
    asset = models.ForeignKey(
        Asset, on_delete=models.PROTECT, related_name='transfers'
    )
    asset_change_amount = models.DecimalField(max_digits=28, decimal_places=8)
    value_change = models.DecimalField(
        max_digits=28, decimal_places=8, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
```

**Validation**:
- `asset` required; `asset_change_amount` required (non-zero recommended but not enforced).
- `value_change` optional — null means pure position change; non-null means cost/expense/income.
- `asset_change_amount` positive = inflow (asset acquired); negative = outflow (asset disposed).
- `value_change` positive = value gain; negative = value loss (e.g., cost paid is negative).

---

## Serializer Summary

| Serializer | Create fields | Update fields | Read-only |
|---|---|---|---|
| `AssetSerializer` | `name`, `category` | `name`, `category` | `id`, `created_at`, `updated_at` |
| `PortfolioCreateSerializer` | `name`, `base_currency`, `state` | — | `id`, `first/last_transaction_time`, `created_at`, `updated_at` |
| `PortfolioUpdateSerializer` | — | `name`, `state` | `id`, `base_currency`, `first/last_transaction_time`, `created_at`, `updated_at` |
| `TransferSerializer` | `asset`, `asset_change_amount`, `value_change` | same | `id`, `created_at`, `updated_at` |
| `TransactionSerializer` | `portfolio`, `timestamp`, `description`, `transfers[]` | `timestamp`, `description`, `transfers[]` | `id`, `created_at`, `updated_at`; `portfolio` immutable after create |

`TransactionSerializer.create()` and `update()` are both wrapped in `transaction.atomic()`.  
On `update()`, existing transfers are deleted and replaced by the payload list (full-replace).

---

## Filterable Fields

### AssetViewSet
```python
filterable_fields = {
    'name': {'lookup': 'icontains', 'type': 'text'},
    'category': {'lookup': 'icontains', 'type': 'text'},
}
ordering_fields = ['name', 'category', 'created_at']
```

### PortfolioViewSet
```python
filterable_fields = {
    'name': {'lookup': 'icontains', 'type': 'text'},
    'state': {'lookup': 'exact', 'type': 'single_select'},
    'base_currency': {'lookup': 'exact', 'type': 'single_select'},
}
ordering_fields = ['name', 'state', 'base_currency', 'last_transaction_time', 'first_transaction_time', 'created_at']
```

### TransactionViewSet
```python
filterable_fields = {
    'portfolio': {'lookup': 'exact', 'type': 'single_select'},
    'description': {'lookup': 'icontains', 'type': 'text'},
    'timestamp': {'lookup': 'date', 'type': 'date'},
}
ordering_fields = ['timestamp', 'created_at']
```

---

## Migration Notes

Single migration creates all four tables in dependency order:
1. `finance_asset`
2. `finance_portfolio`
3. `finance_transaction` (FK to `finance_portfolio`)
4. `finance_transfer` (FK to `finance_transaction`, `finance_asset`)

No data migration in this phase (Story 4 deferred).
