---
description: "Task list for Inventory App — Iteration 13 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 13 (Catalog derived columns & density)

**Input**: [plan.md](plan.md) (iteration 13), [spec.md](spec.md) — Session 2026-07-12 "catalog derived columns & density", FR-003 (revised), FR-003a (new), FR-024 (revised); constitution **v1.18.0** (two-row datetime).

**Tests**: REQUIRED — constitution Principle V is test-first (red-green-refactor); frontend tests precede implementation per project TDD practice.

**Baseline**: Iteration 12 shipped at commit `102124e`. This iteration is a **delta**; tasks modify existing files unless marked NEW. Earlier iterations' task lists are in git history.

**Organization**: This iteration refines **User Story 1 (Catalog and manage items, P1)**; the acquisition-form badge extraction brushes US2's surface but is a shared foundational refactor.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: different files, no dependency on an incomplete task
- Backend: `apps/unihub/backend/inventory/` & `.../tests/`; Frontend: `apps/unihub/frontend/src/`

---

## Phase 1: Setup

*(none — existing app, no migrations, no new dependencies)*

---

## Phase 2: Foundational (contract change + shared helpers)

**Purpose**: The nested `net_cost` contract chain and the shared renderers every catalog task depends on. Contract regen MUST precede frontend consumption (Principle IV).

- [ ] T001 Write failing pytest: item list/detail responses include read-only `acquisition.net_cost` (per-currency aggregation, same shape as top-level `Acquisition.net_cost`; empty list when no factors) in `apps/unihub/backend/tests/test_inventory_items.py`
- [ ] T002 Add `net_cost` `SerializerMethodField` to `AcquisitionSummarySerializer` (reuse/share the `AcquisitionSerializer.get_net_cost` per-currency aggregation; type hints + Google-style docstring) in `apps/unihub/backend/inventory/serializers.py`; T001 green; run `uv run ruff format . && uv run ruff check . --fix && uv run pytest` from `apps/unihub/backend/`
- [ ] T003 Regenerate the OpenAPI schema (contracts regen command → `specs/014-inventory-app/contracts/openapi.yaml`) and the generated frontend types (`openapi-typescript` → `apps/unihub/frontend/src/generated/`); surface `net_cost: NetCostEntry[]` on the nested acquisition type consumed via `apps/unihub/frontend/src/services/unihub-backend/inventory.ts` (no hand-written response types)
- [ ] T004 [P] Write failing Vitest specs for a shared two-row datetime cell — absolute `YYYY-MM-DD HH:mm` primary row, `fromNow()` relative as muted secondary row, null → standard "—" — in `apps/unihub/frontend/src/components/DateTimeCell/DateTimeCell.test.tsx` (NEW)
- [ ] T005 [P] Implement `DateTimeCell` (named export; secondary row `Typography.Text type="secondary"`; constitution v1.18.0) in `apps/unihub/frontend/src/components/DateTimeCell/index.tsx` (NEW); T004 green
- [ ] T006 [P] Write failing Vitest specs for extracted badge helpers: `itemCardBadges` keeps current card behaviour AND `parameterBadges()` returns formatted value+unit strings for exactly the non-empty of color, weight, length, width, height, volume, size (trailing zeros dropped) in `apps/unihub/frontend/src/pages/inventory/itemBadges.test.ts` (NEW)
- [ ] T007 [P] Extract `itemCardBadges` from `apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionForm.tsx` into `apps/unihub/frontend/src/pages/inventory/itemBadges.ts` (NEW; named exports `itemCardBadges`, `parameterBadges`; accepts write + read item shapes); update `AcquisitionForm.tsx` to import it; T006 green
- [ ] T008 [P] Add iteration-13 i18n keys to BOTH `apps/unihub/frontend/src/locales/en-US/pages.ts` and `apps/unihub/frontend/src/locales/zh-TW/pages.ts`: derived column labels ("Item", "Parameters", "Acquisition") plus Color, Volume, URL, Deprecate-time column labels (reuse existing keys where present; both locales in the same commit)

**Checkpoint**: Backend green, contract types regenerated, shared helpers tested.

---

## Phase 3: User Story 1 — Catalog and manage items (P1)

**Goal**: Dense, hierarchy-readable Catalog — three derived presentation columns, hidden-by-default real columns (all toggleable; URL-dropdown bug fixed), two-row datetimes, item rows without Delete.

**Independent Test**: With acquisitions+items seeded, the Catalog defaults to caret | Acquisition | Item | Quantity | SKU price | Parameters | Actions; parent rows read `{source} {net cost}` + date range; item rows show name-link/spec and parameter badges; the column dropdown lists every real column (name, url, spec, source, Requested, Obtained, net cost, status, color, size, weight, length, width, height, volume, deprecate_time) as hidden-but-toggleable; Requested/Obtained when shown render two-row datetime; item rows offer only Deprecate/Restore.

- [ ] T009 [US1] Write failing RTL specs in `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx` covering: (a) default visible order Acquisition, Item, Quantity, SKU price, Parameters, Actions under persistence key `inventory-catalog-v3`; (b) Item cell = name hyperlink (`target="_blank" rel="noopener"` when `url`) primary + ellipsised spec secondary only when non-empty; (c) Parameters cell = one `<Tag>` per non-empty color/weight/length/width/height/volume/size with Tooltip, "—" when none; (d) Acquisition cell = `{source} {net cost}` primary ("Untitled" fallback; multi-currency comma-joined) + `request ~ obtained` date-only secondary ("—" for a missing side; secondary omitted when both absent) on tree parents AND flat-mode item rows; (e) Requested/Obtained toggled visible render two-row datetime; (f) item-row actions = Deprecate/Restore only (no Delete); acquisition rows keep Edit + Delete; (g) column dropdown lists url/color/volume/deprecate_time; (h) derived columns expose no sort controls
- [ ] T010 [US1] Rework the column model in `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`: `columnDefs` = 3 derived + all real columns with `visible:false` except Acquisition/Item/Quantity/SKU price/Parameters/Actions, order per FR-003; `useEntityTable` key → `inventory-catalog-v3`; extend `ITEM_KEYS` (+`color`, `volume_canonical`) and `filterableAttrs` (+color text, +volume number, +deprecate_time date); derived keys excluded from both
- [ ] T011 [US1] Implement renderers in `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`: derived Item / Parameters (`parameterBadges`) / Acquisition (incl. flat-mode via `r.acquisition.net_cost`); url column as clickable ellipsised link; color / volume / deprecate_time columns; Requested/Obtained/deprecate_time via `DateTimeCell`; item-row actions drop Delete; extend `displayText()` so `dataWidths` measures derived + two-row cells as max(primary, secondary) per row (no width floors); T009 fully green
- [ ] T012 [US1] Update Playwright e2e `apps/unihub/frontend/e2e/inventory-catalog.spec.ts`: "Requested column present" → "hidden by default + available in the column dropdown (two-row datetime when shown)"; add assertions for the default derived-column set, parameter badges on an item row, and item rows exposing no Delete; adjust selectors relying on removed default columns

**Checkpoint**: Catalog matches FR-003/FR-003a; RTL + e2e green.

---

## Phase 4: Polish & Cross-Cutting

- [ ] T013 Run the full frontend quality loop from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build = `tsc -b`, stricter than typecheck) — zero warnings; fix fallout
- [ ] T014 Verify against the live stack (backend up + `pnpm dev`): default column set, badges, flat-mode Acquisition summary after an item-column sort, two-row datetimes, no item Delete; run the Playwright suite; capture an iteration screenshot

---

## Dependencies & Execution Order

- **Phase 2**: T001 → T002 → T003 (contract chain, sequential); T004→T005, T006→T007, and T008 run in parallel with it.
- **Phase 3**: T009 (tests first; needs T005/T007/T008 to import helpers/keys) → T010 → T011 (same file, sequential) → T012. T011 additionally needs T003's regenerated types.
- **Phase 4**: T013 → T014 last.

```text
T001 → T002 → T003 ─┐
T004 → T005 ─────────┼→ T009 → T010 → T011 → T012 → T013 → T014
T006 → T007 ─────────┤
T008 ────────────────┘
```

## Parallel Example

Foundational tracks concurrently: `T001–T003` (backend + contract), `T004–T005` (DateTimeCell), `T006–T007` (badge extraction), `T008` (i18n) — different files, no cross-dependencies.

## Implementation Strategy

Single-story iteration (US1). MVP = Phases 2+3 (T001–T012); Phase 4 gates the commit. Every code task lands with its tests; both locale files update in the same commit as any new key (Principle VIII).
