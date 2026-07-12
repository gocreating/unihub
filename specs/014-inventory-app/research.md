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

## Iteration 13 research (catalog derived columns & density, 2026-07-12)

- **R13.1 — Hidden-by-default columns**: Decision: use the existing `ColumnDef.visible: false` (already honored by `useColumnConfig`/ColumnPanel — no toolbar change); bump the persistence key `inventory-catalog-v2 → inventory-catalog-v3`. Rationale: saved localStorage state would otherwise shadow the new defaults (same mechanism as iteration 10). Alternatives: filtering defs out (rejected — that caused the URL-column dropdown bug this iteration fixes: a column absent from the defs can never be toggled).
- **R13.2 — Parameters badges**: Decision: extract `itemCardBadges()` (AcquisitionForm.tsx) into a shared `pages/inventory/itemBadges.ts` exposing (a) the full card badge list and (b) a `parameterBadges()` subset (color, weight, length, width, height, volume, size) reused by the Catalog's Parameters column. Rationale: single formatting source (units, trailing-zero drop, ellipsis+Tooltip pattern). Alternatives: duplicating format logic in the catalog (rejected — drift risk, DRY).
- **R13.3 — Flat-mode "Acquisition" summary**: Decision: add read-only `net_cost` (SerializerMethodField, same per-currency aggregation as `AcquisitionSerializer.get_net_cost`) to `AcquisitionSummarySerializer` (the nested `ItemSerializer.acquisition`); regen OpenAPI + `openapi-typescript` types BEFORE consuming (Principle IV). Rationale: flat mode renders `{source} {net cost}` on item rows; nested summary today only has id/source/request_time/obtained_at. Alternatives: client-side join against the acquisitions endpoint (rejected — second fetch, jitter, violates the single-fetch decision from iteration 7).
- **R13.4 — color/volume filter+sort**: Decision: frontend-only wiring (add to `filterableAttrs`, `ITEM_KEYS` flatten triggers, and column defs). Rationale: `ItemViewSet` already exposes `color` and `volume_canonical` in `filterable_fields`/`ordering_fields` since iteration 9. Alternatives: none needed.
- **R13.5 — Two-row cells vs width measurement**: Decision: `displayText()`/`dataWidths` measure two-row cells as `max(measureTextWidth(primary), measureTextWidth(secondary))` per row; derived columns are measured like real ones; no width floors (iteration 12 rule stands). Rationale: keeps `widthForHeader` correct for stacked content.
- **R13.6 — Two-row datetime renderer**: Decision: a small shared `DateTimeCell` (absolute `YYYY-MM-DD HH:mm` primary; `fromNow()` as `Typography.Text type="secondary"` second row) implementing constitution v1.18.0; used by Requested/Obtained/deprecate_time catalog columns. `dayjs/plugin/relativeTime` is already registered at app entry. Alternatives: per-column inline JSX (rejected — the constitution default will spread to other pages; one helper).
- **R13.7 — Item-row actions**: Decision: remove Delete from item rows (keep Deprecate/Restore); `useActionsColWidth` measurement shrinks accordingly. Hard delete remains on the acquisition edit page (card remove) and acquisition Delete (cascade). Supersedes iteration 4.

### Terminology delta
- **"Item" / "Parameters" / "Acquisition"** = the three read-only *derived presentation columns* (FR-003a); "derived" here means display-only (no filter/sort), like `net_cost`/`status`.

## Iteration 14 research (dynamic parameters + scenario simplification, 2026-07-12)

- **R14.1 — Storage**: Decision: shared core `AttributeDefinition`/`AttributeValue` (Principle I). The full API already exists (`/api/v1/core/attribute-definitions/`, `attribute-values/` list + `bulk-upsert`; content-type scoping; system-delete blocked; delete-with-values returns `affected_entity_count` and requires `?confirm=true`). Alternatives: inventory-owned ItemParameter table (rejected — Principle I violation, parallel storage).
- **R14.2 — Core extensions**: `AttributeDefinition` += `dimension` data type + `unit_family` (length|weight|volume, blank for others); `AttributeValue` += `value_number` (Decimal, null — canonical for dimension, the number for numeric) and `value_unit` (entered unit, dimension only). Rationale: DB-level numeric ordering needs a real column, not text casts. **Gap found**: core lacks a rename/type-change guard for `is_system` definitions (only delete is blocked) — guard added per Principle I ("cannot be deleted or renamed").
- **R14.3 — Unit conversion placement**: conversion tables/helpers move from `inventory/units.py` to **`core/units.py`** (core cannot import a domain app — Principle II); `inventory.units` re-exports for backward compatibility. Families: length→mm, weight→g, volume→mL (unchanged).
- **R14.4 — Attribute-aware filter/sort**: NEW — nothing exists anywhere (verified: `core/filters.py` and all viewsets reference only concrete columns; no finance precedent). Scheme: toolbar keys **`attr:<definition_id>`**; a view opts in with `attribute_content_type = "inventory.item"`; `EntityFilterBackend` and `NullsOrderingFilter` resolve such keys via `core/attributes.py::annotate_attribute()` — a scalar `Subquery` per referenced definition (`attr_<id>_text` / `attr_<id>_num`), filtered/ordered on the annotation; absent values are NULLs so `__nullsfirst`/`__nullslast` behave. Ordering uses `value_number` for numeric/dimension, `value` for text/select.
- **R14.5 — Item parameters API shape**: `ItemSerializer.parameters` — read: `[{definition_id, name, data_type, unit_family, value, unit, value_number}]` (prefetched, no N+1); write (acquisition item create + item PATCH): full-list **upsert-replace** (missing keys deleted) — matches the row-editor UX. Validation per type (numeric parse, unit ∈ family, select value ∈ options).
- **R14.6 — Migration order** (single inventory migration chain): (1) core schema migration; (2) inventory data migration seeds the 7 system defs (color/size → text; weight/length/width/height/volume → dimension with families; content type inventory.item), then copies each item's concrete values into AttributeValues (value = display value via `from_canonical(unit)`, value_unit = stored unit, value_number = canonical), then (3) schema migration drops the 12 columns (color, size, 5×`_canonical`, 5×`_unit`); (4) scenario migration renames notes→description, drops prepared/required_quantity, adds display_order (backfilled by created_at order per scenario), drops Constraint.
- **R14.7 — data_io**: `has_user_attributes=True` mechanism is fully built (exporter emits `[name]:type` columns; importer whitelists + upserts) — flipping the item descriptor suffices; `core.attributedefinition` is already a registered table (import_order 2) so definitions round-trip before item rows. Constraint was never registered (M2M deferral) → dropping it needs no descriptor change.
- **R14.8 — Organize tree**: AntD `Tree` with `draggable` + `onDrop` (no new dependency; @dnd-kit stays for cost-factor rows). Drop semantics → `POST scenarios/<sid>/items/<pk>/move {container_id, index}`; server rewrites sibling `display_order` densely and re-runs `would_create_cycle`. Removal keeps the existing child re-parent behaviour (`views.py destroy`).
- **R14.9 — Backlog search**: server-side via existing `EntityFilterBackend` OR-groups on `ItemViewSet` (`filters={groups:[{name icontains q},{spec icontains q}]}` — groups OR, conditions AND), excluding current members client-side (scenario item set is already loaded). Rationale: no new endpoint; "fuzzy" = case-insensitive substring per spec.
- **R14.10 — Scenario UI**: list = Name/Description/Actions (modal form name+description); detail = two Cards (Backlog | Organize) side-by-side, stacking on narrow content width (`useContainerWidth`). Checklist/constraint UI deleted with their service functions.

### Terminology delta
- **Parameter** = an Item AttributeValue whose key is an AttributeDefinition (system or user-defined); **unit family** = length|weight|volume; **`attr:<id>`** = toolbar key format for parameter filter/sort/columns.

## Iteration 15 research (single-row merge + import repairs, 2026-07-12)

- **R15.1 — Missing dates root cause (CONFIRMED)**: the Google-Sheets HTML merges the 購買日期 cell VERTICALLY (`rowspan`) when consecutive acquisitions share a date (e.g. "niko and...（武商夢時代）" and "MUJI 無印良品（武商夢時代）" share `2026/04/25`); the parser normalises `colspan` but not `rowspan`, so the second acquisition's date is lost (preview: `[12] MUJI 武商夢時代 req=— obt=—`). Fix: expand rowspan during table normalisation (carry the cell into subsequent rows). Regression-locked by a fixture-driven pytest.
- **R15.2 — 代買 root cause (CONFIRMED)**: `parse_remark` only resolves `key：value` lines; bare keyless lines (代買) are silently discarded, violating the no-data-loss rule. Fix: append unresolved bare lines to `remark`. Regression-locked.
- **R15.3 — "0 CNY" root cause (CONFIRMED)**: the sheet EXPLICITLY records `0` in 實際支付價錢 for many rows (real prices under 備註 單價/原價) — not an importer fabrication. Fix scope: never coerce a BLANK paid column to 0 (blank keeps the derived item-price accumulated); an explicit 0 stays 0 and the UI hides zero net cost.
- **R15.4 — DB state**: 68 acquisitions, all legacy-imported, zero null-dated, no duplicates beyond expected same-source orders; several dates carry the `T16:00:00Z` signature of manual UI edits — the chosen wipe+re-import supersedes them with parsed values.
- **R15.5 — Footer totals**: implemented as a core hook — `EntityOffsetPagination` includes a `totals` object in the response when the view defines `get_footer_totals(filtered_qs)`; AcquisitionViewSet returns `{acquisitions: count, items: Σ items}`, ItemViewSet `{acquisitions: distinct acquisition count, items: count}`. `EntityOffsetFooter` gains a `totalText` slot; other pages keep "{total} records".
- **R15.6 — Merged single-item rows**: render-time only. A collapsed single-item acquisition row feeds item-side renderers from `items[0]` and offers both entities' actions; a single `toggledIds` set flips per-row defaults (multi-item = expanded, single-item = collapsed). Sorting/filtering/pagination semantics unchanged (the merged row IS the acquisition row).

### Terminology delta
- **Merged row** = a collapsed single-item acquisition rendering both entities in one row (FR-003b); **footer totals** = "{x} acquisitions, {y} items".
