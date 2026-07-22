# Data Model — Inventory App Enhancements (018)

**Date**: 2026-07-22 | **Plan**: [plan.md](plan.md)

Only one schema change. US2 (length default) and US3 (pin defaults) are
constant/seed changes with no stored data.

## CostFactor (changed)

Existing model (`apps/unihub/backend/inventory/models.py`) — one signed
payment line of an Acquisition; `type="accumulated"` rows are the per-currency
Σ(item sku_price × quantity) seeds, unique per `(acquisition, currency)`.

### New field

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `user_managed` | `BooleanField` | `False` | Only consulted on `type="accumulated"` rows. `False` = auto-managed: the value is system-derived and may be recalculated/replaced by derivation flows. `True` = user-managed: the user manually set this amount (any manual edit, including clearing to zero); no automatic process may change value, and the edit form must not re-derive it. Manual (non-accumulated) factors keep `False`; the flag is ignored for them. |

- Migration: `0020_costfactor_user_managed` — additive, `default=False`, no
  backfill logic (every existing row, including imported ones, stays
  auto-managed; matches the spec's importer edge case).
- Constraints/ordering unchanged (`uniq_accumulated_per_currency`,
  `ordering = ["display_order", "created_at"]`).
- **data_io**: descriptor uses `auto_system_fields(CostFactor, …)` — the new
  field is picked up automatically; covered by a test assertion, no manual
  descriptor edit.

### Serializer

`CostFactorSerializer.fields += ["user_managed"]` (writable, optional,
default `False`). `AcquisitionSerializer` nested read/write paths carry it
through `_write_factors` and `_derive_accumulated` (derived rows always
`user_managed=False`).

## State transitions (accumulated line)

```
                      user edits amount (incl. clear→0)
   ┌────────────────┐ ───────────────────────────────────► ┌────────────────┐
   │  auto-managed   │                                      │  user-managed  │
   │ user_managed=F  │ ◄─────────────────────────────────── │ user_managed=T │
   └────────────────┘        per-line Reset control         └────────────────┘
     value = derived Σ, tracks item                value frozen at user's amount;
     price/quantity/currency edits live;           survives save/reload/any edit;
     dropped when its currency loses               kept even when its currency has
     all priced items                              no priced items
```

Transitions happen ONLY in the acquisition form (user action). Server-side
derivation creates auto-managed rows exclusively and only when the create
payload contains no accumulated factor (contract delta — see
[contracts/acquisitions-api-delta.md](contracts/acquisitions-api-delta.md)).

## Frontend editor state (`FactorRow`, not persisted)

`FactorRow` (AcquisitionForm) gains `userManaged: boolean`, initialized from
`cost_factors[].user_managed` (edit) or `false` (new derived rows). The
reconcile effect keys off it (D3): auto rows re-derive on every `cards`
change; user rows are never touched; user rows survive currency
disappearance; new currencies always enter as auto rows.

## Unchanged entities

- **Item / Acquisition / Scenario**: no changes.
- **AttributeDefinition / AttributeValue**: no changes (US2 touches only the
  frontend default-unit constant; canonical mm storage stays).
- **Catalog column configuration**: in-memory ColumnDef seed only
  (`acquisition_summary.pin = 'left'`, key `inventory-catalog-v8`); nothing
  persisted.
