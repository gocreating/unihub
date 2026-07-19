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

## Iteration 16 research (Toggle column, parameter editor polish, organize redesign, 2026-07-12)

- **R16.1 — Splitter**: AntD `Splitter` verified available in the installed antd (5.29.3). Orientation: `layout="horizontal"` (left/right) on wide content, `layout="vertical"` (top/bottom) on narrow, switched by `useContainerWidth` on the Organize card body (content width, not viewport — same rule the form grid uses). Alternatives: hand-rolled resizable flex (rejected — component exists), fixed two-Card layout (rejected — user asked for Splitter explicitly).
- **R16.2 — Cross-pane drag (CONFIRMED constraint)**: rc-tree's `onDrop` fires only for drags that STARTED on its own treenodes — external HTML5 drags never reach it. Bridge with native HTML5 DnD, no new dependency: left-pane rows are `draggable` elements carrying the line id (ref + `dataTransfer`); for left→right, drop handlers live on tree node titles via `titleRender` (drop = nest under that node) and on the tree wrapper background (drop = append at organized top level); for right→left, Tree `onDragStart` records the dragged line in the same ref and the left pane's wrapper accepts the drop (= send back / unorganize). Internal tree rearrangement keeps the existing rc-tree `onDrop` → `computeDropTarget` path. dnd-kit (already a dep for cost-factor rows) rejected: wiring it INTO rc-tree's internal nodes is heavier than two native drop zones.
- **R16.3 — Pin-by-default Toggle column**: `useColumnConfig` initialises `ColumnState` with hardcoded `stickyLeft:false`, so a pinned-by-default column needs a seed, not a special case: `useEntityTable`/`useColumnConfig` accept `defaultSticky?: { left?: boolean; right?: boolean }` used ONLY when constructing the initial/default state (Reset restores it; user changes still win; the async column-merge effect must not clobber it). The caret becomes a real `ColumnDef` (`key: '__caret'`, i18n label "Toggle", fixed content width, `sortable/filterable: false`), rendered by the existing caret cell renderer in tree mode and dropped in flat mode (flat mode already strips it today).
- **R16.4 — User-definition deletion**: core already implements two-step delete (`DELETE /core/attribute-definitions/{id}` → 400 + `affected_entity_count` unless `?confirm=true`; system defs always blocked) and the service layer exposes `deleteAttributeDefinition(id, confirm)`. UX: in the ParameterRowsEditor key dropdown, user-defined options get a trailing delete icon (`optionRender`, `onMouseDown` stop-propagation so the Select doesn't select/close), which runs the probe call and raises `Modal.confirm` (danger) with the affected count, then deletes with `confirm=true`, invalidates `['core','attribute-definitions']` (+ item queries) and clears any editor row using that key. System definitions show no delete icon.
- **R16.5 — `organized` semantics**: new `ScenarioItem.organized` boolean (default false, migration 0013). Panes: left = `organized=false` lines flat, sorted `created_at` (display_order meaningless there); right tree = `organized=true` lines only (`childrenOf` filters). `move` gains optional `organized`: organizing (`true`) sets container/index with the existing dense sibling reorder scoped to organized siblings; sending back (`false`) forces `container=None` and re-parents the line's children to the organized top level (mirror of the destroy re-parent rule). Adding via the search modal creates the membership with `organized=false` (lands in the left pane). Cycle checks unchanged. No backfill concern: current DB has zero ScenarioItems (iteration-15 wipe cascaded memberships).
- **R16.6 — Search modal**: reuses `listItems` server substring search (OR-groups name/spec, same as the old Backlog); members are NOT excluded from results — they render as disabled rows ("already added"); match substrings highlighted via a small `HighlightText` helper (case-insensitive split, `<mark>`); item names with `url` render as new-tab links (clickable even on disabled member rows). Modal is search-only (no dirty state) — Cancel-left rule still applies to its footer if buttons are shown; adding is per-row instant (button on each result).

### Terminology delta
- **Unorganized / organized** = ScenarioItem.organized false/true → left(top) flat pane vs right(bottom) tree pane; **send back** = unorganize (tree → flat pane), the only removal path from the tree; **Toggle column** = the caret disclosure column as a user-visible, pinnable ColumnDef.

## Iteration 17 research (catalog polish + 2025 import, 2026-07-12)

- **R17.1 — URL width root cause (CONFIRMED)**: the url cell renders its link ellipsised at `maxWidth: 320`, but `displayText('url')` feeds the FULL raw URL into `measureTextWidth`, so the column is sized to unrendered text (legacy taobao URLs run hundreds of px). Fix: cap the url entry handed to `widthForHeader` at the render cap (`min(measured, 320)`) — the general measure-what-you-render rule — and wrap the link content in `OverflowTooltip` (truncation-gated, full URL as title). Alternatives: shrink the render cap (rejected — 320 is fine, the defect is the mismatch); render a short "Link" label (rejected — loses at-a-glance URL identity).
- **R17.2 — Filter seeding**: `useEntityFilter` initializes empty (active `[]`, pending one empty group). Extend with `defaultGroups?: FilterGroup[]` mirroring `useEntitySort(key, defaultRules)`: seed BOTH active and pending state; `isActive` (any group with a non-empty condition) already lights the Filter button; apply-gate/clear semantics untouched (clearing shows everything — the spec requires editable/clearable, not reset-to-seed). Threaded as `defaultFilterGroups` through `useEntityTable`. Catalog seed: groups OR'd — `[{acquisition__obtained_at gte <YYYY-01-01>}]`, `[{acquisition__obtained_at is_empty}]`; acquisition-level attr keeps tree mode; "current year" computed at page load via dayjs.
- **R17.3 — Plurals**: react-intl ICU plural is available in the existing message pipeline — `'{count, plural, one {# item} other {# items}}'` for the Item-cell count; footer totals pluralize both nouns. zh-TW strings keep their current forms (Chinese has no plural inflection).
- **R17.4 — 2025 import**: `data/財產們/2025.html` present. Append-import (NO `--wipe`) from the host (`DATABASE_URL=postgresql://unihub:unihub@localhost:5433/unihub uv run python manage.py import_legacy_csv data/財產們/2025.html --commit`). Post-checks over the live API: acquisition/item totals grow by the preview's counts; spot-check parsed dates + 備註 remarks. The default YTD filter intentionally hides 2025 rows on the default view.

### Terminology delta
- **Measure-what-you-render** = column width must be computed from what the cell actually displays (capped/ellipsised render ⇒ capped measurement); **seeded default filter** = a page-supplied initial filter state (lit Filter button, clearable), the filter twin of `defaultSortRules`.

## Iteration 18 research (alias, scenario actions, DnD unification, 2026-07-12)

- **R18.1 — DnD unification (decision)**: replace all three coexisting drag mechanisms (rc-tree internal, native-HTML5 draggable rows, cross-pane bridge) with **one dnd-kit system** — @dnd-kit/core 6.3.1 + sortable 10 are already dependencies (cost-factor rows). The organized pane renders as a **flattened depth-indented sortable list** (canonical dnd-kit sortable-tree pattern); the flat pane is a droppable list of draggables inside the same `DndContext`. Rationale: PointerEvent-based (no HTML5 DnD quirks), first-class cross-container drags, projection-based nested drops with live depth feedback, and Playwright can drive it with a real mouse (`mouse.down/move/up`) instead of synthetic DragEvent dispatch. AntD `Tree` leaves the page (it was always fully expanded — no collapse behavior lost). Alternatives: patching the HTML5 bridge (rejected — cannot deliver one-motion nested drops or reliable in-tree drags alongside rc-tree), react-dnd (rejected — new dependency).
- **R18.2 — Flatten/projection math**: `flattenOrganized(lines)` walks `childrenOf` depth-first → ordered rows `{line, depth, parentId}`. During drag, `projectDrop(rows, activeId, overIndex, dragOffsetDepth)`: candidate depth = active depth + round(offsetX / indent), clamped to [depth of next row, depth of previous row + 1]; parent = nearest prior row with depth-1; index = position among that parent's children. The active row's own subtree is excluded from targets (the subtree travels with it — inherent cycle prevention, matching the server's `would_create_cycle`).
- **R18.3 — Alias display**: shared **`ItemName`** component (item, `linkify?`): text = `alias_name || name`; when aliased wraps in `Tooltip title={name}` (informational — reveals hidden content, never repeats visible text, so the truncation-gating principle is satisfied); when `linkify` and `url`, wraps in `<a target="_blank" rel="noopener noreferrer">`. Single source of the display rule for catalog Item cell, acquisition card headers, scenario pane rows, and Add-modal results.
- **R18.4 — Scenario form reuse**: the list's create modal is extracted to `ScenarioFormModal` (name + description, Cancel-left, dirty-guard) and mounted from both the list ("New") and the detail info panel ("Edit", pre-filled PATCH). Delete moves into a kebab `Dropdown` in the info-panel header (existing confirm copy; success navigates to the list).
- **R18.5 — Pane-row overflow (CONFIRMED defect)**: `List.Item` with `actions` can push the remove button out of a narrow pane. Fix: custom flex rows — content `flex: 1 1 auto; minWidth: 0` with ellipsised text lines, action `flex: none` — asserted at a narrow viewport in e2e.

### Terminology delta
- **Display name** = alias-preferred item name (`alias_name || name`), rendered via `ItemName`; **projection** = the live computation of prospective container/index/depth while dragging over the flattened tree.

## Iteration 19 research (panel-header kebab, catalog actions, organize polish, full import, 2026-07-12)

- **R19.1 — PanelHeaderActions**: one shared component implements constitution v1.21.0: props `{ narrow, visible: ActionDef[], advanced: MenuItemDef[], kebabLabel }`. Wide → `visible` as right-side header buttons + a kebab holding `advanced`; narrow → a single kebab holding `visible + advanced` (labels/icons preserved as menu items). Kebab = `Dropdown` `placement="bottomRight"` (right-aligned, opens leftward), click-triggered, `aria-label` per panel. The fold decision is an explicit `narrow` prop — pages already own `useContainerWidth`; keeping measurement out of the component makes the fold logic unit-testable in jsdom.
- **R19.2 — Edit as hyperlink**: AntD `Button href` renders a real `<a>` (middle/ctrl-click opens a tab natively); a left-click handler (`!metaKey && !ctrlKey`) `preventDefault`s and routes via `navigate` so plain clicks stay SPA. Rejected: nesting `<Button>` in `<Link>` (nested interactive elements), raw href only (full page reload on left click).
- **R19.3 — Tooltip nesting (organize rows)**: wrapping ItemName in OverflowTooltip would NEST tooltips for aliased items (alias tooltip + truncation tooltip). ItemName gains a **`truncate` prop**: it renders its own ellipsising, self-measuring span and ONE Tooltip — title = original `name` when aliased (informational, always), else the display text gated on actual truncation. Spec lines (plain text) use OverflowTooltip directly.
- **R19.4 — Caret + collapsed-subtree drops**: `collapsedIds: Set<string>` client state; `visibleRows(working, collapsedIds)` filters descendants of collapsed rows; caret renders on rows with children (from the FULL rows list), spacer otherwise. Drops: the pointer targets VISIBLE rows, so `gapFromVisible(working, visible, visIndex, after)` maps the slot back to WORKING coordinates — "after a collapsed container" resolves to after its entire subtree (the following visible row's working index, or working.length). `projectDrop` is unchanged (operates on working coordinates). The indicator renders between visible rows.
- **R19.5 — Full-import protocol (FR-029c)**: sheets 2015–2024, oldest first. Per sheet: preview (record acquisitions/items/flags) → import `--commit` (no wipe) → on ANY parse/validation failure: minimal HTML fixture reproducing it → parser/importer fix → all parser tests green → re-run the sheet. Final verification (live DB): totals equal 140/221 (post-iteration-17) + Σ sheet previews; `obtained_at__year` distribution covers the sheet years; sampled items carry parsed remarks/parameters. Older sheets may use different column sets/currency spellings — the no-data-loss rule (unresolved lines → remark) is the safety net.

### Terminology delta
- **Panel-header actions / kebab** = the v1.21.0 pattern (visible actions wide, folded narrow, advanced always in the kebab, bottomRight dropdown); **visible rows** = working rows minus collapsed subtrees (the organize pane's rendered list).

## Iteration 20 research (plural audit, no-data-loss hardening, drag polish, 2026-07-12)

- **R20.1 — LG ×4 root cause (CONFIRMED)**: 2016.html gives the 項目 cell `rowspan=4` (with price/currency/source/date also spanned) and FOUR per-row 備註 cells (a repair timeline). The parser's carried-cell grouping treated every carried-name row as a continuation ITEM → 4 identical items each holding one timeline line in `remark`. Fix: a row whose 項目 is CARRIED (not own) never creates an item; its own 備註 content appends to the CURRENT item's `spec` (newline-joined, sheet order). Own-row bare 備註 lines keep the iteration-15 rule (→ `remark`, 代買 tests unchanged).
- **R20.2 — Single-date rule (VERIFIED FAITHFUL, locked)**: `parse_date` already returns `(None, date)` for single dates. DB "requested-only" rows trace to OPEN ranges (`2026/07/10~`, ×2 in 2026.html) and "req==obt" rows to SAME-DAY ranges (`2026/07/09~2026/07/09` ×2, `2026/07/01~2026/07/01`) — the source really says so. `??~2016/11/03` lands obtained-only. All four cases get explicit regression tests; no behavior change.
- **R20.3 — Content-coverage sweep**: new `tests/test_legacy_coverage.py` (skipif `data/財產們` absent) — parser-level, per sheet: for each built acquisition, join every payload field (source, dates, remark, item names/alias/spec/remark/url, parameter values/units, factor values/currencies) into a searchable blob; assert each raw 項目 cell, 購買地點 cell, and each non-empty 備註 LINE from that acquisition's rows appears (substring, whitespace-normalized) in the blob; date/price/currency cells are exempt (transformed by design, covered by the date/factor tests). Misses report sheet+row context. This makes ANY future content-dropping parser change fail the suite.
- **R20.4 — Tree-drag stability**: iteration-18 rendering removed the active row + subtree during tree drags → layout reflow (“jitter”). Fix: render the FULL row list during drags (active row + subtree stay in place, dimmed like the flat pane's source row); maintain `activeSubtreeIds`; `over` inside that set → indicator cleared, drop ignored; valid targets keep mapping through the subtree-EXCLUDED working list (projection/cycle safety unchanged).
- **R20.5 — Plural audit inventory**: en-US keys converted to ICU plural: `common.entityOps.pagination.total`, `pages.finance.accounts.delete.confirm`, `pages.io.export.downloadZip`, `pages.io.import.panel.missingCsv` (verb agreement too), `pages.io.sync.status.ahead/behind`, `pages.io.sync.publish.success`, `pages.inventory.acquisitions.delete.confirm`, `pages.inventory.catalog.rowCount`, `pages.inventory.params.deleteBody` (verb agreement). zh-TW untouched.

### Terminology delta
- **Content-coverage sweep** = the FR-029d pytest asserting every legacy text fragment survives into parser payloads; **active subtree** = the dragged tree row plus its descendants, rendered dimmed and excluded from drop targets.

## Iteration 21 research (flat-mode Edit link, 2026-07-12)

- **R21.1 — Root cause (CONFIRMED)**: the Catalog actions cell renders the acquisition Edit hyperlink only inside the `isAcquisition(r)` branch; flat mode (item-level filter/sort) yields exclusively item rows → no Edit anywhere, and since iteration 19 Edit is the sole path to Delete. Fix: the item-row branch adds the parent acquisition's Edit link when `flatMode && r.acquisition` (same href + SPA left-click interception); tree-mode child rows unchanged (parent row already carries it). Locked by RTL (flat rows expose the anchor; tree child rows don't) and the flatten e2e.

## Iteration 22 research (modal row geometry, 2026-07-13)

- **R22.1 — Root cause (MEASURED live)**: modal rows used `List.Item actions`, which renders `ul.ant-list-item-action` (margin-left 48px) with `li { padding: 0 8px 0 0 }` — the trailing edge is styled by the library, not us; the iteration-21 padding zeroing addressed only the List.Item shell. Fix: drop the `actions` slot; each row renders its own flex container (content flex-1 minWidth-0, action flex-none, zero horizontal padding). Regression lock is GEOMETRIC (e2e boundingBox): button.right within 2px of row.right, row.right within 2px of the modal body content edge, asserted for enabled AND disabled-member rows; RTL asserts no `.ant-list-item-action` exists in the modal.

## Iteration 23 research (date cells + strikethrough, 2026-07-13)

- **R23.1 — Named-row root causes (MEASURED from raw HTML)**: 金子眼鏡 (2015): date cell literal `-` → both dates None (data invisible under date-driven views); MUJI 懶骨頭沙發 (2020): three-line cell `2020/05/09 / ~2020/05/10(本體) / ~2020/05/11(椅套)` — the naive `~`-split produced an unparseable right side → obtained None, annotations dropped; 27吋軟殼行李箱 (2016): `2016/02/??` → digit-guard passed but the importer's strict ISO regex nulled it. Systemic hole: FR-029d's sweep EXEMPTED date cells. Strikethrough inventory: 2019 `.s8` (2 struck item names), 2022 `.s6`/`.s5` (struck 鴻葉投影儀支架 row incl. its `2022/05/07~` date). Fixes: date-token normalizer (missing/`??` day → month end, leap-aware), complex-cell rule (latest date = obtained, leading `date~` = requested, FULL cell text → acquisition.remark), EOY default from the sheet filename year, `<style>`-derived `struck` cell markers with own-項目-struck rows skipped (flagged, sweep-exempt), and the sweep extended to date cells.

## Iteration 24 research (default-filter shape, 2026-07-13)

- **R24.1 — Verified**: `EntityFilterBackend` combines conditions WITHIN a group per `group.logic` ("or" supported) and ORs groups together. The iteration-17 seed used two groups only because the panel-side implication wasn't checked; one `logic:"or"` group with two conditions is semantically identical, renders as flat condition rows with a correct OR connector, and removes the nested-group boxes.

## Iteration 25 research (verbatim 備註, per-row prices, stable refs, 2026-07-13)

- **R25.1 — Price loss (MEASURED)**: Matador (2025, 蝦皮 order) is a multi-item acquisition whose continuation rows each carry their OWN 實際支付價錢 — `build_from_rows`' attachment path used row price only for factor rows, dropping item-row prices; the accumulated override held just the header's 479. Zenfone 3 (2016): single-row price 5600 became the paid override only, never `sku_price`. Fix at a new FINALIZE phase: own-price rows → sku (÷qty sans 單價); ≥2 own-price rows → override = per-currency sum; carried-price (rowspan-total) style unchanged.
- **R25.2 — Verbatim strategy**: destinations decided at finalize by item count (>1 → item.spec, =1 → acquisition.remark); parse_remark keeps extracting structured fields but stops writing spec/remark residues. Sweep: item-row 備註 lines must be findable near-verbatim.
- **R25.3 — Stable refs**: ordinal refs `year:acqIdx[:itemIdx]` from parse order; upsert keyed on them preserves PKs → scenario memberships survive re-imports. Transition stamping: per year, parser order == import creation order (imports were sequential), verified per row by (item name, source) before stamping; mismatches reported and excluded. Limitation (documented): mid-sheet insertions shift later ordinals for that year.

## Iteration 26 research (families, ranges, triplet split, ItemDisplay, 2026-07-19)

- **R26.1 — Affine temperature**: the factor-table converter can't express °F→°C; `core/units.py` generalizes to per-family `to_canonical`/`from_canonical` functions (factor-based families unchanged; temperature uses C=(F−32)×5⁄9). Canonicals: °C, s, mAh. Battery excludes Wh (energy ≠ charge; no defensible conversion).
- **R26.2 — Ranges**: parse at `compute_value_fields` (`^\s*(num)\s*[-~]\s*(num)\s*$` after the single-number attempt); store canonical min in `value_number` (existing sort/filter key — ranges sort by their minimum) and canonical max in the new `value_number_max`; `value` keeps the entered text for faithful round-trips. Editor: one text input accepting both forms beats twin inputs (matches the user's "type in either" phrasing).
- **R26.3 — Triplet gap (MEASURED)**: RE_DIMS only accepted lowercase `x/×` with 3 parts; sheets carry `X`, `*`, 2-part patterns and decimals. Split lines also minted a redundant `size` text param. Fix both; verbatim preservation (FR-029f) keeps the original text regardless.
- **R26.4 — ItemDisplay**: supersedes ad-hoc compositions in four surfaces; builds on ItemName (alias/tooltip/link/truncate) + spec + opt-in localized `key: value` parameter Tags. Dedicated `attr:` columns keep value-only cells (header = key).

## Iteration 27 research (emoji keys, price format, catalog/nav/modal polish, 2026-07-19)

- **R27.1 — Emoji storage & seeds**: `AttributeDefinition.emoji` — CharField(max_length=8, blank, default "") on core (Principle I); one migration adds the field AND stamps the system definitions (🎨 color, 👕 size, ⚖ weight, 📏 length/width/height, 🧴 volume). User-created definitions set it in the inline creation form (FR-027); no definition-edit UI exists, so seeding is the only path for system keys (user-confirmed).
- **R27.2 — Monochrome emoji**: color emoji glyphs ignore CSS `color`. The portable silhouette technique — `color: transparent; text-shadow: 0 0 0 currentColor` — renders the glyph's alpha silhouette in the inherited text color (grayscale filters only desaturate, they don't match the text color). Applied via a tiny shared `<KeyEmoji>` span used by parameterPairs consumers and the key picker.
- **R27.3 — Price format**: one `src/services/currency.ts` (or utils) module owns the symbol map — TWD/USD/HKD → $, RMB/CNY/JPY → ¥, EUR → €, GBP → £, KRW → ₩, fallback = code-only — and `formatPrice(code, value)`: zero/empty → the standard "-" placeholder (no code/symbol; matches the importer's "blank ≠ 0" spirit at render time), else `CODE symbol value` with trailing zeros dropped. `parameterPairs`-style string output keeps table cells measurable (`displayText` uses the same function). **PriceInput** = Space.Compact [Select showing the SYMBOL (options list "CODE symbol") | InputNumber right-aligned]; while the amount is empty/0 the select shows a placeholder — replaces the two ad-hoc pairs (ItemFormModal SKU price + currency; cost-factor value + currency rows).
- **R27.4 — Item column width (MEASURED)**: `displayText('item_summary')` measures `widest([name, spec, ×N])`, so a long spec drives the column width; the reported truncation-against-name-width comes from the ItemDisplay cell's `maxWidth: 100%` resolving against a shrink-to-fit ancestor. Fix per user decision: measure primary name (+ ×N) only, drop spec from measurement, and give the cell an explicit block context so the spec line ellipsises at the COLUMN width.
- **R27.5 — Right-pinned Actions**: the catalog's column-state already supports `fixed` per key (caret pinned left via defaultSticky); extend the default state so Actions carries `fixed: 'right'`, bump the persistence version so saved states migrate.
- **R27.6 — Viewport-anchored modal**: AntD Modal with a fixed `top` and `styles.body` `height: calc(100vh - <top+chrome>)` keeps the modal's bottom at a constant viewport offset; the search input stays at the top of the body and ONLY the results List scrolls (`overflow: auto` on the list wrapper). Width grows (fits the acquisition-context line). e2e locks: modal bottom within tolerance of viewport bottom at two viewport heights; search box still visible after scrolling results.
- **R27.7 — Nav links**: AppShell drives AntD Menu; item labels become React Router `<Link>` elements so every entry is a real `<a href>` (browser new-tab shortcuts work); Menu selection/highlight continues to key off the route.
- **R27.8 — Data refresh**: sheets under `data/財產們/` changed on disk; the ref-keyed upsert import (default mode) applies edits in place — appends mint new tail ordinals, edited rows update by ref, removed rows delete — scenarios/PKs survive (iteration-25 invariant). The coverage sweep + parser suite re-run against the new content BEFORE the import (they read the sheets directly).

## Iteration 28 research (numeric ranges everywhere, keyed range parsing, 2026-07-19)

- **R28.1 — Number-type ranges**: `_parse_dimension_number` already implements the single-or-range grammar; the `number` branch of `compute_value_fields` reuses it (min → `value_number`, max → `value_number_max`) — no schema change (`value_number_max` shipped in iteration 26). `attr:` sorting keeps ordering by min via the existing `value_number` annotation.
- **R28.2 — Tilde display**: `parameterValueText` renders ` ~ ` for both dimension and number ranges (user-confirmed; matches the sheets' notation). The iteration-26 e2e/RTL dash expectations update in the same change.
- **R28.3 — Keyed range capture (MEASURED)**: `RE_LENGTH = 長度[:：]\s*([\d.]+)…` captured `74` from `74~164cm`, leaving `~164cm` as blanked-line residue (verbatim spec kept the text — no loss, wrong parameter). The three keyed patterns widen to `([\d.]+(?:\s*[~-]\s*[\d.]+)?)` capturing the range text verbatim; the importer already passes `f[measure]["value"]` through to the range-aware serializer.

## Iteration 29 research (faithful drag preview, 2026-07-19)

- **R29.1 — Overlay fidelity**: dnd-kit's DragOverlay positions its wrapper at the active rect but the custom child rendered a name-only chip capped at 320px — visually unrelated to the grabbed row (and the size mismatch already caused the iteration-26 drop misprojection). Fix: onDragStart captures the active node's `getBoundingClientRect().width`; the overlay child renders the SAME `RowContent` (holder + ItemDisplay) at exactly that width inside the floating-card shell. Height then matches naturally (same content, same width). The pointer-based `after` projection stays — correctness no longer depends on overlay geometry either way.

## Iteration 30 research (keyed 寬度/高度/直徑/耐溫, range-mode input, 2026-07-19)

- **R30.1 — Sheet-wide keyed scan (MEASURED)**: exactly four unmapped `key：value` numeric patterns exist across all 12 sheets — 寬度 (1×, `3.3cm`), 高度 (1×, `1.8~8cm`), 直徑 (1×, `5.5~9cm`), 耐溫 (1×, `-40~230度C`); plus 起秤重量 (1×) deliberately left verbatim (specialized precision spec). 寬度/高度 map to existing width/height; 直徑/耐溫 need new SYSTEM definitions (no edit UI → migration-seeded, like the emoji seeds): diameter (length family, 📏), temperature (temperature family, 🌡).
- **R30.2 — Signed ranges**: `-40~230` needs a signed grammar the iteration-28 `[\d.]+` capture can't match. Parser mirrors the backend rule: minus allowed on both bounds with `~`, dash separator only before a non-negative max (avoids `-5-10` ambiguity). Backend `compute_value_fields` already accepts it. Temperature unit tokens 度C/℃/°C normalize to °C (the family's canonical symbol).
- **R30.3 — Range-mode input (user-chosen)**: an explicit mode picker beats both a syntax'd text box (undiscoverable — the complaint) and always-two-fields (ambiguous single-value entry). `RangeValueInput`: compact Select [exact|range] + one/two InputNumbers; mode seeds from the stored value (`RANGE_RE` match → range); emits canonical text so ItemParameterWrite/compute_value_fields stay unchanged; range mode requires both bounds and flags min > max inline.

## Iteration 31 research (indicator z-order, recent defaults, 2026-07-19)

- **R31.1 — Paint order**: the faithful preview (iteration 29) tracks the pointer and covers the 2px indicator in the tree. dnd-kit's DragOverlay accepts zIndex (default 999); the indicator sits in normal flow inside the pane. Lowering the overlay to 900, raising the indicator (`position: relative; zIndex: 1000` — no ancestor stacking context traps it), and dropping the preview to opacity 0.75 keeps the full-size preview AND a permanently visible target line. Locked by computed-style e2e assertions mid-drag.
- **R31.2 — Recent defaults**: reuse `listItems` with the catalog's default ordering (`-acquisition__obtained_at__nullsfirst`, ItemViewSet already supports it), limit 10, enabled only while the box is empty; `HighlightText` with an empty query renders plain text, so rows need no special-casing.

## Iteration 32 research (full currency label, 2026-07-19)

- **R32.1**: the iteration-27 `labelRender` collapsed the selected display to the bare symbol; with code sharing ($ → TWD/USD/HKD, ¥ → RMB/CNY/JPY) the selection became ambiguous — exactly the user's report. Removing `labelRender` lets AntD display the option's own `{CODE} {symbol}` label; widths already accommodate it (35–40% of compact groups).

## Iteration 33 research (finance symbols, staged deletion, 2026-07-19)

- **R33.1 — Recovery**: deleted item identified by re-running the ref-keyed upsert (missing sheet refs are recreated): `2026:3:1` restored with parameters; scenario membership (if any) is unrecoverable (cascade on the original delete). Legacy items are always recoverable this way; user-created items would not be — one more reason deletion must be staged.
- **R33.2 — Staged mutations**: Card gains `dirty`; new state `removedIds: string[]`. Save order: `Promise.all(removedIds.map(deleteItem) + dirtyCards.map(updateItem))` → `updateAcquisition(scalars, factors, newItems)` → invalidate + navigate. Failures keep the page open with the error message. Create mode unchanged (nothing persisted before submit).
- **R33.3 — Symbol registry**: `formatPrice` is used in pure/non-component code (catalog `displayText`), so a module registry beats prop threading: `setCurrencySymbols(map)` called from an AppShell effect over the shared `['finance','currencies']` query; `currencySymbol()` reads it, code-only until seeded. The invented table is deleted outright — the finance domain is the single authority (user's data: TWD NT$, CNY ¥, JPY ¥, KRW ₩, USD $).

## Iteration 34 research (reactive registry, 2026-07-19)

- **R34.1 — Race (MEASURED)**: a cold-load Playwright probe showed correct "CNY ¥ 129" cells (list query slower than currencies), but the registry is a non-reactive module variable — with a warm query cache the catalog renders pre-seed and stays code-only forever; widths measure pre-seed text either way. The hook pattern (subscribe + seed-during-render + map in memo deps) removes the ordering dependency entirely.
- **R34.2 — Second map**: `utils/finance.ts` predated inventory and carried its own symbol table (incl. codes absent from the user's finance data). It becomes registry-backed with a code fallback (its original unmapped behavior), making `finance.Currency.symbol` the only source anywhere.

## Iteration 35 research (key-value-only prices, adorned paid cells, 2026-07-19)

- **R35.1 — Prose price (MEASURED)**: iteration 20's colon-optional RE_PRICE was aimed at "單價 179 * 2 件" but over-matched prose ("原價850，搭配活動折價125" → sku 850 vs paid 725). The user's rule: no key-value pair → no extraction. Colon required for plain prices; a lookahead pattern keeps ONLY the quantity-expression colonless (both 2025 sheet styles verified: 無印 "原價 199 * 3 件 − 折價券 30" extracts; 雨傘王 "原價 650，舊換新打8折 = 520" stays prose → sku from paid 520).
- **R35.2 — Adorned paid cells (MEASURED)**: 2016 東京迪士尼 rows carry "¥4,200"/"¥10,800"/"¥2,500" in 實際支付價錢 with JPY in 貨幣; `norm_num` rejected them (no paid recorded). `extract_amount` (already used for factor remarks) handles them; blank-≠-0 semantics preserved (no digits → None).

## Iteration 36 research (remark icon, deprecated flag, per-unit dims, 2026-07-19)

- **R36.1 — Deprecated modeling**: a stored boolean beats a sentinel date (honest data; "-" renders naturally for unknown time) and keeps `status` derived (from the flag instead of the timestamp). Backfill migration: `deprecated = deprecate_time IS NOT NULL`. Catalog modal: checkbox disables the picker; payload `{deprecated: true, deprecate_time: null|iso}`; Restore `{deprecated: false, deprecate_time: null}`.
- **R36.2 — Icon placement**: ItemName's truncate mode is a block ellipsising span — icons must sit OUTSIDE it: the primary line becomes `flex` (name flex-1 minWidth 0, icons flex-none), preserving the iteration-19 tooltip behavior. Remark uses an informational tooltip (comment icon); the deprecated ⚠ is opt-in per surface (user scoped it to scenario pages).
- **R36.3 — Per-unit dims (MEASURED)**: sheet scan found `45cm * 45cm`, `50cm*90cm`, `150cm*80cm`, `183cmx 61cm`, `172cm x 58 cm x 4 mm` (mixed units!), `32cm x 20cm x 8cm`, `尺寸：S (40cm x 80cm)`, `3.5mmx1.3mm`. Patterns: `NUM UNIT sep NUM UNIT (sep NUM UNIT)?` with (mm|cm|m) longest-first and NO trailing \b (so `cmx` chains split); each part keeps its own unit. Tried before the shared-unit RE_DIMS/RE_DIMS2. The `S (40cm x 80cm)` case exposes the residue check ("S" is 1 letter → old rule dropped the size): meaningful-residue tightens to ANY letter/han/digit.
