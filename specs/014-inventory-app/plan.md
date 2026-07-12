# Implementation Plan: Inventory App — Iteration 13 (Catalog derived columns & density)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-inventory-app/spec.md` — Session 2026-07-12 (catalog derived columns & density, iteration 13), FR-003 (revised), **FR-003a** (new), FR-024 (revised), plus constitution **v1.18.0** (two-row datetime display).

## Summary

The Catalog's tree table is hard to read: two entity types share 14 columns, so most cells are structural "—" placeholders, and hierarchy is weak. Iteration 13 restructures presentation only (no data-model change):

1. **Three read-only derived columns** — **"Item"** (name-as-link primary / spec secondary), **"Parameters"** (Tag badges for non-empty color, weight, length, width, height, volume, size), **"Acquisition"** (`{source} {net cost}` primary / `request ~ obtained` date-range secondary, no item count; parent rows in tree mode, own-acquisition summary on item rows in flat mode).
2. **Default visible set shrinks** to caret | Acquisition, Item, Quantity, SKU price, Parameters | Actions; all real columns (name, url, spec, source, Requested, Obtained, net cost, status, color, size, weight, length, width, height, volume, deprecate_time) become hidden-by-default but individually toggleable — fixing the "URL column missing from the dropdown" bug (it was removed entirely in iteration 9) and adding color/volume/deprecate_time as first-time catalog columns. Persistence key bumps to **v3**.
3. **Two-row datetime** (constitution v1.18.0): Requested/Obtained (and deprecate_time) render absolute `YYYY-MM-DD HH:mm` primary + relative secondary, replacing the date-only single-line override.
4. **Item rows lose Delete** — only Deprecate/Restore remain (hard delete lives on the acquisition edit page / acquisition delete).

Backend surface: one serializer addition — `net_cost` on the nested `AcquisitionSummarySerializer` (ItemSerializer.acquisition) so flat mode can render the Acquisition derived column → OpenAPI + generated-types regen (Principle IV). Color/volume filter+sort support already exists on `ItemViewSet` (iteration 9); no viewset or model change.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend), Python 3.12 (backend)

**Primary Dependencies**: React 18.3, Ant Design 5.24 + Pro Components 2.8, TanStack React Query 5, dayjs (relativeTime plugin already registered); Django 5 + DRF 3 + drf-spectacular

**Storage**: PostgreSQL 16 — **no schema change this iteration** (presentation-only; the one backend change is a derived serializer field)

**Testing**: Vitest + RTL (`CatalogPage.test.tsx` extended), pytest-django (nested `net_cost` serializer test), Playwright e2e (FR-024 "Requested" assertion updated)

**Target Platform**: unihub dashboard SPA (desktop/tablet)

**Project Type**: Web application (monorepo: `apps/unihub/frontend` + `apps/unihub/backend`)

**Performance Goals**: No regression to catalog width measurement / no flash-jitter guarantees (FR-003); badge rendering adds O(items × 7) cheap formats

**Constraints**: Derived columns are display-only (no sort/filter — documented exception); `dataWidths` measurement must include the derived columns' rendered text (two-row cells measure by their widest row)

**Scale/Scope**: 1 page rewrite ([catalog/index.tsx](../../apps/unihub/frontend/src/pages/inventory/catalog/index.tsx)), 1 shared badge helper extraction, 1 serializer field + schema/type regen, i18n keys ×2 locales, RTL + pytest + e2e updates

## Constitution Check

*GATE evaluated against constitution v1.18.0 — pre-Phase-0: PASS; re-checked post-Phase-1: PASS.*

| Principle | Gate | Status |
|---|---|---|
| I Entity-centric + data_io | No model/schema change → no `TableDescriptor` update required | PASS (no-op) |
| II Domain independence | No cross-domain imports; currency stays a code string | PASS |
| III Reference alignment | PageTable/EntityToolbar patterns reused; no new libraries | PASS |
| IV Contract-driven frontend | `AcquisitionSummarySerializer.net_cost` → regen `openapi.yaml` → `openapi-typescript` BEFORE frontend consumes it; no hand-written response types | PASS (task-ordered) |
| V Quality loop + TDD | Tests written first (RTL for derived columns/actions/datetime; pytest for nested net_cost); `pnpm lint/typecheck/test/build` + `ruff`/`pytest` | PASS |
| VI Datetime two-row (v1.18.0) | Requested/Obtained/deprecate_time cells: absolute primary + relative secondary rows | PASS (this iteration implements it) |
| VI Empty placeholder | "—" secondary/non-selectable stays the sole placeholder (`columnEmptyText={false}`) | PASS |
| VII PageTable layout | Same PageTable structure; only columns/renderers change; widths via `widthForHeader`/`measureTextWidth`/`computeScrollX` | PASS |
| VIII i18n | New keys (`pages.inventory.catalog.col.item/parameters/acquisition`, `col.color/volume/deprecateTime/url`) in BOTH locales, same commit | PASS |
| XII Toolbar/sort | Derived columns display-only; real columns keep `makeSortProps`; column-config key versioned v3 (remount key already derives from visible columns) | PASS |

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file (iteration 13)
├── research.md          # + "Iteration 13 research" section (decisions R13.*)
├── data-model.md        # UNCHANGED (no schema change; note appended)
├── quickstart.md        # unchanged
├── contracts/           # openapi.yaml regenerated (nested acquisition.net_cost)
└── tasks.md             # /speckit-tasks output (iteration 13 tasks)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── inventory/serializers.py        # AcquisitionSummarySerializer + net_cost (SerializerMethodField)
└── tests/test_inventory_*.py       # + nested net_cost assertion (test-first)

apps/unihub/frontend/src/
├── pages/inventory/
│   ├── catalog/index.tsx           # Column defs (hidden defaults, v3 key), 3 derived columns,
│   │                               #   two-row datetime cells, item-row actions (no Delete),
│   │                               #   ITEM_KEYS + filterableAttrs + color/volume/deprecate_time
│   ├── catalog/CatalogPage.test.tsx# RTL first: derived cells, badges, dropdown completeness,
│   │                               #   no item Delete, two-row datetime
│   └── acquisitions/AcquisitionForm.tsx  # itemCardBadges → import from shared helper
├── pages/inventory/itemBadges.ts   # EXTRACTED shared badge/format helpers (card + Parameters)
├── components/datetime (or utils)  # small two-row <DateTimeCell> helper (reusable, Principle VI)
├── services/unihub-backend/inventory.ts  # regen types: Item.acquisition gains net_cost
└── locales/{en-US,zh-TW}/pages.ts  # new column keys (both locales, same commit)

apps/unihub/frontend/e2e/           # FR-024: Requested assertion → hidden-by-default + dropdown
```

**Structure Decision**: Existing web-app monorepo layout; iteration touches the inventory frontend page, one shared helper module, two locale files, one backend serializer, and regenerated contract types.

## Phase 0 — Research (output: research.md § Iteration 13)

All unknowns resolved by codebase inspection — no NEEDS CLARIFICATION remain:

- **R13.1 Column visibility**: `ColumnDef.visible: false` is already honored by `useColumnConfig`/ColumnPanel — hidden-by-default needs no toolbar changes; only the catalog's `columnDefs` array + key bump `inventory-catalog-v2 → v3`.
- **R13.2 Badge precedent**: `itemCardBadges()` (AcquisitionForm.tsx:130) already formats value+unit strings with ellipsised `<Tag>` + Tooltip — extract to a shared module; Parameters uses the color/weight/length/width/height/volume/size subset.
- **R13.3 Flat-mode Acquisition summary**: `ItemSerializer.acquisition` (AcquisitionSummarySerializer) lacks `net_cost` → add `SerializerMethodField` reusing `AcquisitionSerializer.get_net_cost` logic; regen schema/types before frontend work (Principle IV).
- **R13.4 Backend filter/sort for color/volume**: already present on ItemViewSet (`color`, `volume_canonical`) — frontend just adds them to `filterableAttrs`/`ITEM_KEYS` (flatten triggers) and column defs.
- **R13.5 Two-row cells vs width measurement**: `displayText()`/`dataWidths` measure per column; two-row cells measure `max(primary, secondary)` line — extend `displayText` accordingly so `widthForHeader` stays correct (no floors).
- **R13.6 Datetime**: `dayjs.extend(relativeTime)` already registered at app entry; a small shared two-row cell renderer implements constitution v1.18.0 (absolute `YYYY-MM-DD HH:mm` primary, `fromNow()` secondary muted).

## Phase 1 — Design & Contracts

- **data-model.md**: unchanged — appended a one-line iteration-13 note (presentation-only; no migrations).
- **Contracts**: regen `openapi.yaml` after the serializer change; regen `src/generated` types via `openapi-typescript`. The only contract delta: `Item.acquisition` gains read-only `net_cost: NetCostEntry[]`.
- **Quickstart**: unchanged.
- **Agent context**: CLAUDE.md SPECKIT block updated to describe iteration 13.

## Complexity Tracking

*(no constitution violations — intentionally empty)*
