# Developer Quickstart: Sync Field Coverage

**Feature**: 009-fix-finance-sync | **Date**: 2026-06-01

After this fix, any new field added to a Finance model is automatically included in sync.
This guide explains the new pattern and what you must do when adding fields.

---

## What changed

**Before**: Every field had to be manually listed in `finance/apps.py`. Adding a model field without updating `apps.py` silently broke the sync.

**After**: `auto_system_fields(ModelClass)` in `data_io/registry.py` reads all fields from the model automatically. New fields are included in the next sync without any manual action.

---

## Adding a new field to an existing model

1. Add the field to the model in `finance/models.py` and run `makemigrations`.
2. **Nothing else is required** for sync — `auto_system_fields()` picks it up automatically.
3. Run the field-coverage test to confirm:
   ```bash
   uv run pytest tests/test_sync_field_coverage.py -v
   ```

---

## Adding a new FK field

FK fields need one manual entry — the `fk_content_type_label` of the referenced table:

```python
# In finance/apps.py, update the relevant table's auto_system_fields call:
auto_system_fields(
    MyModel,
    fk_overrides={
        'my_fk_id': {
            'is_fk': True,
            'fk_content_type_label': 'finance.referenced_model',
        }
    }
)
```

Run the coverage test after adding the FK override.

---

## Registering a brand-new model for sync

Add a new `register(TableDescriptor(...))` call in `finance/apps.py`:

```python
from data_io.registry import auto_system_fields, FieldDescriptor, TableDescriptor, register

register(
    TableDescriptor(
        content_type_label="finance.mymodel",
        display_name="My Models",
        model_class=MyModel,
        system_fields=auto_system_fields(MyModel),  # all fields auto-included
        has_user_attributes=False,
        import_order=7,  # after all dependencies
    )
)
```

For models with FK fields, add `fk_overrides` (see above).

---

## Running the quality loop

```bash
cd apps/unihub/backend
uv run ruff format .
uv run ruff check . --fix
uv run pytest tests/test_sync_field_coverage.py tests/test_finance.py -v
```

---

## Checklist for sync changes

- [ ] New field added to model? → `auto_system_fields()` handles it; run the test.
- [ ] New FK field? → Add `fk_overrides` entry; run the test.
- [ ] New model registered? → Add `register(TableDescriptor(..., system_fields=auto_system_fields(...)))`.
- [ ] All coverage tests pass: `uv run pytest tests/test_sync_field_coverage.py -v`.
- [ ] Push-and-pull round-trip tested with the new field populated.
