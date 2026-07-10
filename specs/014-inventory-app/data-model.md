# Phase 1 Data Model: Inventory App

**Feature**: 014-inventory-app | **Date**: 2026-07-10

Concrete Django models in the new `inventory` app. All models use the `core.nanoid.generate_id` 12-char primary key (matching Finance), except join/ordering conventions noted. All fields are additionally surfaced as system `AttributeDefinition`s where they are user-facing (see "System Attribute Seeds").

Field type legend maps to the constitution's allowed attribute types: `text`, `long_text`, `number`, `date`, `boolean`, `single_select`.

---

## Entity: Item

The catalog entity — a physical thing the user owns or consumes. May act as a container.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `name` | CharField(200) | text | **yes** | identifying name; blank rejected (FR-005) |
| `item_type` | CharField(20) | single_select | yes (default `stockable`) | `stockable` \| `consumable` |
| `model` | CharField(200) blank | text | no | manufacturer model |
| `serial_number` | CharField(200) blank | text | no | duplicates allowed with soft warning (edge case) |
| `quantity` | DecimalField(20,4) null | number | no | on-hand quantity; primarily for consumables (FR-004) |
| `length` | DecimalField(12,2) null | number | no | ≥ 0 |
| `width` | DecimalField(12,2) null | number | no | ≥ 0 |
| `height` | DecimalField(12,2) null | number | no | ≥ 0 |
| `size` | CharField(100) blank | text | no | free-form size/label (e.g. "M", "42L") |
| `weight` | DecimalField(12,3) null | number | no | ≥ 0; used by `weight_limit` constraint |
| `price` | DecimalField(20,4) null | number | no | market/retail value |
| `cost` | DecimalField(20,4) null | number | no | amount paid; summed for acquisition total |
| `purchase_time` | DateTimeField null | date | no | when obtained (item-level) |
| `storage_location` | CharField(200) blank | text | no | where it lives when unpacked (position review) |
| `status` | CharField(30) blank | single_select | no | e.g. `available`, `in_use`, `lost`, `retired` |
| `acquisition` | FK→Acquisition null, `SET_NULL` | — | no | originating acquisition (R2); null = unknown origin |
| `archived_at` | DateTimeField null | date | no | set on archive (FR-002); null = active |
| `created_at` | DateTimeField auto_now_add | — | auto | |
| `updated_at` | DateTimeField auto_now | — | auto | |

**Validation rules**:
- `name` MUST be non-blank (FR-005).
- `length`, `width`, `height`, `weight`, `quantity`, `price`, `cost` MUST be ≥ 0 when provided (FR-005).
- `item_type` MUST be one of the enum values.
- Default list excludes rows where `archived_at IS NOT NULL`; `?archived=true` returns archived rows (FR-002).

**Meta**: `ordering = ["name"]`.

---

## Entity: Acquisition

A record of how one or more items were obtained (formerly "Order").

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `source` | CharField(200) blank | text | no | store, seller, or person |
| `method` | CharField(20) blank | single_select | no (optional) | `purchase` \| `gift` \| `transfer` \| `found` \| `other`; blank = unknown |
| `obtained_at` | DateTimeField null | date | no | date obtained |
| `arrived_at` | DateTimeField null | date | no | arrival date; null = not yet arrived (FR/US2 arrival status) |
| `cost` | DecimalField(20,4) null | number | no | optional lump-sum cost (R3) |
| `notes` | TextField blank | long_text | no | |
| `created_at` | DateTimeField auto_now_add | — | auto | |
| `updated_at` | DateTimeField auto_now | — | auto | |

**Derived (read-only, serializer)**:
- `item_count` — number of linked items.
- `total_item_cost` — sum of linked items' `cost` (R3); may be 0.
- `has_arrived` — `arrived_at IS NOT NULL`.

**Relationships**: reverse of `Item.acquisition` (one Acquisition → many Items). Deleting an Acquisition sets linked `Item.acquisition = NULL` (never deletes items — FR-009).

**Meta**: `ordering = ["-obtained_at", "-created_at"]`.

---

## Entity: Scenario

A named situation the user prepares for.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `name` | CharField(200) | text | **yes** | e.g. "Weekend camping" |
| `notes` | TextField blank | long_text | no | |
| `created_at` | DateTimeField auto_now_add | — | auto | |
| `updated_at` | DateTimeField auto_now | — | auto | |

**Derived (serializer / checklist endpoint)**: `item_count`, `prepared_count`, `outstanding_count`, `complete`, `violation_count`.

**Meta**: `ordering = ["name"]`.

---

## Entity: ScenarioItem (checklist line + containment node)

Join between a Scenario and an Item; carries preparation state and the packing/containment parent.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `scenario` | FK→Scenario, `CASCADE` | — | yes | |
| `item` | FK→Item, `CASCADE` | — | yes | |
| `required_quantity` | DecimalField(20,4) default 1 | number | yes | needed quantity (R8) |
| `prepared` | BooleanField default False | boolean | yes | checked-off state (FR-011) |
| `container` | FK→self (ScenarioItem) null, `SET_NULL` | — | no | parent line in the SAME scenario; null = top-level (R4) |
| `notes` | CharField(200) blank | text | no | |
| `created_at` | DateTimeField auto_now_add | — | auto | |

**Validation rules**:
- `unique_together = (scenario, item)` — an item appears once per scenario.
- `container` MUST belong to the same `scenario`.
- Assigning `container` MUST NOT create a cycle or self-reference (R4, FR-016) — validated by walking the parent chain.
- `container.item` MUST be a container-capable item (any item may be a container in v1; no separate flag).

**Derived (checklist endpoint)**: `shortfall` — for consumable items, `max(0, required_quantity − item.quantity)` (R8).

**Meta**: `ordering = ["created_at"]`.

---

## Entity: Constraint

A packing rule attached to a scenario.

| Field | DB type | Attr type | Required | Notes |
|-------|---------|-----------|----------|-------|
| `id` | CharField(12) PK | — | auto | nanoid |
| `scenario` | FK→Scenario, `CASCADE` | — | yes | |
| `name` | CharField(200) blank | text | no | human label, e.g. "Batteries: pick one" |
| `constraint_type` | CharField(20) | single_select | yes | `mutual_exclusive` \| `required` \| `weight_limit` (R5) |
| `items` | M2M→Item | — | no | target item set (mutual_exclusive / required) |
| `target_category` | CharField(100) blank | text | no | required-by-category (matches `Item.status`/type/label) |
| `limit_value` | DecimalField(12,3) null | number | no | threshold for `weight_limit` |
| `created_at` | DateTimeField auto_now_add | — | auto | |

**Validation rules** (per `constraint_type`):
- `mutual_exclusive`: `items` MUST contain ≥ 2 members.
- `required`: exactly one of (`items` non-empty) or (`target_category` non-blank) MUST be set.
- `weight_limit`: `limit_value` MUST be provided and > 0.

**Meta**: `ordering = ["created_at"]`.

---

## Relationships (ER summary)

```text
Acquisition 1 ──< Item            (Item.acquisition, nullable, SET_NULL)
Scenario    1 ──< ScenarioItem >── 1 Item      (join; CASCADE from Scenario/Item)
ScenarioItem 0..1 ──< ScenarioItem            (container self-FK, same scenario, acyclic)
Scenario    1 ──< Constraint                   (CASCADE)
Constraint  * >──< Item                        (M2M target set)
```

## Lifecycle / state transitions

- **Item**: `active` → `archived` (`archived_at` set). Archived items remain referenced by acquisitions/scenarios with an archived indicator (edge case). Hard delete only via guarded `?confirm=true` when references exist.
- **Acquisition arrival**: `arrived_at = null` (pending) → set (arrived); drives `has_arrived` display (US2).
- **ScenarioItem.prepared**: `false` → `true` (and back). Scenario `complete` when every line is `prepared` (FR-011).

## System Attribute Seeds (migration `0002_seed_system_attrs`)

Following `finance/0002_seed_account_system_attrs`, seed `AttributeDefinition(is_system=True)` for each user-facing field, keyed by each model's `ContentType`:

- **Item** ContentType: `name` (text), `item_type` (single_select, options `[stockable, consumable]`), `model` (text), `serial_number` (text), `quantity` (number), `length`/`width`/`height` (number), `size` (text), `weight` (number), `price`/`cost` (number), `purchase_time` (date), `storage_location` (text), `status` (single_select, options `[available, in_use, lost, retired]`).
- **Acquisition** ContentType: `source` (text), `method` (single_select, options `[purchase, gift, transfer, found, other]`), `obtained_at` (date), `arrived_at` (date), `cost` (number).
- **Scenario** ContentType: `name` (text), `notes` (long_text).

`display_order` increments in the order above. Reverse migration deletes `is_system=True` defs for these ContentTypes (mirrors Finance's `unseed`).

## Backend filter/order opt-in (Principle XII)

Each list ViewSet declares `filterable_fields` and `ordering_fields`:
- **Item**: filter/sort on `name`, `item_type`, `model`, `serial_number`, `weight`, `price`, `cost`, `purchase_time`, `status`, `storage_location`; `archived` handled by custom `get_queryset`.
- **Acquisition**: filter/sort on `source`, `method`, `obtained_at`, `arrived_at`, `cost`.
- **Scenario**: filter/sort on `name`, `created_at`.
