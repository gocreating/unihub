---
description: "Task list for Inventory App — Iteration 16 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 16 (Toggle column, parameter editor polish, scenario organize redesign)

**Input**: [plan.md](plan.md) (iteration 16), [spec.md](spec.md) — FR-003 (Toggle column), FR-011/FR-012 (organize redesign + `organized`), FR-026 (parameter editor). Constitution **v1.20.0**.

**Tests**: REQUIRED — test-first on both sides (pytest before move/organize rework; RTL before each frontend rework).

**Baseline**: Iteration 15 shipped at `96ae76b`. Delta iteration; design decisions pre-confirmed (research R16.1–R16.6).

**Organization**: US1 = catalog Toggle column; US2 = parameter editor (item create/edit lives in the acquisition flow); US3/US5 = scenario detail redesign (single track — the redesign is one page). Backend `organized` work is foundational for the scenario track.

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

*(none — no new dependencies; Splitter ships with installed antd 5.29.3)*

---

## Phase 2: Foundational (ScenarioItem.organized + move semantics + contracts)

- [ ] T001 Write failing pytests in `apps/unihub/backend/tests/test_inventory_scenarios.py`: (a) new membership defaults `organized=false` and serializes the field; (b) `move {organized:true, container_id, index}` organizes with dense ordering among ORGANIZED siblings only; (c) `move {organized:false}` unorganizes — container forced NULL, and the line's children re-parent to the ORGANIZED top level (organized stays true on children); (d) legacy `move {container_id, index}` without `organized` still works (treats the line as organized); (e) cycle/self still 400; (f) data_io scenarioitem round-trip carries `organized`
- [ ] T002 Implement: migration `apps/unihub/backend/inventory/migrations/0013_scenarioitem_organized.py` (boolean, default false); `organized` on `ScenarioItemSerializer`; `move` action in `apps/unihub/backend/inventory/views.py` handles the `organized` flag per R16.5; T001 green; backend loop green
- [ ] T003 Regenerate contracts: OpenAPI schema → `apps/unihub/frontend/src/generated/api-types.ts`; add `organized` to `ScenarioItem` + `moveScenarioItem(scenarioId, lineId, {container_id, index, organized})` in `apps/unihub/frontend/src/services/unihub-backend/inventory.ts` (delta already documented in `specs/014-inventory-app/contracts/inventory-api.md`)

**Checkpoint**: `organized` served and typed; move/unorganize proven by tests.

---

## Phase 3: User Story 1 — Catalog Toggle column (P1)

**Goal**: The caret column is a real "Toggle" column — listed in the Columns dropdown, pinned (sticky-left) by default, unpinnable/hideable like any other column.

**Independent Test**: Open the Catalog: the Columns dropdown lists "Toggle" (checked); the caret column is sticky-left by default (survives horizontal scroll); unchecking Toggle hides the caret column; Reset restores it pinned. Flat mode (item filter/sort) still shows no caret column.

- [ ] T004 [US1] Write failing tests: `apps/unihub/frontend/src/components/EntityToolbar/hooks/useColumnConfig.test.ts` — a `defaultSticky: {left: true}` seed makes the initial AND reset ColumnState sticky-left, user changes still win, and the async column-merge effect does not clobber a seeded value; `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx` — the Columns dropdown lists "Toggle" (checked by default), unchecking it removes the caret column, and flat mode never renders it
- [ ] T005 [US1] Implement: `defaultSticky` option threaded through `apps/unihub/frontend/src/components/EntityToolbar/{hooks/useColumnConfig.ts,useEntityTable.ts}`; in `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` replace the hardcoded prepended caret column with a `__caret` ColumnDef (label from i18n "Toggle", not sortable/filterable, content width, dropped in flat mode) + `defaultSticky` seed; bump column key if the stored v5 state would hide the new def; T004 green
- [ ] T006 [P] [US1] Locales `apps/unihub/frontend/src/locales/{en-US,zh-TW}/pages.ts`: Toggle column label key, same commit
- [ ] T007 [US1] Update Playwright `apps/unihub/frontend/e2e/inventory-catalog.spec.ts`: Columns dropdown lists "Toggle"; the caret column header is rendered sticky (`.ant-table-cell-fix-left`) by default; existing caret/flat-mode assertions still green

**Checkpoint**: FR-003 revision satisfied; RTL + e2e green.

---

## Phase 4: User Story 2 — Parameter editor polish (P1)

**Goal**: Parameter rows obey the form-grid (full-width, stacking) and user-created definitions are deletable from the key dropdown with count-confirm.

**Independent Test**: In the item form, each parameter row fills the row width and stacks on narrow content width; the key dropdown shows a delete icon ONLY on user-created definitions; deleting one warns with the affected item count, removes it from the dropdown, and clears rows using it. System keys show no delete icon.

- [ ] T008 [US2] Write failing RTL specs in `apps/unihub/frontend/src/components/ParameterRowsEditor/ParameterRowsEditor.test.tsx`: (a) rows render on the form grid (no fixed 40%/52% Space.Compact split; fields fill the row); (b) user-defined options render a delete affordance, system options don't; (c) clicking delete probes the API, shows a confirm with `affected_entity_count`, then deletes with `confirm=true`, invalidates `['core','attribute-definitions']`, and clears editor rows keyed to the deleted definition without touching others
- [ ] T009 [US2] Implement in `apps/unihub/frontend/src/components/ParameterRowsEditor/index.tsx`: rows on the form grid (Row/Col + `useContainerWidth` stacking per constitution VI); key-Select `optionRender` delete icon (mousedown stop-propagation) → two-step `deleteAttributeDefinition` count-confirm (`Modal.confirm`, danger) → query invalidation + row cleanup; T008 green
- [ ] T010 [P] [US2] Locales both `pages.ts`: delete-definition confirm title/body ("{count} items affected") + tooltip keys, same commit
- [ ] T011 [US2] Extend Playwright `apps/unihub/frontend/e2e/inventory-acquisition.spec.ts` (or the item-form spec where parameters are exercised): parameter rows span the form width (row bounding boxes ≈ form content width); delete icon absent on system keys

**Checkpoint**: FR-026 revision satisfied; live form obeys constitution VI.

---

## Phase 5: User Story 3+5 — Scenario detail redesign (P2)

**Goal**: Detail page = name/description panel + Organize panel (Add-modal search with highlight/hyperlink/disabled-members; Splitter with unorganized flat pane ↔ organized tree; bidirectional cross-pane drag; tree items only sent back).

**Independent Test**: Open a scenario: name+description sit in their own panel; no Backlog panel. "Add" opens a modal — searching lists matches with highlighted substrings, item names with URLs are links, already-added items appear disabled; adding puts the item in the left (unorganized) pane. Dragging left→right organizes (top level or nested on a node); tree rearrangement still works; dragging a tree item back to the left pane unorganizes it (its children jump to tree top level); the left pane's remove button deletes the membership. Narrow content width flips the Splitter to top/bottom. All state survives reload.

- [ ] T012 [US3] Write failing unit tests in `apps/unihub/frontend/src/pages/inventory/scenarios/organizeTree.test.ts`: `childrenOf` considers only `organized=true` lines; `computeDropTarget` ignores unorganized lines; new pure helpers for pane drops (left→right top-level append index, left→right nest-under-node, right→left send-back) return the correct `move` payloads (`{organized:true, container_id, index}` / `{organized:false}`)
- [ ] T013 [US3] Write failing RTL specs in `apps/unihub/frontend/src/pages/inventory/scenarios/ScenarioDetail.test.tsx` (rewrite): (a) standalone name/description panel, NO Backlog card; (b) Organize card header has "Add" opening the search modal; (c) modal results highlight the matched substring (`<mark>`), item names with `url` are `target="_blank"` links, member rows render disabled with no add action; (d) adding calls the membership create (lands unorganized) and the row flips to disabled; (e) left pane flat-lists `organized=false` lines sorted by `created_at` with working remove buttons; (f) tree renders only `organized=true` lines; (g) simulated left→right drop fires `move {organized:true,…}` (wrapper = top-level append, node title = nest), right→left drop fires `move {organized:false}`; (h) Splitter layout horizontal wide / vertical narrow (`useContainerWidth`)
- [ ] T014 [US3] Implement helpers in `apps/unihub/frontend/src/pages/inventory/scenarios/organizeTree.ts` (organized filtering + pane-drop payload helpers) and a small `HighlightText` helper (colocated or `src/components/HighlightText/index.tsx`); T012 green
- [ ] T015 [US3] Rewrite `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx`: info Card (name/description); Organize Card with Add-button search modal (server OR-group substring search reused from old Backlog, members disabled not excluded); AntD `Splitter` (horizontal/vertical by `useContainerWidth`); left pane draggable flat rows + remove; right pane existing draggable Tree; native HTML5 DnD bridge per R16.2 (draggable left rows; `titleRender` + wrapper drop zones; Tree `onDragStart` ref for right→left); all mutations through `moveScenarioItem`/membership endpoints with query invalidation; T013 green
- [ ] T016 [P] [US3] Locales both `pages.ts`: panel titles, Add/search modal keys (placeholder, empty, already-added), unorganized-pane empty text, send-back/remove labels — remove dead Backlog keys; same commit
- [ ] T017 [US3] Rewrite Playwright `apps/unihub/frontend/e2e/inventory-scenario.spec.ts`: modal add → appears in left pane (disabled in results); DragEvent-dispatched left→right drop organizes (persists reload); right→left send-back returns it; tree node offers no remove button; name/description panel present, Backlog absent

**Checkpoint**: FR-011/FR-012 satisfied end-to-end; scenario e2e suite green.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T018 Full quality loops: backend `uv run ruff check . && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — zero warnings
- [ ] T019 Rebuild docker images (`docker compose -f docker-compose.local.yml build backend frontend && up -d`), apply migration 0013, run ALL inventory Playwright suites against :3001, and live-verify + screenshot: pinned Toggle column, full-width parameter rows + definition delete, scenario detail (modal highlight/hyperlink/disabled, Splitter panes, cross-pane drag both ways)

---

## Dependencies & Execution Order

- **Phase 2**: T001 → T002 → T003 (backend TDD then contracts; blocks the scenario track and service typings).
- **Phase 3 (US1)**: T004 → T005 (T006 [P] alongside) → T007. Independent of Phase 2.
- **Phase 4 (US2)**: T008 → T009 (T010 [P] alongside) → T011. Independent of Phases 2–3.
- **Phase 5 (US3+5)**: needs T003; T012+T013 (tests first, parallel) → T014 → T015 (T016 [P] alongside) → T017.
- **Phase 6**: T018 → T019 last.

```text
T001 → T002 → T003 ──────────────┐
T004 → T005(+T006) → T007        ├→ T012/T013 → T014 → T015(+T016) → T017 ─→ T018 → T019
T008 → T009(+T010) → T011 ───────┘   (scenario track only needs T003)
```

## Implementation Strategy

Backend `organized` foundation first (it gates the scenario rewrite and types). US1 and US2 are small, independent, and can land in any order. The scenario redesign (US3+5) is the bulk — helpers and tests before the page rewrite. MVP = Phases 2–4; full scope adds Phase 5. Docker rebuild + live verification close the iteration.
