---
description: "Task list for Inventory App — Iteration 19 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 19 (Panel-header kebab, catalog actions, organize polish, full legacy import)

**Input**: [plan.md](plan.md) (iteration 19), [spec.md](spec.md) — FR-003/003b, FR-007, FR-011, FR-029c. Constitution **v1.21.0**.

**Tests**: REQUIRED — test-first (component/unit/RTL before implementation; parser fixtures before any importer fix).

**Baseline**: Iteration 18 shipped at `caea75e`. Frontend-only code delta + a large data operation; design pre-confirmed (research R19.1–R19.5).

**Organization**: Foundational = the shared PanelHeaderActions + ItemName.truncate + summary-helper extraction (everything else consumes them). US1 = catalog/edit-page actions. US3 = scenario panel + organize + modal. Data phase last (final UI verified live against the full dataset).

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

*(none)*

---

## Phase 2: Foundational (shared components + helpers)

- [X] T001 Write failing RTL specs `apps/unihub/frontend/src/components/PanelHeaderActions/PanelHeaderActions.test.tsx`: wide (`narrow=false`) renders the `visible` actions as buttons plus a kebab holding only `advanced` items; narrow renders ONLY the kebab containing `visible + advanced` (labels preserved); the kebab Dropdown uses `placement="bottomRight"`; clicking a folded action fires its handler — then implement `apps/unihub/frontend/src/components/PanelHeaderActions/index.tsx` (T001 green)
- [X] T002 Write failing specs in `apps/unihub/frontend/src/components/ItemName/ItemName.test.tsx` for a new **`truncate` mode**: renders ONE ellipsising span; aliased → tooltip always carries the original name; unaliased → tooltip ONLY when actually truncated (scrollWidth > clientWidth), never a nested double tooltip — then implement in `apps/unihub/frontend/src/components/ItemName/index.tsx` (T002 green)
- [X] T003 Extract `acquisitionSummaryLines` (+ `formatNetCost` if needed) from `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` into `apps/unihub/frontend/src/pages/inventory/acquisitionSummary.ts` (pure, unit-tested by the existing catalog RTL passing unchanged); re-import in the catalog

**Checkpoint**: v1.21.0 pattern + display helpers available to every surface.

---

## Phase 3: User Story 1 — Catalog & edit-page actions (P1)

**Goal**: No Delete on the catalog; Edit is a real hyperlink; the edit page's Acquisition panel holds Delete in a kebab.

**Independent Test**: Catalog acquisition rows show an Edit control that is an `<a href=…/edit>` (middle-click opens a tab) and NO Delete; the acquisition edit page's Acquisition panel header shows a kebab whose Delete confirms with the item count and returns to the Catalog.

- [X] T004 [US1] Write failing RTL specs in `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx`: acquisition (and merged) rows have NO Delete button; the Edit action is an anchor with `href` `/inventory/acquisitions/<id>/edit`; plain click navigates SPA (navigate called, no reload)
- [X] T005 [US1] Implement catalog action changes in `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` (remove delete mutation/confirm if now unused); T004 green
- [X] T006 [US1] Write failing RTL spec for the edit page (new `apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionEdit.test.tsx` or extend an existing spec): the Acquisition panel header renders PanelHeaderActions with a kebab holding Delete → confirm shows the item count → `deleteAcquisition` called → navigate to `/inventory/catalog`; then implement in `edit.tsx`/`AcquisitionForm.tsx`; T006 green
- [X] T007 [US1] e2e updates `apps/unihub/frontend/e2e/inventory-catalog.spec.ts` + `inventory-acquisition.spec.ts`: catalog rows keep Edit (as link) and no Delete; edit page kebab-Delete flow (create a throwaway acquisition, delete it via the kebab, land on Catalog)

**Checkpoint**: FR-003/003b/FR-007 satisfied.

---

## Phase 4: User Story 3 — Scenario panel + organize + modal (P2)

**Goal**: Responsive panel actions; gated tooltips; caret toggler back; width-fitting modal rows with single Add + acquisition context.

**Independent Test**: Wide: scenario panel shows Edit + kebab(Delete), dropdown opens leftward; narrow: only the kebab (Edit + Delete inside). Organize rows show tooltips only when text truncates; container rows show carets that collapse/expand subtrees; dropping after a collapsed container lands after its subtree. Modal rows never overflow, every row has one Add button (disabled + "Added" tooltip on members), and each result shows its acquisition source/date line.

- [X] T008 [US3] Write failing unit specs in `apps/unihub/frontend/src/pages/inventory/scenarios/organizeTree.test.ts`: `visibleRows(working, collapsedIds)` hides descendants of collapsed rows (nested collapse too); `gapFromVisible(working, visible, visIndex, after)` maps before/after slots to working gaps — after a collapsed container = after its entire subtree; end-of-list maps to working.length — then implement both helpers in `organizeTree.ts` (T008 green)
- [X] T009 [US3] Write failing RTL specs in `apps/unihub/frontend/src/pages/inventory/scenarios/ScenarioDetail.test.tsx`: (a) info panel uses PanelHeaderActions (Edit button wide + kebab with Delete; bottomRight); (b) organized container rows render a caret (childless rows a spacer); clicking it hides/reveals the subtree rows; (c) row names render via ItemName truncate mode (aliased row hover → original name tooltip); (d) modal: member rows show a DISABLED Add button (no "Added" tag) whose hover reveals the "Added" tooltip; non-member Add still calls add; (e) modal rows show the acquisition context line (source + date) when the item carries an acquisition
- [X] T010 [US3] Implement in `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx`: PanelHeaderActions on the info panel (narrow from `useContainerWidth`); caret toggler + collapsedIds + visibleRows/gapFromVisible wiring (indicator in visible coordinates); ItemName truncate + OverflowTooltip on spec lines; modal single-Add (disabled + Tooltip), `minWidth:0` width-fitting rows, acquisition context via `acquisitionSummaryLines`; T009 green
- [X] T011 [P] [US3] Locales both `apps/unihub/frontend/src/locales/{en-US,zh-TW}/pages.ts`: "Added" tooltip key reuse/rename (drop the tag key if unused), any new labels; same commit
- [X] T012 [US3] e2e `apps/unihub/frontend/e2e/inventory-scenario.spec.ts`: caret collapse/expand round-trip; drop after a collapsed container lands after the subtree (reload-verified); narrow viewport → info panel folds Edit into the kebab; modal rows within modal bounds; disabled Add with tooltip on a member row

**Checkpoint**: FR-011 (iteration 19) satisfied end-to-end.

---

## Phase 5: Data — full legacy import (FR-029c)

- [X] T013 Preview ALL sheets `data/財產們/{2015..2024}.html` with `specs/014-inventory-app/scripts/preview_legacy_import.py`, recording per-sheet acquisition/item counts and flags; then import sheet-by-sheet (oldest first) via `DATABASE_URL=postgresql://unihub:unihub@localhost:5433/unihub uv run python manage.py import_legacy_csv <sheet> --commit` — on ANY failure: minimal fixture regression test in `apps/unihub/backend/tests/test_legacy_parser.py` → fix parser/importer → suite green → re-run the sheet
- [X] T014 Verify (FR-029c): live totals equal 140 acquisitions / 221 items + Σ sheet previews; `obtained_at__year` distribution spans 2015–2026 consistently with the sheets; sampled per-year spot checks (dates parsed, remarks/parameters populated); record the numbers in the task notes/commit message

---

## Phase 6: Polish & Cross-Cutting

- [X] T015 Full quality loops: backend `uv run ruff check . && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — zero warnings
- [X] T016 Rebuild docker (`build backend frontend && up -d`), run ALL inventory Playwright suites, live-verify + screenshot: catalog Edit link (no Delete), edit-page kebab, scenario panel folding, carets, modal rows, full-history data behind the YTD filter

---

## Dependencies & Execution Order

- **Phase 2**: T001/T002 [P with each other] → consumed by T005/T006/T010; T003 anytime before T010.
- **Phase 3**: T004 → T005; T006 after T001; T007 last in phase.
- **Phase 4**: T008 → T010; T009 → T010 (T011 [P]); T012 after T010.
- **Phase 5**: T013 → T014 (after Phase 3/4 so live checks see the final UI).
- **Phase 6**: T015 → T016 last.

```text
T001/T002 [P] ─┬→ T004 → T005 ─┬→ T007 ─┐
T003 ──────────┤  T006 ────────┘        ├→ T013 → T014 → T015 → T016
               └→ T008/T009 → T010(+T011) → T012 ─┘
```

## Implementation Strategy

Shared pieces first (the kebab component IS the constitution rule — build it once, test the fold logic with an explicit prop). The two action-relocation stories are small; organize polish is the bulk of the UI work. The import runs last, sheet-by-sheet with a strict fix-before-import protocol, and the final live verification exercises the complete dataset.
