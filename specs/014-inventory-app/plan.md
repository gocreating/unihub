# Implementation Plan: Inventory App — Iteration 3 (UI + cost model refinements)

**Branch**: `014-inventory-app` | **Date**: 2026-07-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-inventory-app/spec.md`

## Summary

Iteration 2 shipped at commit `2fc0106` (acquisition-first flow, per-field currency, unit normalization). This plan covers **iteration 3** — five clarification batches (2026-07-11) that refine the data model and UI. Net changes:

- **Deprecation lifecycle**: rename `Item.archived_at` → **`deprecate_time`**; **remove the stored `status` field** — status is now **derived** (deprecated when `deprecate_time` set, else active). "Archive" action → **"Deprecate"** (confirm dialog collects a timestamp defaulting to today 00:00) + a **"Restore"** action that clears it.
- **Cost model moves to the order**: **remove `Item.cost`/`cost_currency`**; **Acquisition gains `cost` (+currency), `discount`, `tax_refund`**, derived **`net_cost = cost − discount − tax_refund`**. The per-currency item-cost aggregation is dropped.
- **Field churn**: rename `Item.price` → **`sku_price`** (+ derived `total_price = sku_price × quantity`); add **`Item.volume`** (mL/L, canonical mL); **remove `Item.model`, `Item.serial_number`**; `quantity` becomes **required, default 1**. **Remove `Acquisition.method`**; add **`Acquisition.request_time`**.
- **Acquisition UX**: **source auto-complete** over previously-used values; the "Items in this acquisition" section becomes a **card view** (preview filled fields only); **≥1 item required to submit**, create form **pre-inserts one empty item card**; acquisition is **editable on a standalone page**; RWD row layout.
- **Constitution v1.14.0 compliance**: standalone create/edit pages (acquisition create/edit) **drop the Cancel button** and navigate via **breadcrumb**; modals put **Cancel left-most**, **don't close on outside-click while dirty**, and **stack fields on narrow screens**.
- **Bug fixes**: non-sortable table columns render **blank headers** (add explicit `title`); standardize on the single **"—"** placeholder; add an **obtained-date column** to the item list; drop the **"Add items via New Acquisition" hint**.

Approach: one schema migration (`0005`, non-atomic, with data-preserving backfills) + a reseed migration (`0006`), updated serializers/viewsets (incl. a distinct-`source` endpoint), an updated `ItemFormModal`, a reworked Acquisition create page + a new edit page, updated Items/Acquisitions lists, and refreshed i18n and tests.

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 / React 18.3 (frontend)

**Primary Dependencies**: Django 5 + DRF 3, drf-spectacular, PostgreSQL 16; Ant Design 5 + Pro Components (adds `AutoComplete` for source), TanStack React Query 5, React Router 7, react-intl. Currency pickers continue to read `GET /api/v1/finance/currencies/` (Principle II — no model import).

**Storage**: PostgreSQL 16. Item money = `sku_price` (+currency); measurements incl. `volume` store canonical + unit; lifecycle = single `deprecate_time`. Acquisition holds order payment (`cost`+currency, `discount`, `tax_refund`) and `request_time`.

**Testing**: pytest-django (backend, test-first for changed behavior); Vitest + RTL (frontend)

**Target Platform**: Desktop/tablet browsers, with explicit **responsive (RWD) stacking** now required on the acquisition form and item modal (narrow screens).

**Project Type**: Web application within the unihub monorepo (in-place refinement of the existing `inventory` app).

**Performance Goals**: Catalog ≥500 items server-paginated; default sort by indexed `acquisition__obtained_at`. Source auto-complete queries a small distinct set (personal scale).

**Constraints**: Single user; no FX conversion (`discount`/`tax_refund` share the acquisition `cost` currency); unit sets fixed; ≥1 item per acquisition invariant.

**Scale/Scope**: ~5 models (schema delta only), 4 frontend pages reworked + 1 new Acquisition edit page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* (Constitution **v1.14.0**.)

| Principle | Status | Notes for this iteration |
|-----------|--------|--------------------------|
| I. Entity-Centric (NON-NEGOTIABLE) | ✅ PASS | `0006` reseeds system `AttributeDefinition`s to the new Item/Acquisition field set (add sku_price/volume/deprecate_time; add acquisition cost/discount/tax_refund/request_time; drop cost/model/serial/status/method). |
| II. Domain Independence | ✅ PASS | Currency still a code string via the finance API — no import/FK. Unchanged. |
| III. Reference Implementation Alignment | ✅ PASS | Continues Finance/ov-fleet patterns; the source field uses AntD `AutoComplete`. |
| IV. API Contract-Driven Frontend | ✅ PASS | Schema regenerated; `src/generated/api-types.ts` refreshed; no hand-written types. |
| V. Quality Loop | ✅ PASS | Changed behavior is test-first; full backend + frontend loops must pass. |
| VI. UI/UX ov-fleet (**expanded in v1.14.0**) | ✅ PASS (design-critical) | **New rules applied**: Acquisition create/edit are standalone pages → **breadcrumb, no Cancel button**. `ItemFormModal` → **Cancel left-most, no outside-click close while dirty, fields stack on narrow screens**. Also fixes the blank-header bug and the mixed-placeholder inconsistency this principle already forbids. |
| VII. PageTable (NON-NEGOTIABLE) | ✅ PASS | Items/Acquisitions/Scenarios lists stay on `PageTable`. The acquisition "Items" section is a **card view** (a form sub-section, not a data grid) — not subject to the table rule. |
| VIII. i18n (NON-NEGOTIABLE) | ✅ PASS | New/renamed keys (sku_price, volume, deprecate/restore, request_time, cost/discount/tax_refund/net_cost, card view, autocomplete) in BOTH locales; removed keys pruned from both. |
| IX. Base Currency Net Worth | ➖ N/A | Inventory does no FX valuation; acquisition cost is a single-currency amount. |
| X / XI. Charts | ➖ N/A | No charts. |
| XII. Entity Toolbar & Sort | ✅ PASS | List sort/filter/columns unchanged in mechanism; filterable/ordering fields updated (drop cost/model/serial; add sku_price/volume). Every column now carries an explicit `title` (bug fix). |
| Dev Constraint: Delete confirmation | ✅ PASS | Deprecate (with timestamp) and acquisition delete keep `Modal.confirm`/dialog with `okType:'danger'`. |

**Result**: All gates pass. Principle VI (v1.14.0) is the design-critical one and is directly satisfied by the page/modal button rules. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file (iteration 3)
├── research.md          # Refreshed decisions (R1–R9)
├── data-model.md        # Refreshed entity definitions
├── quickstart.md        # Refreshed walkthrough
├── contracts/inventory-api.md   # Refreshed REST contract (+ source autocomplete)
└── tasks.md             # Regenerated by /speckit-tasks
```

### Source Code (delta from commit 2fc0106)

```text
apps/unihub/backend/inventory/
├── models.py            # Item: price→sku_price, +volume_*, archived_at→deprecate_time, −status,−model,−serial,
│                        #        −cost,−cost_currency, quantity NOT NULL default 1
│                        # Acquisition: −method, +request_time, +cost,+cost_currency,+discount,+tax_refund
├── migrations/0005_iter3_fields.py     # renames + adds + removes + backfills (non-atomic; quantity null→1;
│                        #                acquisition.cost ← sum(item.cost) before dropping item.cost)
├── migrations/0006_reseed_system_attrs.py
├── serializers.py       # Item: sku_price, volume {value,unit}, derived total_price + status; drop cost/model/serial
│                        # Acquisition: request_time, cost/discount/tax_refund + derived net_cost; nested items ≥1;
│                        #              drop method + total_item_cost
├── views.py             # Item filter/order fields updated; Acquisition drop method; NEW distinct-source action
└── ...
apps/unihub/backend/tests/   # update test_inventory_* (deprecate/restore, cost-on-acquisition, volume, ≥1-item, sources)

apps/unihub/frontend/src/
├── pages/inventory/items/ItemFormModal.tsx  # +volume, sku_price rename, −model/serial, −status select,
│                        #  quantity required/default 1, currency-disable, RWD stack, Cancel left-most, dirty-guard
├── pages/inventory/items/index.tsx          # blank-header fix, obtained_at column, −model/serial cols,
│                        #  Deprecate(+timestamp)/Restore actions, derived status tag, single "—", remove hint
├── pages/inventory/acquisitions/new.tsx     # card view + default item card + ≥1 required; source AutoComplete;
│                        #  +request_time/cost/discount/tax_refund; no method; no Cancel (breadcrumb); RWD row
├── pages/inventory/acquisitions/edit.tsx    # NEW standalone edit page (same form, prefilled)
├── pages/inventory/acquisitions/index.tsx   # blank-header fix; drop method col; show net_cost; edit → standalone page
├── services/unihub-backend/inventory.ts     # types + endpoints for the new shape (+ listSources)
├── generated/api-types.ts                   # regenerated
├── App.tsx                                   # register /inventory/acquisitions/:id/edit
└── locales/{en-US,zh-TW}/pages.ts           # add/rename/prune keys in both
```

**Structure Decision**: In-place refinement of the existing `inventory` app. One structural addition: a standalone **Acquisition edit page** (mirroring the create page). The "Items in this acquisition" UI shifts from a list to a **card view** within the acquisition form.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
