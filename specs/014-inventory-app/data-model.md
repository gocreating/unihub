# Phase 1 Data Model: Inventory App (Refinement Iteration)

**Feature**: 014-inventory-app | **Date**: 2026-07-11

Concrete Django models in the `inventory` app, updated for the 2026-07-11 clarifications. nanoid 12-char PKs (via `core.nanoid.generate_id`). Changes from iteration 1 are marked **(new)**, **(removed)**, **(changed)**.

Attribute types map to the constitution's allowed set: `text`, `long_text`, `number`, `date`, `boolean`, `single_select`.

---

## Entity: Acquisition

The batch-obtain record and the **sole creation path** for items.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `source` | CharField(200) blank | text | no | store, seller, or person |
| `method` | CharField(20) blank | single_select | no | purchase \| gift \| transfer \| found \| other; blank ⇒ unknown/pre-existing |
| `obtained_at` | DateTimeField null | date | no | canonical "obtained" time (item-level `purchase_time` removed) |
| `remark` | TextField blank | long_text | no | **(changed)** renamed from `notes` |
| `created_at` | DateTimeField auto_now_add | — | auto | |
| `updated_at` | DateTimeField auto_now | — | auto | |

**Removed (changed)**: `arrived_at`, `cost` (lump-sum).

**Derived (serializer)**:
- `item_count` — number of items.
- `total_item_cost` — **(changed)** list of `{currency, total}` grouped by each item's `cost_currency` (no cross-currency sum).

**Relationships**: owns 1..N `Item` (composition). `Item.acquisition` FK `on_delete=CASCADE`. Deleting an acquisition deletes its items.

**Meta**: `ordering = ["-obtained_at", "-created_at"]`.

---

## Entity: Item

An individual owned/consumed thing. Belongs to exactly one Acquisition.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `name` | CharField(200) | text | **yes** | non-blank |
| `item_type` | CharField(20) | single_select | yes (default `stockable`) | stockable \| consumable |
| `model` | CharField(200) blank | text | no | |
| `serial_number` | CharField(200) blank | text | no | duplicates allowed (soft warning) |
| `spec` | TextField blank | long_text | no | **(new)** multi-line |
| `remark` | TextField blank | long_text | no | **(new)** multi-line |
| `quantity` | DecimalField(20,4) null | number | no | on-hand (consumables) |
| `length_canonical` | DecimalField(14,4) null | number | no | **(new)** stored in mm |
| `length_unit` | CharField(4) | single_select | no (default `mm`) | **(new)** mm/cm/m/in |
| `width_canonical` | DecimalField(14,4) null | number | no | **(new)** mm |
| `width_unit` | CharField(4) | single_select | no (default `mm`) | **(new)** |
| `height_canonical` | DecimalField(14,4) null | number | no | **(new)** mm |
| `height_unit` | CharField(4) | single_select | no (default `mm`) | **(new)** |
| `size` | CharField(100) blank | text | no | free-form label |
| `weight_canonical` | DecimalField(14,4) null | number | no | **(new)** stored in g |
| `weight_unit` | CharField(4) | single_select | no (default `g`) | **(new)** g/kg/lb |
| `price` | DecimalField(20,4) null | number | no | market value |
| `price_currency` | CharField(3) blank | text | no | **(new)** currency code (finance API) |
| `cost` | DecimalField(20,4) null | number | no | amount paid |
| `cost_currency` | CharField(3) blank | text | no | **(new)** currency code |
| `color` | CharField(50) blank | text | no | **(new)** free string |
| `url` | CharField(500) blank | text | no | **(new)** reference link |
| `status` | CharField(12) | single_select | yes (default `active`) | **(changed)** active \| deprecated |
| `acquisition` | FK→Acquisition, `CASCADE` | — | **yes** | **(changed)** required (was nullable SET_NULL) |
| `archived_at` | DateTimeField null | date | no | archive marker; filterable |
| `created_at` / `updated_at` | DateTimeField | — | auto | |

**Removed (changed)**: `category`, `storage_location`, `purchase_time`.

**Serializer read/write shape for measurements**: exposes `length`, `width`, `height`, `weight` as `{value, unit}` objects (or `value`+`*_unit` pair). On write, `canonical = value × factor(unit)`. On read, `value = canonical ÷ factor(unit)`. Conversion factors: length→mm {mm:1, cm:10, m:1000, in:25.4}; weight→g {g:1, kg:1000, lb:453.592}.

**Validation**:
- `name` non-blank; numeric fields ≥ 0 (FR-005).
- `item_type` ∈ enum; `status` ∈ {active, deprecated}; units ∈ their measure's set.
- `acquisition` is set on creation (enforced by creating items only within an acquisition write).

**Meta**: `ordering = ["-acquisition__obtained_at"]` (default list sort).

---

## Entity: Scenario

Unchanged from iteration 1. Fields: `id`, `name` (required), `notes`, `created_at`, `updated_at`. Derived counts: `item_count`, `prepared_count`, `outstanding_count`, `complete`.

---

## Entity: ScenarioItem

Unchanged from iteration 1 (checklist line + containment). Fields: `id`, `scenario` FK CASCADE, `item` FK CASCADE, `required_quantity` (default 1), `prepared` (bool), `container` self-FK (null, SET_NULL, same scenario, acyclic), `notes`, `created_at`. `unique_together(scenario, item)`. Derived `shortfall` for consumables.

---

## Entity: Constraint

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `scenario` | FK→Scenario, `CASCADE` | — | yes | |
| `name` | CharField(200) blank | text | no | |
| `constraint_type` | CharField(20) | single_select | yes | mutual_exclusive \| required \| weight_limit |
| `items` | M2M→Item | — | no | target set |
| `limit_value` | DecimalField(14,4) null | number | no | for weight_limit (compared against `weight_canonical` sum, in g) |
| `created_at` | DateTimeField auto_now_add | — | auto | |

**Removed (changed)**: `target_category`.

**Validation** (per type): `mutual_exclusive` needs ≥2 items; `required` needs ≥1 item (**changed** — no category alternative); `weight_limit` needs `limit_value > 0`.

**Evaluation** (`services.evaluate_constraints`): weight_limit sums `weight_canonical` (grams) of selected items and compares to `limit_value` (interpret as grams, or the constraint carries its own unit — v1: grams canonical). `required` violation when the selection intersects none of `items`. `mutual_exclusive` violation when >1 of `items` selected.

---

## Relationships (ER summary)

```text
Acquisition 1 ──< Item            (Item.acquisition, REQUIRED, CASCADE)   ← composition
Scenario    1 ──< ScenarioItem >── 1 Item
ScenarioItem 0..1 ──< ScenarioItem            (container self-FK, acyclic)
Scenario    1 ──< Constraint  *>──< Item      (M2M target set)
```

## Migrations

- **`0003_refine_fields`**: add new Item columns (spec, remark, *_canonical, *_unit, price_currency, cost_currency, color, url); alter `status` (data-migrate old values → active/deprecated; default active); drop `category`, `storage_location`, `purchase_time`; on Acquisition rename `notes`→`remark`, drop `arrived_at`, `cost`; **backfill** a synthetic blank-method "unknown origin" acquisition for any `acquisition IS NULL` items, then alter `Item.acquisition` to `NOT NULL` + `on_delete=CASCADE`; drop `Constraint.target_category`. Convert any existing `length/width/height/weight` values into `*_canonical` assuming their prior implicit unit (mm/g).
- **`0004_reseed_system_attrs`**: update `is_system` AttributeDefinitions for Item/Acquisition to the new field set (add spec/remark/color/url/units/currency/status; remove category/storage_location/purchase_time/arrived_at). Reversible.

## Backend filter/order opt-in

- **Item**: filter/sort on `name`, `item_type`, `model`, `serial_number`, `spec`, `size`, `weight_canonical`, `length_canonical`, `width_canonical`, `height_canonical`, `price`, `cost`, `color`, `status`, `archived_at`, and `acquisition__obtained_at` (default sort). Money/measure filters operate on the stored canonical/decimal columns.
- **Acquisition**: filter/sort on `source`, `method`, `obtained_at`.
