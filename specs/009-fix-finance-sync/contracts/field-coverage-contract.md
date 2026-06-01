# Contract: Sync Field Coverage

**Phase**: 1 | **Date**: 2026-06-01 | **Feature**: 009-fix-finance-sync

This contract defines the invariant that the test suite must enforce: every concrete model field of every registered table is present in that table's `system_fields` list.

---

## Invariant

For every `TableDescriptor` in the data_io registry:

```
set(fd.column_name for fd in table.system_fields)
== set(f.attname for f in table.model_class._meta.concrete_fields)
```

This invariant is checked by `test_sync_field_coverage.py` as a regression guard.

---

## Registered Finance Tables — Expected Field Coverage

After this fix, the following fields MUST be present in each table's `system_fields`:

### finance.currency
```
code, name, symbol, is_base_currency
```

### finance.account
```
id, name, currency, color, open_datetime, close_datetime, created_at, updated_at
```

### finance.balancesheet
```
id, date, created_at, updated_at
```

### finance.exchangerate
```
id, base_currency, quote_currency, rate, date
```

### finance.balance
```
id, account_id, balance_sheet_id, amount
```

---

## Sync CSV Export Format (per field)

Each column in an exported CSV file maps to one `FieldDescriptor` and uses the format:

```
CSV header row:  column_name:data_type   (e.g., "is_base_currency:boolean")
CSV data rows:   serialized value per data_type:
  boolean   →  "true" / "false"
  datetime  →  ISO 8601 string (e.g., "2026-01-15T10:30:00Z")
  decimal   →  string representation (e.g., "0.03076900")
  string    →  raw value
  text      →  raw value (may contain commas; properly CSV-quoted)
  integer   →  string integer
  json      →  JSON-encoded string
```

---

## Backward Compatibility Guarantee

An older CSV that omits a column which now exists in the model:
- The import MUST succeed (no error).
- The missing column receives a safe default (see data-model.md § Import Handling).
- All present columns are restored exactly.

A newer CSV that contains a column which does not exist in the current model:
- The import MUST ignore the unknown column silently.
- All known columns are restored exactly.

---

## Test Contract (from `test_sync_field_coverage.py`)

```python
@pytest.mark.django_db
def test_all_finance_model_fields_are_registered():
    """Every concrete field of every registered Finance model must appear
    in that table's system_fields. Catches future omissions automatically."""
    registry = get_registry()
    for label, descriptor in registry.items():
        if not label.startswith("finance."):
            continue
        model_attnames = {f.attname for f in descriptor.model_class._meta.concrete_fields}
        registered_names = {fd.column_name for fd in descriptor.system_fields}
        assert model_attnames == registered_names, (
            f"Table '{label}' is missing fields: {model_attnames - registered_names}. "
            f"Unexpected fields: {registered_names - model_attnames}."
        )
```
