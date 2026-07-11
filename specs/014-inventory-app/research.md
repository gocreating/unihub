# Phase 0 Research: Inventory App — Iteration 4

**Feature**: 014-inventory-app | **Date**: 2026-07-11

Consolidates the five clarify sessions recorded after commit `a7a0ea2`. Prior decisions hold except where superseded. All items **Resolved**.

---

## R1. Cost factors (replace scalar cost fields)

- **Decision**: Introduce a **`CostFactor`** child entity of Acquisition: `value` (signed Decimal — negative reduces), `currency` (code string), `type` (label ∈ {accumulated, shipping, discount, tax_refund, paid_by_other, other}). **The value carries the sign; the type is informational and does not affect it.** Remove `Acquisition.cost`/`cost_currency`/`discount`/`tax_refund`.
- **Rationale**: Users itemise an order's payment (shipping, discounts, refunds) as separate lines; a signed value is the simplest sign model and lets any factor push net cost up or down.
- **Alternatives**: type-derived signs (rejected — user said sign is on the value); a single scalar cost (rejected — can't itemise).

## R2. net_cost grouped by currency

- **Decision**: Derived read-only **`net_cost`** is a **per-currency list** `[{currency, total}]`: for each currency, the sum of that currency's factor values. No FX conversion (Principle IX is finance-only).
- **Rationale**: Factors can be in different currencies (paid USD, refund EUR); grouping keeps the total honest without FX. Usually a single currency ⇒ one line.
- **Alternatives**: single-currency scalar (rejected by clarification — mixed-currency orders must be allowed).

## R3. ≥1 cost factor + `accumulated` auto-derivation

- **Decision**: An acquisition MUST have **≥1 cost factor**. On create, one factor of type **`accumulated`** is auto-inserted; its `value` defaults to **Σ item `total_price`** (Σ `sku_price × quantity`), currency = the items' common currency. The user may **override** the value or **reset** it to the derived sum; other factor types are added/edited/removed freely.
- **Rationale**: Mirrors "the order's base cost is what the items sum to," with explicit adjustments layered on. The reset affordance keeps it in sync as items change.
- **Migration**: backfill one `accumulated` factor per existing acquisition from the old `cost` (value = `cost − discount − tax_refund`? no — preserve granularity: create `accumulated` = old `cost`, plus a `discount` factor = `−discount` and a `tax_refund` factor = `−tax_refund` when non-zero), currency = old `cost_currency`.

## R4. Item cleanups — integer quantity, remove item_type, remove shortfall

- **Decision**: `Item.quantity` → **IntegerField** (default 1, required). **Remove `item_type`** and the stockable/consumable concept from model, form, filters, columns. The scenario checklist **no longer computes/shows any shortfall**; `ScenarioItem.required_quantity` remains for planning only.
- **Rationale**: Whole-unit quantities; the type distinction was "unnecessary and annoying"; with no consumable type the consumable-only shortfall has no basis, and a generic shortfall was declined.
- **Alternatives**: generic shortfall for all items (rejected by clarification — remove entirely).
- **Migration**: drop `item_type`; alter `quantity` to integer (existing decimals truncate/round — values were whole in practice; use `Cast`/round in the data migration).

## R5. Merged "Catalog" page (expandable tree)

- **Decision**: Replace the Items list and Acquisitions list with **one `CatalogPage`** — a `PageTable` with **expandable rows**: each **acquisition is a parent row** (acquisition columns), expanding to its **item child rows** (item columns). Columns are the **union**; a parent fills only acquisition columns, a child only item columns. Default order: acquisitions ↓ `obtained_at`. Item rows have **no Edit** action (Deprecate/Restore + Delete only); acquisition rows keep Edit + Delete; page-level New Acquisition. Adds obtained-date + `deprecate_time` columns; `columnEmptyText={false}` for the single "—".
- **Rationale**: One screen shows the whole catalog grouped by how items were acquired; the tree keeps acquisition and item data on their own rows without denormalisation.
- **Implementation**: `ProTable`/AntD `expandable` with `childrenColumnName` or `expandedRowRender`; data = acquisitions (each with nested `items`). Editing an item happens on the acquisition edit page (hence no item-row Edit).
- **Alternatives**: flat denormalised rows / group-header rows (rejected — user chose expandable tree).

## R6. Naming + nav + routing

- **Decision**: The merged page is **"Catalog"** (not "Positions" — clashes with US5 containment; not "Inventory" — the section name). Nav: **Inventory** section → **Catalog** + **Scenarios**. Remove the separate Items/Acquisitions nav entries; **redirect** `/inventory/items` and `/inventory/acquisitions` (list) to `/inventory/catalog`. Create/edit acquisition pages unchanged (`/inventory/acquisitions/new`, `/:id/edit`).
- **Rationale**: "Catalog" is unambiguous; "position" stays reserved for scenario containment (US5).

## R7. Acquisition page polish + content-width RWD + item-edit bug

- **Decision**: Acquisition create & edit title their section **"Acquisition"**; edit breadcrumb = **Acquisitions / {acquisition.id} / Edit Acquisition** (3 crumbs); `request_time` **defaults to today 00:00**. Form fields (acquisition form + `ItemFormModal`) **stack to one full-width column on narrow content** via a **`useContainerWidth`** hook (ResizeObserver on the container) — because AntD `Col` xs/sm track the **viewport**, not the content area, which is why prior `xs`/`sm` attempts didn't stack behind a narrow content pane. **Fix the item-edit-doesn't-save defect** (FR-021a): editing an item card MUST persist — create flow into the pending list, edit flow to the stored item; the value survives on the card and after reload.
- **Rationale**: Directly addresses repeated user reports.
- **Bug root-cause hypothesis**: in `AcquisitionForm`, the edited card's data was written to local state but the `ItemFormModal`'s pre-fill `initial` (rebuilt each render) or the `editingIndex` handling dropped the update; verify the modal `onOk`→`handleCardOk` path writes back to `cards[editingIndex].data` (and calls `updateItem` in edit mode) and that the modal re-inits from the correct source.

## R8. Placeholder consistency (carried forward)

- **Decision**: `columnEmptyText={false}` on the Catalog `PageTable` so ProTable's built-in "-" never appears; every empty cell uses the app's single em-dash "—". (Already implemented on the old list pages; carries into the merged Catalog.)

---

## Resolved decisions summary

| # | Topic | Decision |
|---|-------|----------|
| R1 | Cost factors | CostFactor {value signed, currency, type-label}; replace scalar cost fields |
| R2 | net_cost | Per-currency grouped sum (no FX) |
| R3 | Factors min/default | ≥1; `accumulated` auto = Σ item total_price, override/reset |
| R4 | Item cleanups | quantity integer; remove item_type; remove checklist shortfall |
| R5 | Catalog | One expandable-tree page (acquisition parents → item children); item rows no Edit |
| R6 | Naming/nav | "Catalog"; Inventory→Catalog+Scenarios; redirect old list routes |
| R7 | Polish/RWD/bug | "Acquisition" title, 3-crumb edit breadcrumb, request_time default, content-width RWD, item-edit persistence fix |
| R8 | Placeholder | `columnEmptyText={false}` (single "—") |

### Superseded from iteration 3
- `Acquisition.cost`/`cost_currency`/`discount`/`tax_refund` scalars → **CostFactor** entity (R1/R2/R3).
- `Item.item_type` → **removed**; `quantity` → **integer** (R4).
- Consumable **shortfall** in the checklist → **removed** (R4).
- Separate **Items** and **Acquisitions** list pages → one **Catalog** (R5/R6).
- Acquisition list nav entry "Inventory" (proposed last session) → **"Catalog"** (R6).

---

## Iteration 5 research (catalog & cost UI)

### R7 — Accumulated cost factor is per-currency
- **Decision**: derive one `accumulated` factor per distinct item `sku_price_currency` (`value` = Σ `sku_price × quantity` for that currency), unique per `(acquisition, currency)`, system-managed (non-removable, not client-creatable, overridable/resettable).
- **Rationale**: items in an acquisition can carry different currencies (the legacy data mixes RMB/USD/TWD/JPY); a single accumulated can't represent that, and `net_cost` is already per-currency. Matches the requested "Items … USD / Items … TWD" mockup rows.
- **Alternatives**: one accumulated total (rejected — can't express multi-currency); accumulated per item (rejected — too granular, not what "Items" subtotal means).

### R8 — `type` becomes free-form text
- **Decision**: store `type` as a plain string (drop DB `choices`); the six built-ins are autocomplete suggestions; `accumulated` is system-reserved (server rejects client use). Reseed the AttributeDefinition `single_select → text`.
- **Rationale**: users need labels beyond the fixed set (e.g. "customs", "代買", "coupon"). Sign lives on `value`, so `type` is purely descriptive and safe to open up.
- **Alternatives**: keep fixed enum (rejected — user asked for free text); separate `type` + `label` fields (rejected — redundant).

### R9 — Persisted factor order + drag reordering
- **Decision**: add `display_order` (int); persist it; accumulated rows pinned to the front (not draggable); manual rows drag-sortable with **`@dnd-kit/sortable`**.
- **Rationale**: the mockup shows drag handles; `@dnd-kit` is small, accessible, React-18 friendly, and works on a plain list (the cost rows are a form panel, not a `PageTable`).
- **Alternatives**: `react-dnd` (heavier), ProComponents `DragSortTable` (table-bound — the rows aren't a table), no-persist creation order (rejected — user wants saved order).

### R10 — Catalog & cost-panel UI
- Arrow expand icon via `expandable.expandIcon`; split the single Name/Source column into a **Source** column (acquisition rows) and a **Name** column (item rows); size **Actions** to content; drop the "Acquisition" badge.
- Rename **Cost Factors → Cost**, move the panel **below Items**; net cost → **"Total" footer** (per-currency); each row `[drag] · type(AutoComplete) · value+currency (Space.Compact, value right-aligned) · reset|remove`; full-width rows with vertical gap when stacked (`useContainerWidth`).
- `obtained_at` defaults to today 00:00 on create; item cards render **every non-empty attribute**.

### Terminology delta
- "Cost Factors" panel → **"Cost"**; derived total label → **"Total"**; item cards must be **attribute-complete**.
