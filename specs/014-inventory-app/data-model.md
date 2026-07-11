# Phase 1 Data Model: Inventory App — Iteration 3

**Feature**: 014-inventory-app | **Date**: 2026-07-11

Concrete Django models in `inventory`, updated for the 2026-07-11 clarifications. nanoid 12-char PKs. Changes from iteration 2 marked **(new)**, **(removed)**, **(changed)**.

Attribute types map to the constitution set: `text`, `long_text`, `number`, `date`, `boolean`, `single_select`.

---

## Entity: Acquisition

The batch-obtain + payment record and the sole creation path for items.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `source` | CharField(200) blank | text | no | store/seller/person; entered via auto-complete |
| `request_time` | DateTimeField null | date | no | **(new)** when the order was initiated/requested |
| `obtained_at` | DateTimeField null | date | no | when received; create-form default = today 00:00 |
| `remark` | TextField blank | long_text | no | |
| `cost` | DecimalField(20,4) null | number | no | **(new)** total paid for the order |
| `cost_currency` | CharField(3) blank | text | no | **(new)** currency code (finance API) |
| `discount` | DecimalField(20,4) null | number | no | **(new)** order discount |
| `tax_refund` | DecimalField(20,4) null | number | no | **(new)** order tax refund |
| `created_at` / `updated_at` | DateTimeField | — | auto | |

**Removed (changed)**: `method`.

**Derived (serializer)**: `item_count`; **`net_cost` = `(cost ?? 0) − (discount ?? 0) − (tax_refund ?? 0)`** (read-only). (No more `total_item_cost` per-currency list.)

**Validation**: on create, the nested `items` list MUST contain **≥ 1** item (R6).

**Relationships**: owns 1..N `Item` (composition, `Item.acquisition` FK `CASCADE`). Deleting an acquisition deletes its items.

**Meta**: `ordering = ["-obtained_at", "-created_at"]`.

---

## Entity: Item

An individual owned/consumed thing. Belongs to exactly one Acquisition.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `name` | CharField(200) | text | **yes** | non-blank |
| `item_type` | CharField(20) | single_select | yes (default `stockable`) | stockable \| consumable |
| `quantity` | DecimalField(20,4) | number | **yes (default 1)** | **(changed)** NOT NULL, default 1 |
| `spec` | TextField blank | long_text | no | (absorbs former model/serial detail) |
| `remark` | TextField blank | long_text | no | |
| `length_canonical`/`length_unit` | Decimal / CharField | number / single_select | no | mm canonical; mm/cm/m/in |
| `width_canonical`/`width_unit` | … | … | no | mm |
| `height_canonical`/`height_unit` | … | … | no | mm |
| `weight_canonical`/`weight_unit` | Decimal / CharField | number / single_select | no | g canonical; g/kg/lb |
| `volume_canonical` | DecimalField(14,4) null | number | no | **(new)** mL canonical |
| `volume_unit` | CharField(4) | single_select | no (default `mL`) | **(new)** mL/L |
| `size` | CharField(100) blank | text | no | free-form label |
| `sku_price` | DecimalField(20,4) null | number | no | **(changed)** per-unit price (was `price`) |
| `sku_price_currency` | CharField(3) blank | text | no | **(changed)** (was `price_currency`) |
| `color` | CharField(50) blank | text | no | |
| `url` | CharField(500) blank | text | no | |
| `deprecate_time` | DateTimeField null | date | no | **(changed)** (renamed from `archived_at`); set ⇒ deprecated |
| `acquisition` | FK→Acquisition, `CASCADE` | — | **yes** | required (unchanged) |
| `created_at` / `updated_at` | DateTimeField | — | auto | |

**Removed (changed)**: `price`/`price_currency` (renamed), `cost`/`cost_currency` (→ Acquisition), `status` (now derived), `model`, `serial_number`.

**Derived (serializer, read-only)**:
- **`total_price` = `(sku_price ?? 0) × quantity`**.
- **`status`** = `"deprecated"` if `deprecate_time` is not null else `"active"`.
- Measurements exposed as `{value, unit}` (write→canonical, read→display), incl. `volume`.

**Validation**: `name` non-blank; `quantity` required (default 1) and ≥ 0; numeric fields ≥ 0; units in their measure's set. `acquisition` set only via the acquisition nested create.

**Meta**: `ordering = ["-acquisition__obtained_at"]`.

---

## Entities: Scenario, ScenarioItem, Constraint

**Unchanged** from iteration 2. (Constraint remains item-set-only; weight_limit compares `weight_canonical`.)

---

## Relationships (ER summary)

```text
Acquisition 1 ──< Item            (Item.acquisition REQUIRED, CASCADE; ≥1 item per acquisition)
Scenario    1 ──< ScenarioItem >── 1 Item
ScenarioItem 0..1 ──< ScenarioItem            (container self-FK, acyclic)
Scenario    1 ──< Constraint  *>──< Item      (M2M target set)
```

## Migrations

- **`0005_iter3_fields`** (non-atomic):
  1. **Item renames** (data-preserving): `price`→`sku_price`, `price_currency`→`sku_price_currency`, `archived_at`→`deprecate_time`.
  2. **AddField**: Item `volume_canonical`, `volume_unit`; Acquisition `request_time`, `cost`, `cost_currency`, `discount`, `tax_refund`.
  3. **RunPython backfill** (before drops / NOT NULL): set `Item.quantity = 1` where null; set each `Acquisition.cost = Σ item.cost` and `cost_currency` = first non-blank item `cost_currency` (preserve iteration-2 cost data); (Item.status removal needs no backfill — value was derivable).
  4. **AlterField**: `Item.quantity` → NOT NULL default 1.
  5. **RemoveField**: Item `cost`, `cost_currency`, `status`, `model`, `serial_number`; Acquisition `method`.
  6. Order: renames → adds → RunPython → alter-not-null → removes (so the backfill reads item.cost before it is dropped).
- **`0006_reseed_system_attrs`**: refresh `is_system` AttributeDefinitions — Item: add sku_price, sku_price_currency, volume, volume_unit, deprecate_time; drop cost/cost_currency/status/model/serial_number; keep spec/remark/etc. Acquisition: add request_time, cost, cost_currency, discount, tax_refund; drop method. Reversible.

## Backend filter/order opt-in (updated)

- **Item** filter/sort: `name`, `item_type`, `spec`, `size`, `weight_canonical`, `length_canonical`, `width_canonical`, `height_canonical`, `volume_canonical`, `sku_price`, `color`, `deprecate_time`, `acquisition__obtained_at` (default sort). (Dropped: `cost`, `model`, `serial_number`, `status` filter — status is derivable; a `deprecated` boolean filter over `deprecate_time` MAY be exposed.)
- **Acquisition** filter/sort: `source`, `obtained_at`, `request_time`, `cost`. (Dropped: `method`.)
