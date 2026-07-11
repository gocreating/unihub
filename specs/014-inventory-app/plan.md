# Implementation Plan: Inventory App — Iteration 4 (cost factors, merged Catalog, cleanups)

**Branch**: `014-inventory-app` | **Date**: 2026-07-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-inventory-app/spec.md`

## Summary

Iteration 3 shipped at commit `a7a0ea2`. This plan consolidates the clarifications recorded after it (five clarify sessions) into one iteration-4 delta:

- **Cost model → cost factors**: replace the scalar `Acquisition.cost`/`cost_currency`/`discount`/`tax_refund` with a **`CostFactor`** child entity `{value (signed), currency, type}` (type ∈ accumulated/shipping/discount/tax_refund/paid_by_other/other — **informational label, does not set the sign**). Derived read-only **`net_cost` grouped by currency**. **≥1 factor**; on create an `accumulated` factor auto-derives its value from Σ item `total_price`, overridable/resettable.
- **Item field cleanups**: `quantity` becomes an **integer**; **remove `item_type`** (and the consumable/stockable concept). The scenario checklist's **shortfall is removed** (no quantity-based warning; `required_quantity` stays for planning).
- **Merged "Catalog" page**: combine the Items and Acquisitions lists into **one expandable-tree table** — acquisition parent rows (acquisition columns) expand to item child rows (item columns), columns unioned. Single **"Catalog"** nav entry (Inventory section) + "Scenarios"; legacy `/inventory/items` and `/inventory/acquisitions` list routes **redirect**. **Item rows drop the Edit action** (items edited via the acquisition edit page); item rows keep Deprecate/Restore + Delete; acquisition rows keep Edit + Delete. Adds an **obtained-date column** and a **`deprecate_time` column**; single **"—"** placeholder (`columnEmptyText={false}`).
- **Acquisition page polish**: section title **"Acquisition"** (not "New Acquisition") on create & edit; edit breadcrumb **Acquisitions / {id} / Edit Acquisition**; `request_time` **defaults to today 00:00**.
- **Content-width RWD**: acquisition form + item modal fields **stack to one full-width column** based on the **content width** (not just viewport) — via a container-width hook.
- **Critical bug fix**: editing an item card on the acquisition page **must persist** (FR-021a).
- **Carries forward**: the already-written `columnEmptyText={false}` placeholder fix (moves into the merged Catalog table).

Approach: one schema migration (`0007`, non-atomic, data-preserving) creating `CostFactor` (backfilling one `accumulated` factor per acquisition from the dropped scalar cost) + dropping `item_type`/scalar cost fields and making `quantity` integer; a reseed migration (`0008`); updated serializers/viewsets (nested `cost_factors`, per-currency `net_cost`, no `item_type`, no shortfall); a rewritten frontend built around a new **CatalogPage** (expandable tree) replacing the two list pages, a **CostFactors** editor on the acquisition form, an integer quantity + no-type `ItemFormModal`, a container-width RWD hook, and the item-edit-persistence fix. i18n + tests refreshed.

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 / React 18.3 (frontend)

**Primary Dependencies**: Django 5 + DRF 3, drf-spectacular, PostgreSQL 16; Ant Design 5 + Pro Components (`ProTable` expandable rows for the tree; `AutoComplete` for source), TanStack React Query 5, React Router 7, react-intl. Currency pickers still read `GET /api/v1/finance/currencies/` (Principle II — no import).

**Storage**: PostgreSQL 16. New `inventory_costfactor` table (FK → Acquisition, CASCADE). Item drops `item_type`; `quantity` becomes integer. Acquisition drops scalar cost fields.

**Testing**: pytest-django (backend, test-first for changed behavior); Vitest + RTL (frontend)

**Target Platform**: Desktop/tablet browsers; **content-width responsive** stacking now mandated (a collapsed-sidebar-narrow content area must stack, so breakpoints are container-based, not raw viewport).

**Project Type**: Web application within the unihub monorepo (in-place refinement of the `inventory` app).

**Performance Goals**: Catalog tree server-paginated by acquisition (parents); each acquisition's items load with it (nested). Default sort by indexed `acquisition.obtained_at`.

**Constraints**: Single user; no FX (per-currency `net_cost`); ≥1 item and ≥1 cost factor per acquisition; integer quantity.

**Scale/Scope**: 6 models (adds CostFactor). Frontend: two list pages replaced by one CatalogPage; new CostFactors editor; ItemFormModal + AcquisitionForm reworked.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* (Constitution **v1.14.0**.)

| Principle | Status | Notes for this iteration |
|-----------|--------|--------------------------|
| I. Entity-Centric (NON-NEGOTIABLE) | ✅ PASS | `0008` reseeds system `AttributeDefinition`s: Item drops `item_type`; Acquisition drops scalar cost fields; a **CostFactor** content-type is seeded (value/currency/type). |
| II. Domain Independence | ✅ PASS | Currency still a code string via the finance API — no import/FK. Unchanged. |
| III. Reference Alignment | ✅ PASS | Continues Finance/ov-fleet patterns; the merged tree uses `ProTable` expandable rows (still `PageTable`). |
| IV. API Contract-Driven Frontend | ✅ PASS | Schema regenerated; types refreshed; no hand-written types. |
| V. Quality Loop | ✅ PASS | Changed behavior test-first; full backend + frontend loops. |
| VI. UI/UX ov-fleet (v1.14.0) | ✅ PASS | Standalone acquisition create/edit keep breadcrumb + no Cancel; modals keep Cancel-left + dirty-guard; **RWD now content-width based**; single "—" placeholder; every column has a header. |
| VII. PageTable (NON-NEGOTIABLE) | ✅ PASS | The merged Catalog is a **`PageTable`** with `expandable` rows (acquisition parent → item children) — still the mandated table component. The acquisition "items" editor stays a card view within the form. |
| VIII. i18n (NON-NEGOTIABLE) | ✅ PASS | New/renamed keys (Catalog, cost-factor types, net_cost, no type/shortfall) in BOTH locales; removed keys pruned. |
| IX. Base Currency Net Worth | ➖ N/A | No FX; `net_cost` grouped by currency. |
| X / XI. Charts | ➖ N/A | No charts. |
| XII. Entity Toolbar & Sort | ✅ PASS | Catalog filter/sort/columns via the toolbar; item_type/shortfall filters removed; acquisition + item columns unioned with explicit titles. |
| Dev Constraint: Delete confirmation | ✅ PASS | Acquisition delete (cascade) and item deprecate/delete keep `Modal.confirm`/dialog with `okType:'danger'`. |

**Result**: All gates pass. The merged tree remains on `PageTable` (VII) and RWD/placeholder rules satisfy VI. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file (iteration 4)
├── research.md          # Refreshed decisions (R1–R8)
├── data-model.md        # Refreshed entities (+ CostFactor)
├── quickstart.md        # Refreshed walkthrough
├── contracts/inventory-api.md   # Refreshed REST contract (cost factors, net_cost)
└── tasks.md             # Regenerated by /speckit-tasks
```

### Source Code (delta from commit a7a0ea2)

```text
apps/unihub/backend/inventory/
├── models.py            # Item: −item_type, quantity → IntegerField; Acquisition: −cost/−cost_currency/
│                        #   −discount/−tax_refund; NEW CostFactor(value signed, currency, type, FK→Acquisition CASCADE)
├── migrations/0007_cost_factors.py   # non-atomic: create CostFactor; backfill one 'accumulated' factor per
│                        #   acquisition from old cost/discount/tax_refund; drop item_type + scalar cost; quantity → int
├── migrations/0008_reseed_system_attrs.py
├── serializers.py       # Item: drop item_type; quantity int; total_price/status derived (unchanged)
│                        # Acquisition: nested cost_factors (≥1, ≥1 'accumulated' default); net_cost grouped by currency
│                        # NEW CostFactorSerializer
├── services.py          # checklist: REMOVE shortfall; keep progress + constraint violations
├── views.py             # Item filter/order: drop item_type; Acquisition: cost-factor nested writes; sources unchanged
└── ...
apps/unihub/backend/tests/   # update test_inventory_* (cost factors/net_cost, no item_type, integer quantity, no shortfall,
                             #   item-edit persistence via acquisition PATCH); drop consumable-shortfall test

apps/unihub/frontend/src/
├── pages/inventory/catalog/index.tsx   # NEW merged Catalog: PageTable expandable tree (acquisition parents → item children);
│                        #   union columns; item rows: Deprecate/Restore/Delete (no Edit); acquisition rows: Edit/Delete;
│                        #   New Acquisition action; obtained + deprecate_time columns; columnEmptyText={false}
├── pages/inventory/acquisitions/AcquisitionForm.tsx   # +CostFactors editor (list of {value,currency,type}, accumulated
│                        #   auto-derive/override/reset, live per-currency net_cost); title "Acquisition"; edit breadcrumb
│                        #   3 crumbs; request_time default today 00:00; FIX item-card edit persistence; content-width RWD
├── pages/inventory/items/ItemFormModal.tsx   # remove item_type select; quantity integer; content-width RWD
├── hooks/useContainerWidth.ts   # NEW — container-width breakpoint for RWD stacking
├── services/unihub-backend/inventory.ts   # types: Item (no item_type, integer quantity), Acquisition (cost_factors,
│                        #   net_cost per currency; no scalar cost), CostFactor; drop shortfall
├── App.tsx              # route /inventory/catalog; redirect /inventory/items & /inventory/acquisitions → catalog
├── components/AppShell/AppShell.tsx   # nav: Inventory → Catalog + Scenarios (drop Items/Acquisitions entries)
├── generated/api-types.ts             # regenerated
└── locales/{en-US,zh-TW}/{menu,pages}.ts   # Catalog + cost-factor keys; prune item_type/shortfall/method-era keys
```

**Structure Decision**: In-place refinement. The two list pages (`items/index.tsx`, `acquisitions/index.tsx`) are replaced by one **`catalog/index.tsx`** (expandable tree); a **CostFactors** editor is added to the acquisition form; a **`useContainerWidth`** hook backs content-width RWD. Backend adds one child entity (`CostFactor`).

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

---

# Iteration 5 (catalog & cost UI refinements) — delta plan

**Date**: 2026-07-11 | Builds on iteration 4 (commit `57441be`). Spec clarifications: `### Session 2026-07-11 (catalog & cost UI, iteration 5)`.

## Summary

A UI/behaviour refinement of the cost panel and the Catalog, plus three data-model changes:

1. **CostFactor `type` → free-form string** — drop the DB `choices` constraint; the six built-ins become autocomplete suggestions. `accumulated` is system-reserved. The seeded `type` AttributeDefinition changes from `single_select` → **`text`**.
2. **CostFactor gains `display_order`** (integer) — user-defined ordering, persisted; accumulated rows pinned to top (not draggable), manual rows drag-reorderable.
3. **`accumulated` becomes per-currency** — for each distinct item currency, the system derives one `accumulated` factor (`value` = Σ `sku_price × quantity` for that currency). Uniqueness: **at most one `accumulated` per (acquisition, currency)**; not user-creatable; non-removable; overridable/resettable.

UI-only (no schema): Catalog uses an **arrow** expand icon, splits **Source**/**Name** into two columns, sizes the **Actions** column to content, and drops the **"Acquisition" badge**. The acquisition form renames **"Cost Factors" → "Cost"** and moves it **below the Items panel**; net cost moves to a **"Total" footer**; each row is `[drag] · type · value+currency (value right-aligned) · reset|remove`, full-width with vertical gaps when stacked; the **reset** action sits on each accumulated row. `obtained_at` **defaults to today 00:00** on create; the items panel is retitled **"Items"** and each **item card shows all its non-empty attribute values**.

## Technical Context (delta)

- **New frontend dependency**: a sortable-list primitive for drag reordering. **Decision: `@dnd-kit/core` + `@dnd-kit/sortable`** (small, accessible, React-18 friendly) over `react-dnd` (heavier) or ProComponents `DragSortTable` (table-oriented; the cost rows live in a form panel, not a `PageTable`). See research.md.
- **No new backend deps.** Ordering + free-form type + per-currency accumulated are serializer/model changes.
- **Migration `0009_costfactor_order_freeform`**: add `display_order` (int, default 0); relax `type` to a plain `CharField` (drop `choices`); backfill `display_order` by current `created_at` order; add a **partial unique constraint** `(acquisition, currency)` where `type='accumulated'`. Reseed the `type` AttributeDefinition as `text`. Data-preserving; `atomic` may stay default (no backfill-then-ALTER hazard, but keep `atomic = False` if the unique-constraint add follows the row backfill on Postgres).

## Phase 0 — research delta (research.md)

- **Per-currency accumulated derivation**: on create with omitted `cost_factors`, group items by `sku_price_currency`; emit one `accumulated` factor per currency = Σ(`sku_price × quantity`). On update, recompute only when the caller resets (client sends the recomputed value); the server enforces the per-currency uniqueness + system-reserved rule.
- **Free-form type validation**: non-empty string; server rejects a client-created factor with `type='accumulated'` (system-reserved) and rejects a second `accumulated` for an existing currency.
- **Ordering contract**: the client sends `cost_factors` in display order (or an explicit `display_order` per row); the server persists `display_order` = array index (accumulated rows normalised to the front). `net_cost`/Total remains order-independent.
- **DnD choice**: `@dnd-kit/sortable` for the manual-factor rows only.

## Phase 1 — design delta

- **data-model.md**: CostFactor gains `display_order`; `type` documented as free-form; accumulated documented as per-currency + unique. (updated in this iteration)
- **contracts/inventory-api.md**: `POST/PATCH /acquisitions/` accept `cost_factors[].display_order` and free-form `type`; document the accumulated per-currency + uniqueness rules and the 400s (`type='accumulated'` from a client; duplicate accumulated currency). (updated)
- **Frontend**: `catalog/index.tsx` (arrow icon via `expandable.expandIcon`; split columns; `actions` width via `useActionsColWidth`/content measure; remove badge). `AcquisitionForm.tsx` (Cost panel moved below Items; `SortableContext` for manual rows; `Total` footer; `Space.Compact` value+currency with right-aligned `InputNumber`; `AutoComplete` type field; per-row reset on accumulated; obtained default). `ItemFormModal`/item card (render every filled field).

## Constitution re-check (delta)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Entity-Centric | ✅ PASS | `0009` reseeds the CostFactor `type` AttributeDefinition as `text`; adds `display_order`. |
| IV. API Contract-Driven | ✅ PASS | Schema regenerated after the serializer change; `display_order`/free-form `type` reflected in generated types. |
| VI. UI/UX (v1.14.0) | ✅ PASS | Content-width stacking retained (rows full-width, vertical gap when narrow); single "—" placeholder; every Catalog column keeps a header (Source/Name split both titled). |
| VII. PageTable | ✅ PASS | Catalog stays a `PageTable`; the sortable cost rows live in the acquisition form panel (not a table), so no conflict. |
| VIII. i18n | ✅ PASS | "Cost"/"Total"/"Items", column titles (Source, Name), and any new copy added to BOTH locales; built-in type suggestions localised, unknown free-text rendered verbatim. |

No new violations. `@dnd-kit` is a UI primitive (no domain coupling; Principle II intact).

## Structure Decision (delta)

In-place refinement of iteration 4. Backend: one migration (`0009`) + serializer changes (per-currency accumulated, free-form type, ordering). Frontend: Catalog column/icon tweaks and an AcquisitionForm cost-panel rebuild with drag-sortable manual rows. Legacy-CSV import is tracked **separately** (see `migration-import.md`), not folded into this iteration.
