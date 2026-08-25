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

## Filterable & Searchable Fields *(corrected + extended, iteration 3)*

> **Contract note (root cause of the transactions 500)**: in the current
> `core.filters.EntityFilterBackend` (post-016/019), `lookup` is the **ORM field
> path** — the operator comes from each condition's `op` via `_OP_SUFFIX`. The
> iteration-1 declarations below previously put operator names (`icontains`,
> `exact`, `date`) in `lookup`, which built `Q(exact=…)` and raised
> `FieldError: Cannot resolve keyword 'exact' into field` as soon as the
> portfolio detail page filtered transactions by portfolio.

### AssetViewSet
```python
filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
filterable_fields = {
    'name': {'lookup': 'name', 'type': 'text'},
}
searchable_fields = {'name': 'text'}
ordering_fields = ['name', 'created_at']   # category removed
```

### PortfolioViewSet
```python
filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
filterable_fields = {
    'name': {'lookup': 'name', 'type': 'text'},
    'description': {'lookup': 'description', 'type': 'text'},
    'state': {'lookup': 'state', 'type': 'single_select'},
    'base_currency': {'lookup': 'base_currency', 'type': 'single_select'},
}
searchable_fields = {
    'name': 'text',
    'description': 'text',
    'base_currency': 'text',
    'state': 'text',
    'first_transaction_time': 'cast',
    'last_transaction_time': 'cast',
}
ordering_fields = ['name', 'state', 'base_currency', 'last_transaction_time', 'first_transaction_time', 'created_at']
```

### TransactionViewSet
```python
filter_backends = [EntityFilterBackend, EntitySearchFilter, NullsOrderingFilter]
filterable_fields = {
    'portfolio': {'lookup': 'portfolio', 'type': 'single_select'},
    'description': {'lookup': 'description', 'type': 'text'},
    'timestamp': {'lookup': 'timestamp', 'type': 'date'},
}
searchable_fields = {
    'description': 'text',
    'chain_id': 'text',
    'tx_hash': 'text',
    'timestamp': 'cast',
    'transfers__asset__name': 'text',   # search reaches assets inside expanded rows
    'transfers__remark': 'text',
}
ordering_fields = ['timestamp', 'created_at']
```

> Reverse-relation search legs (`transfers__…`) produce row duplication under
> `filter()` on multi-valued joins — the queryset needs `.distinct()` when the
> search param is active, or the legs are dropped if `distinct()` conflicts
> with the pagination/count machinery. Verify in TDD; if problematic, restrict
> transaction search to its own columns.

---

## Iteration 3 Model Amendments (migration 0012)

| Model | Change | Definition |
|---|---|---|
| `Asset` | **remove** `category` | column dropped; serializer/filterable/ordering/frontend updated |
| `Portfolio` | **add** `description` | `CharField(max_length=500, blank=True, default="")` — editable on create/update, shown on the "Portfolio" panel |
| `Transaction` | **add** `chain_id` | `CharField(max_length=32, blank=True, default="")` — optional blockchain metadata |
| `Transaction` | **add** `tx_hash` | `CharField(max_length=128, blank=True, default="")` — optional blockchain metadata |
| `Transfer` | **add** `remark` | `CharField(max_length=255, blank=True, default="")` — free-text note per transfer (e.g. 手續費) |
| `Transfer` | **widen** `asset_change_amount` | `DecimalField(max_digits=38, decimal_places=18)` — legacy 18-decimals tokens; widening is data-safe |
| `Transfer` | **widen** `value_change` | `DecimalField(max_digits=38, decimal_places=18, null=True, blank=True)` |

Serializer mirrors: `TransferSerializer` decimal fields become `max_digits=38, decimal_places=18`; new fields join the respective `fields` lists (`description` writable on both portfolio serializers; `chain_id`/`tx_hash` writable on `TransactionSerializer`; `remark` writable on `TransferSerializer`). Precision data-check: converted legacy values need at most 7 integer digits + 18 fraction digits; (38,18) leaves 20 integer digits.

---

## Legacy Import Mapping (management command `import_legacy_finance`)

| Legacy CSV | Column | unihub target |
|---|---|---|
| `finance_asset.csv` | `reference` | `Asset.id` (primary key, verbatim) |
| | `name` | `Asset.name` |
| | `symbol`, `decimals`, `is_settleable` | **not stored** — `symbol` unused; `decimals` drives amount conversion; `is_settleable` marks Currency candidates |
| | `created_time`/`updated_time` | `Asset.created_at`/`updated_at` (post-insert `update()`) |
| `finance_portfolio.csv` | `reference` | `Portfolio.id` |
| | `name` | `Portfolio.name` **verbatim** (incl. "[Active] " prefix); prefix presence → `state="active"`, else `"closed"` |
| | `settlement_asset_reference` | `Portfolio.base_currency` = that legacy asset's `symbol` (TWD/USD); Currency row ensured (created only if missing) |
| | `description` | `Portfolio.description` |
| `finance_transaction.csv` | `reference` | `Transaction.id` |
| | `portfolio_reference` | `Transaction.portfolio_id` |
| | `transacted_time` | `Transaction.timestamp` |
| | `chain_id`, `tx_hash`, `remark` | `chain_id`, `tx_hash`, `description` |
| `finance_transfer.csv` | `reference` | `Transfer.id` |
| | `transaction_reference` | `Transfer.transaction_id` |
| | `asset_reference` | `Transfer.asset_id` |
| | `asset_amount_change` | `Transfer.asset_change_amount` = `Decimal(raw) / 10**asset.decimals` |
| | `flow_type` + `settlement_asset_amount_change` | `UPDATE_POSITION` → `value_change=None`; else `value_change` = `Decimal(raw) / 10**settlement_asset.decimals` (portfolio's settlement asset). `flow_type` itself not stored |
| | `remark` | `Transfer.remark` |

**Invariants** (verified against the real CSVs 2026-08-13): zero orphan references; every transaction has ≥1 transfer; settlement amount `0` ⟺ `UPDATE_POSITION`. The command still validates all of these and aborts (atomic) on violation. Idempotency: a row whose primary key already exists is **skipped, never updated**. Import bypasses serializer-level rules (`≥1 transfer`, closed-portfolio block) by writing through the ORM directly — historical data must land verbatim. After inserts, `refresh_transaction_times()` runs once per imported portfolio.

---

## Migration Notes

- Iteration 1 shipped migration `0011_add_asset_portfolio_transaction_transfer` (four tables).
- Iteration 3 adds migration `0012` (auto-generated): drop `asset.category`; add `portfolio.description`, `transaction.chain_id`, `transaction.tx_hash`, `transfer.remark`; alter the two Transfer decimal columns to `numeric(38,18)`. All operations are non-destructive except the `category` drop (approved 2026-08-13).
- The legacy **data** import is NOT a Django migration — it is an operator-run management command (FR-012a); CSVs live outside version control.
- **Iteration 9 (2026-08-25)**: no schema change and no `data_io` descriptor change. The frontend derives per-transaction running totals (PnL as one Decimal; Position per asset) and the chart series from the portfolio's complete transaction set fetched through the existing list endpoint; the Trend chart's "position" series is a DERIVED money value, `−(cost + income)` per transaction, and is not stored.
