# Data Model: UniHub Project Bootstrap

**Branch**: `001-project-bootstrap` | **Date**: 2026-05-17

---

## Shared Infrastructure (`core` app)

### AttributeDefinition

Defines a schema entry for a specific entity type within a domain.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | CharField(12, PK) | default=nanoid_generate, editable=False | 12-char alphanumeric NanoID (`A-Za-z0-9`) |
| `content_type` | FK → ContentType | NOT NULL, CASCADE | Identifies the model class this attr belongs to |
| `name` | CharField(200) | NOT NULL | Display name; unique per (content_type, name) |
| `data_type` | CharField(20) | NOT NULL, choices | `text`, `long_text`, `number`, `date`, `boolean`, `single_select` |
| `is_system` | BooleanField | default=False | True = shipped with domain, protected from user delete/rename |
| `display_order` | PositiveIntegerField | default=0 | Sort order in forms and table columns |
| `options` | JSONField | default=[] | Allowed values for `single_select` type |

**Constraints**:
- `UNIQUE (content_type, name)`
- `is_system=True` records cannot be deleted or renamed via the API

**Ordering**: `display_order ASC, name ASC`

---

### AttributeValue

Stores the per-entity value for a user-defined attribute.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | CharField(12, PK) | default=nanoid_generate, editable=False | 12-char alphanumeric NanoID (`A-Za-z0-9`) |
| `attribute_definition` | FK → AttributeDefinition | NOT NULL, CASCADE | |
| `content_type` | FK → ContentType | NOT NULL, CASCADE | Entity's model class |
| `object_id` | CharField(12) | NOT NULL | Entity's string PK (matches NanoID PK of the referenced entity) |
| `entity` | GenericForeignKey | — | Accessor; not a DB column |
| `value` | TextField | blank=True | Stored as string; interpreted by `data_type` at API layer |

**Constraints**:
- `UNIQUE (attribute_definition, content_type, object_id)`
- Index on `(content_type, object_id)` for fast per-entity lookup

**Note**: System attributes (IS_SYSTEM=True) have typed fields on the entity model;
AttributeValue records are not created for them. Only user-defined attributes
(is_system=False) generate AttributeValue rows.

**NanoID note**: `object_id` is `CharField(12)` (not `PositiveIntegerField`) because all
entity PKs are 12-character NanoID strings. The `UNIQUE(attribute_definition, content_type, object_id)`
constraint and the `(content_type, object_id)` index use string comparison.

---

## Numeric Precision Rule (Finance-wide)

All numeric fields in the Finance domain use **exact fixed-precision decimal** storage and transport:

- **Backend**: `DecimalField` (never `FloatField`). Precision per field is defined below.
- **API wire format**: All decimal values serialized as **JSON strings** (e.g., `"amount": "52340.0000"`), never as JSON numbers. DRF serializers use `DecimalField` with `coerce_to_string=True` (the default).
- **Frontend**: All Finance arithmetic uses a Decimal library (`decimal.js` or equivalent). Native JavaScript `number` arithmetic on Finance values is prohibited.

---

## Finance Domain (`finance` app)

### Account

A financial account owned by the user.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | CharField(12, PK) | default=nanoid_generate, editable=False | 12-char alphanumeric NanoID (`A-Za-z0-9`) |
| `name` | CharField(200) | NOT NULL | Account display name |
| `account_type` | CharField(20) | NOT NULL, choices | `asset`, `liability`, `equity` |
| `currency` | CharField(3) | NOT NULL | ISO 4217 code (e.g., `USD`, `TWD`) |
| `created_at` | DateTimeField | auto_now_add | |
| `updated_at` | DateTimeField | auto_now | |

**Seeded AttributeDefinitions** (`is_system=True`):
- `name` / text / display_order=0
- `account_type` / single_select / options=[asset, liability, equity] / display_order=1
- `currency` / text / display_order=2

**Ordering**: `name ASC`

**Business rules**:
- `currency` is set at creation and MAY be changed; existing Balance records
  are reinterpreted as the new currency after a change.
- Deleting an Account with existing Balances prompts a cascade-delete warning.

---

### BalanceSheet

A dated financial snapshot.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | CharField(12, PK) | default=nanoid_generate, editable=False | 12-char alphanumeric NanoID (`A-Za-z0-9`) |
| `date` | DateField | NOT NULL | Snapshot date |
| `label` | CharField(200) | blank=True | Optional human-readable name |
| `base_currency` | CharField(3) | NOT NULL | ISO 4217; used for net worth total |
| `created_at` | DateTimeField | auto_now_add | |
| `updated_at` | DateTimeField | auto_now | |

**Seeded AttributeDefinitions** (`is_system=True`):
- `date` / date / display_order=0
- `label` / text / display_order=1
- `base_currency` / text / display_order=2

**Ordering**: `date DESC`

---

### Balance

The recorded balance of one Account within one BalanceSheet.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | CharField(12, PK) | default=nanoid_generate, editable=False | 12-char alphanumeric NanoID (`A-Za-z0-9`) |
| `account` | FK → Account | NOT NULL, CASCADE | |
| `balance_sheet` | FK → BalanceSheet | NOT NULL, CASCADE | |
| `amount` | DecimalField(20, 4) | NOT NULL | In Account's currency. Serialized as string over API. |

**Constraints**:
- `UNIQUE (account, balance_sheet)`

**Notes**:
- Balance is a linking record; it does not participate in the
  AttributeDefinition/AttributeValue system (no custom attrs in v1).
- `amount` sign convention: assets and equity are positive; liabilities
  are positive values representing what is owed (net worth = assets − liabilities).

---

### ExchangeRate

A user-recorded currency conversion rate at a specific date.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | CharField(12, PK) | default=nanoid_generate, editable=False | 12-char alphanumeric NanoID (`A-Za-z0-9`) |
| `from_currency` | CharField(3) | NOT NULL | ISO 4217 |
| `to_currency` | CharField(3) | NOT NULL | ISO 4217 |
| `rate` | DecimalField(24, 8) | NOT NULL, > 0 | Units of to_currency per 1 from_currency. Serialized as string over API. |
| `date` | DateField | NOT NULL | Date this rate was recorded |

**Constraints**:
- `UNIQUE (from_currency, to_currency, date)`
- `rate > 0` (enforced at serializer level)
- Composite index on `(from_currency, to_currency, date)` (from unique constraint)

**Closest-prior-rate query**:
```python
ExchangeRate.objects.filter(
    from_currency=from_curr,
    to_currency=to_curr,
    date__lte=balance_sheet.date,
).order_by('-date').first()
```

---

## Net Worth Computation

Given a BalanceSheet with `base_currency = B`:

1. Fetch all Balances for this sheet, grouped by `account.currency`.
2. For each currency group:
   - `subtotal = SUM(amount) for assets − SUM(amount) for liabilities` (within group)
3. For each non-base currency group with currency `C`:
   - Lookup closest-prior rate for `(C → B)` on or before `balance_sheet.date`.
   - If found: `converted_subtotal = subtotal × rate`
   - If not found: flag currency `C` as missing-rate; exclude from total.
4. `total_net_worth = SUM(converted_subtotals for all covered currencies)`
5. Return: `{ per_currency: [...], total: {...}, missing_rates: [...] }`

---

## Entity Relationship Summary

```
AttributeDefinition ──── ContentType (identifies model class)
AttributeValue ────────── AttributeDefinition
AttributeValue ────────── ContentType + object_id (→ any entity)

Account ←────────────────── Balance ─────────────────→ BalanceSheet
                (amount in account.currency)          (base_currency)

ExchangeRate (from_currency, to_currency, rate, date)
  └── used at query time to convert subtotals to base_currency
```
