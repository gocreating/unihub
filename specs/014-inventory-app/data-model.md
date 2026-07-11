# Phase 1 Data Model: Inventory App — Iteration 4

**Feature**: 014-inventory-app | **Date**: 2026-07-11

Concrete Django models in `inventory`, updated for the post-`a7a0ea2` clarifications. nanoid 12-char PKs. Changes marked **(new)**, **(removed)**, **(changed)**.

Attribute types map to the constitution set: `text`, `long_text`, `number`, `date`, `boolean`, `single_select`.

---

## Entity: Acquisition

The batch-obtain record; the sole creation path for items. Owns items and cost factors.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `source` | CharField(200) blank | text | no | auto-complete over used values |
| `request_time` | DateTimeField null | date | no | when the order was initiated (create-form default = today 00:00) |
| `obtained_at` | DateTimeField null | date | no | when received (create-form default = today 00:00) |
| `remark` | TextField blank | long_text | no | |
| `created_at` / `updated_at` | DateTimeField | — | auto | |

**Removed (changed)**: `cost`, `cost_currency`, `discount`, `tax_refund` (→ CostFactor).

**Derived (serializer)**: `item_count`; **`net_cost`** = per-currency list `[{currency, total}]` summing this acquisition's cost-factor `value`s by currency (read-only).

**Relationships**: owns 1..N `Item` (CASCADE) and **1..N `CostFactor`** (CASCADE). Deleting an acquisition deletes both.

**Validation**: on create, **≥1 item** AND **≥1 cost factor** (an `accumulated` factor is auto-created).

**Meta**: `ordering = ["-obtained_at", "-created_at"]`.

---

## Entity: CostFactor **(new)**

A signed line of an acquisition's payment.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `acquisition` | FK→Acquisition, `CASCADE` | — | yes | related_name `cost_factors` |
| `value` | DecimalField(20,4) | number | yes | **signed** — negative reduces net cost |
| `currency` | CharField(3) blank | text | no | code string (finance API) |
| `type` | CharField(20) | single_select | yes (default `accumulated`) | accumulated \| shipping \| discount \| tax_refund \| paid_by_other \| other — **label only, does not set the sign** |
| `created_at` | DateTimeField auto_now_add | — | auto | |

**`accumulated` default**: on acquisition create, one factor with `type=accumulated`, `value` = Σ item `total_price`, `currency` = items' common currency. User-overridable/resettable.

**Meta**: `ordering = ["created_at"]`.

---

## Entity: Item

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `name` | CharField(200) | text | **yes** | non-blank |
| `quantity` | **IntegerField** default 1 | number | **yes** | **(changed)** integer, whole units |
| `spec` / `remark` | TextField blank | long_text | no | |
| `length_canonical`/`length_unit` … `weight_*` … `volume_*` | Decimal / CharField | number / single_select | no | canonical + unit (unchanged) |
| `size` | CharField(100) blank | text | no | |
| `sku_price` / `sku_price_currency` | Decimal / CharField(3) | number / text | no | per-unit price + currency |
| `color` / `url` | CharField | text | no | |
| `deprecate_time` | DateTimeField null | date | no | set ⇒ deprecated (status derived) |
| `acquisition` | FK→Acquisition, `CASCADE` | — | **yes** | required |
| `created_at` / `updated_at` | DateTimeField | — | auto | |

**Removed (changed)**: `item_type`.

**Derived (serializer, read-only)**: `total_price` = `sku_price × quantity`; `status` = deprecated if `deprecate_time` set else active; measurements as `{value, unit}`.

**Validation**: `name` non-blank; `quantity` integer ≥ 0 (default 1); numeric fields ≥ 0; units valid.

**Meta**: `ordering = ["-acquisition__obtained_at"]`.

---

## Entities: Scenario, ScenarioItem, Constraint

Unchanged **except**: `ScenarioItem` **loses the derived `shortfall`** (checklist no longer computes it); `required_quantity` remains. Constraint `weight_limit` still compares `weight_canonical`.

---

## Relationships (ER summary)

```text
Acquisition 1 ──< Item          (Item.acquisition REQUIRED, CASCADE; ≥1 item)
Acquisition 1 ──< CostFactor    (CASCADE; ≥1 factor; net_cost = per-currency Σ value)
Scenario    1 ──< ScenarioItem >── 1 Item
ScenarioItem 0..1 ──< ScenarioItem            (container self-FK, acyclic)
Scenario    1 ──< Constraint  *>──< Item      (M2M target set)
```

## Migrations

- **`0007_cost_factors`** (non-atomic):
  1. Create `CostFactor` table.
  2. Item: `RemoveField(item_type)`.
  3. **RunPython backfill** (before dropping the scalar cost columns): for each acquisition create an `accumulated` CostFactor (`value=cost`, `currency=cost_currency`) plus a `discount` factor (`value = −discount`) and a `tax_refund` factor (`value = −tax_refund`) when non-zero; if the acquisition had no cost at all, create an `accumulated` factor with `value=0`. Also round each `Item.quantity` to the nearest integer into a temp/int column.
  4. Acquisition: `RemoveField(cost, cost_currency, discount, tax_refund)`.
  5. Item: alter `quantity` → `IntegerField(default=1)` (after the round backfill).
  - Order: create CostFactor + add int-quantity staging → RunPython → drop scalar cost/item_type → finalize quantity type. `atomic = False` (Postgres backfill-then-ALTER).
- **`0008_reseed_system_attrs`**: Item drops `item_type`; Acquisition drops cost/cost_currency/discount/tax_refund; seed a **CostFactor** content-type's system attrs (value, currency, type). Reversible.

## Backend filter/order opt-in (updated)

- **Item**: drop `item_type` from filter/order; keep name/spec/size/measures/sku_price/deprecate_time/`acquisition__obtained_at` (default sort).
- **Acquisition**: source, request_time, obtained_at (cost filter drops — cost is now per-factor).
