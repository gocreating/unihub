# Data Model: Fix Finance Data Sync

**Phase**: 1 | **Date**: 2026-06-01 | **Feature**: 009-fix-finance-sync

## Database Changes

**None.** This feature adds no new tables or migrations. All changes are to the sync layer's field registration logic.

---

## New Utility: `auto_system_fields()` in `data_io/registry.py`

### Signature

```python
def auto_system_fields(
    model_class: type,
    exclude: set[str] | None = None,
    fk_overrides: dict[str, dict] | None = None,
) -> list[FieldDescriptor]:
    """Generate FieldDescriptors from model._meta.concrete_fields.

    Args:
        model_class: The Django model class to introspect.
        exclude: Field attnames to skip (e.g. {'created_at'} if timestamps not wanted).
        fk_overrides: Maps FK field attname → FieldDescriptor kwarg overrides.
            Required for FK fields that need fk_content_type_label:
                {'account_id': {'fk_content_type_label': 'finance.account'}}
    Returns:
        List of FieldDescriptor objects, one per concrete model field.
    """
```

### Helper

```python
def _field_to_data_type(field: django.db.models.Field) -> str:
    """Map a Django field instance to a data_io data_type string."""
```

### Behavior

- Iterates `model_class._meta.concrete_fields` (all DB-stored fields; excludes M2M, reverse FK)
- For each field:
  - Uses `field.attname` as `column_name` (e.g., `account_id` for a FK to Account)
  - Maps field class to `data_type` via `_field_to_data_type()`
  - Sets `csv_header = f"{attname}:{data_type}"`
  - Sets `is_pk = field.primary_key`
  - Sets `is_fk = field.is_relation and hasattr(field, 'column')` (concrete FK, not reverse)
  - Sets `nullable = field.null or field.blank`
  - Merges any `fk_overrides[attname]` kwargs

### Field Type Mapping

| Django Field | `data_type` string |
|---|---|
| `BooleanField`, `NullBooleanField` | `"boolean"` |
| `DateTimeField`, `DateField` | `"datetime"` |
| `DecimalField` | `"decimal"` |
| `FloatField` | `"float"` |
| `IntegerField` and subclasses | `"integer"` |
| `JSONField` | `"json"` (also sets `is_json=True`) |
| `ForeignKey`, `OneToOneField` | `"string"` |
| `CharField` with `max_length <= 50` | `"string"` |
| `CharField` with `max_length > 50` or `TextField` | `"text"` |

---

## Updated Registration in `finance/apps.py`

### Before (manual — bug-prone)

```python
system_fields=[
    FieldDescriptor(column_name="code", csv_header="code:string", data_type="string", is_pk=True),
    FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
    FieldDescriptor(column_name="symbol", csv_header="symbol:text", data_type="text", nullable=True),
    # is_base_currency: MISSING ← bug
]
```

### After (auto-discovered — future-proof)

```python
system_fields=auto_system_fields(Currency)
# Generates: code(pk), name, symbol, is_base_currency — all fields, automatically
```

### Complete Updated Field Sets

All field sets below are what `auto_system_fields()` will generate for each Finance model:

**finance.currency** (4 fields after fix):
| column_name | data_type | is_pk | nullable |
|---|---|---|---|
| code | string | ✓ | |
| name | text | | |
| symbol | text | | ✓ |
| is_base_currency | boolean | | |

**finance.account** (8 fields after fix):
| column_name | data_type | is_pk | nullable | notes |
|---|---|---|---|---|
| id | string | ✓ | | |
| name | text | | | |
| currency | string | | | (CharField, not FK) |
| color | string | | ✓ | NEW |
| open_datetime | datetime | | ✓ | |
| close_datetime | datetime | | ✓ | |
| created_at | datetime | | | NEW; auto_now_add |
| updated_at | datetime | | | NEW; auto_now |

**finance.balancesheet** (4 fields after fix):
| column_name | data_type | is_pk | nullable | notes |
|---|---|---|---|---|
| id | string | ✓ | | |
| date | datetime | | | |
| created_at | datetime | | | NEW; auto_now_add |
| updated_at | datetime | | | NEW; auto_now |

**finance.exchangerate** (5 fields — no change):
All fields already registered; `ExchangeRate` has no timestamp fields.

**finance.balance** (4 fields — no change; FK overrides still required):
| column_name | data_type | is_pk | fk_content_type_label |
|---|---|---|---|
| id | string | ✓ | |
| account_id | string | | finance.account |
| balance_sheet_id | string | | finance.balancesheet |
| amount | decimal | | |

For Balance, `auto_system_fields()` call includes explicit FK overrides:
```python
auto_system_fields(
    Balance,
    fk_overrides={
        'account_id': {'is_fk': True, 'fk_content_type_label': 'finance.account'},
        'balance_sheet_id': {'is_fk': True, 'fk_content_type_label': 'finance.balancesheet'},
    }
)
```

---

## Import Handling for Timestamp Fields

For `auto_now` and `auto_now_add` fields, the standard `model.save()` overwrites these values. To preserve originals during import, the importer must use a two-step approach:

1. `Model.objects.update_or_create(pk=pk, defaults={...non_timestamp_fields...})`
2. `Model.objects.filter(pk=pk).update(created_at=original_created_at, updated_at=original_updated_at)`

The `queryset.update()` call bypasses `auto_now` entirely. This is the same approach used by Django's `loaddata` for fixture loading.

**Backward compat**: When `created_at`/`updated_at` are absent in an old CSV import, skip step 2 (fields retain the value set by `save()` — the import timestamp). This is the safe default per FR-006.
