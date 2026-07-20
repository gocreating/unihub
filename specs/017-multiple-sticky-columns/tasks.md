# Tasks: Multiple Sticky Columns

**Input**: Design documents from `/specs/017-multiple-sticky-columns/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/column-pin-contracts.md, quickstart.md

**Tests**: INCLUDED — constitution Principle V and the project's standing TDD preference mandate red-green (tests written first, failing, then implementation). Visual/sticky geometry is verified in a real browser (Playwright), never JSDOM.

**Organization**: The pin model is one atomic TypeScript refactor (types → hook → panel → 6 pages must compile together), so the shared model lands in Foundational; user-story phases then deliver and verify each story's observable behavior.

**Note on paths**: frontend paths are relative to `apps/unihub/frontend/`.

## Phase 1: Setup

**Purpose**: Confirm a green baseline so every later failure is attributable to this feature.

- [X] T001 Run the frontend quality loop from `apps/unihub/frontend/` (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) and confirm all green before touching code

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The per-column pin state model in shared `EntityToolbar` infrastructure — every user story depends on it. TDD: T002 goes red first; T003–T006 turn it green.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [RED] Extend `src/components/EntityToolbar/hooks/useColumnConfig.test.ts` with the per-column pin contract (contracts/column-pin-contracts.md C1): pin set/clear/side-swap via `setPendingState`+`apply`; `visibleColumns` pin-group-major ordering (left group → unpinned → right group, `order` preserved within groups); `fixedForKey()` for visible/hidden/unknown keys; `pinFingerprint` format + hidden-pinned exclusion + stability for unpinned-column changes; `reset()` restoring `ColumnDef.pin` seeds; label-patch preserving `visible`/`order`/`pin` + referential stability when unchanged; `isDirty`/`isCustomised` on pin-only diffs. Tests MUST fail (compile) before T003
- [X] T003 Add `PinSide` type and `ColumnDef.pin?: PinSide` and remove `ColumnState.stickyLeft`/`stickyRight` in `src/components/EntityToolbar/types.ts` (data-model.md types)
- [X] T004 Rewrite `src/components/EntityToolbar/hooks/useColumnConfig.ts`: drop the `defaultSticky` parameter (defaults ride on `initialColumns[].pin`); shared `(pinRank, order)` display-order comparator; `fixedForKey()`; `pinFingerprint`; `statesEqual` compares `pin`; label-patch preserves `pin`; remove `firstColumnFixed`/`lastColumnFixed`
- [X] T005 Remove the `defaultSticky` option from `src/components/EntityToolbar/useEntityTable.ts` and update `src/components/EntityToolbar/useEntityTable.test.tsx` accordingly
- [X] T006 [P] Add `common.entityOps.columns.pinLeft`/`pinRight` and delete `common.entityOps.columns.stickyLeft`/`stickyRight` in BOTH `src/locales/en-US/pages.ts` and `src/locales/zh-TW/pages.ts` (constitution VIII — same commit, keys in sync)
- [X] T007 Verify T002's suite passes (`pnpm test src/components/EntityToolbar/hooks/useColumnConfig.test.ts`) — full `pnpm typecheck` still red until Phase 3 page updates; that is expected

**Checkpoint**: Hook contract green; ColumnPanel and the 6 pages still reference removed members (compile-red) — Phase 3 resolves them.

---

## Phase 3: User Story 1 - Keep several leading columns visible while scrolling (Priority: P1) 🎯 MVP

**Goal**: A user can pin multiple columns to the LEFT of any entity table and they stay fixed, ordered, and aligned during horizontal scroll.

**Independent Test**: On Finance → Accounts at a 600px viewport, pin two columns left via the Columns panel, Apply, scroll to the far right — both stay flush left with a single boundary shadow after the second.

### Tests for User Story 1 (write first — RED)

- [X] T008 [US1] [RED] Extend `src/components/EntityToolbar/ColumnPanel.test.tsx` (contract C2): EVERY row renders `[data-sticky-pin="left"]` and `[data-sticky-pin="right"]` inside `[data-column-row="<key>"]`; active/inactive pushpin rendering; mutual exclusion (activating one side clears the other); pending-only until Apply, Cancel discards, Reset restores `pin` seeds and disabled-state rules; the old global first/last toggles are GONE; pin buttons carry `pinLeft`/`pinRight` tooltips

### Implementation for User Story 1

- [X] T009 [US1] Rewrite pin controls in `src/components/EntityToolbar/ColumnPanel.tsx`: per-row pin-left/pin-right pushpin buttons on every row (left as-is, right visually mirrored), mutual-exclusion updates to `pendingState.columns[].pin`, i18n tooltips, panel row list sorted by the shared display-order comparator (WYSIWYG with table); remove `firstVisibleKey`/`lastVisibleKey` logic — then T008 goes green
- [X] T010 [P] [US1] Update `src/pages/finance/accounts/index.tsx`: replace `getFixed`/`firstColumnFixed`/`lastColumnFixed` with `cols.fixedForKey(<colKey>)` per column; PageTable remount `key` embeds `cols.pinFingerprint`
- [X] T011 [P] [US1] Update `src/pages/finance/currencies/index.tsx`: same substitution as T010
- [X] T012 [P] [US1] Update `src/pages/finance/exchange-rates/index.tsx`: same substitution as T010
- [X] T013 [P] [US1] Update `src/pages/finance/balance-sheets/index.tsx`: same substitution as T010
- [X] T014 [P] [US1] Update `src/pages/inventory/scenarios/index.tsx`: same substitution as T010
- [X] T015 [US1] Update `src/pages/inventory/catalog/index.tsx`: `fixedForKey` for all columns AND `expandable.fixed = cols.fixedForKey('__caret')`; `pinFingerprint` joins the remount key (keep `flatMode`); replace `defaultSticky: { left: true, right: true }` with `pin: 'left'` on the `__caret` ColumnDef and `pin: 'right'` on the `actions` ColumnDef (preserves today's defaults — FR-006/SC-004)
- [X] T016 [US1] Full quality loop from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — first fully-green state; fix page-test fallout (e.g. catalog RTL tests asserting fixed classes)
- [X] T017 [US1] Update `e2e/column-pin.spec.ts`: adapt existing scenarios to per-row selectors (`[data-column-row="…"] [data-sticky-pin="left"]`); ADD multi-left scenario — pin 2 columns left on Accounts (600px viewport), Apply, scroll fully right, assert both pinned header+body cells keep viewport-edge-flush bounding boxes (geometry, contract C4), exactly one `.ant-table-cell-fix-left-last`, header/body x-alignment (SC-005). Run per quickstart.md (backend + dev server + `pnpm test:e2e --grep "column-pin"`)

**Checkpoint**: US1 fully functional — multiple left pins work everywhere, defaults preserved, e2e-verified. MVP deliverable.

---

## Phase 4: User Story 2 - Keep several trailing columns visible while scrolling (Priority: P2)

**Goal**: Multiple RIGHT-pinned columns, including simultaneous left+right groups with only the middle scrolling.

**Independent Test**: Pin two columns right on a wide table, scroll fully left — both stay flush right; with pins on both sides, only middle columns move.

### Tests for User Story 2 (write first where feasible)

- [X] T018 [US2] [RED-first] Add an RTL case to the catalog page test (`src/pages/inventory/catalog/` test file): with Actions default-pinned right plus a second column pinned right via state, rendered cells carry `.ant-table-cell-fix-right` on both and `.ant-table-cell-fix-right-first` only on the display-first of the two (JSDOM class-level check)
- [X] T019 [US2] Extend `e2e/column-pin.spec.ts` with the right/both-sides scenario: pin 2 right on Accounts → scroll fully LEFT → both flush right, single `.ant-table-cell-fix-right-first`; then 2 left + 2 right simultaneously → scroll both extremes → left group flush left, right group flush right, middle columns move between them (US2 acceptance scenarios, geometry per contract C4)

### Implementation for User Story 2

- [X] T020 [US2] Fix any right-side defects surfaced by T018/T019 (rc-table right-offset stacking, shadow placement, catalog rowSpan-merged cells under right pins) in `src/components/EntityToolbar/` or affected pages; re-run quality loop + `pnpm test:e2e --grep "column-pin"` until green

**Checkpoint**: Left and right multi-pinning both verified in real-browser geometry.

---

## Phase 5: User Story 3 - Choose, keep, and reset pinned columns (Priority: P3)

**Goal**: Pin choices behave as first-class column configuration: apply-gated, stable through table interactions, hidden-column pin retention, one-action Reset to view defaults, no leftover global toggles.

**Independent Test**: Customize pins on Catalog, filter/sort/page — pins hold; hide a pinned column and re-show it — pin intact; Reset — caret-left + Actions-right defaults return.

### Tests for User Story 3 (write first — RED)

- [X] T021 [US3] [RED] Add RTL cases for config lifecycle: catalog Reset restores default pins (`__caret` left, `actions` right) after custom pins; hiding a pinned column removes it from `pinFingerprint`/`fixedForKey` but re-showing restores its pin (FR-010); pins unchanged across filter/sort/pagination state updates (US3 scenario 2); async `attr:<id>` definition reload preserves user pins (label-patch, page-level) — in the catalog page test file and/or `useColumnConfig.test.ts` where the abstraction owns the behavior

### Implementation for User Story 3

- [X] T022 [US3] Fix any defects surfaced by T021 in `src/components/EntityToolbar/hooks/useColumnConfig.ts` / `ColumnPanel.tsx` / `src/pages/inventory/catalog/index.tsx`; quality loop green
- [X] T023 [US3] Extend `e2e/column-pin.spec.ts` with the config-lifecycle scenario: panel Reset returns default pins (Catalog); hide→re-show a pinned column keeps its pin; assert NO global pin toggles remain (every `[data-sticky-pin]` sits inside a `[data-column-row]`) — US3 scenarios 3–5/FR-007

**Checkpoint**: All three user stories independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Amend constitution Principle XII in `.specify/memory/constitution.md` → v1.23.0 (MINOR): remount-key bullet references the pin fingerprint (visible pinned columns + sides, display order) instead of "first/last visible column identity + fixed flags"; label-patch bullet lists `pin` among never-touched fields; update the Sync Impact Report header (research.md D10)
- [X] T025 [P] Update the Active Feature block in `CLAUDE.md` (between SPECKIT markers) with the shipped-iteration summary for 017
- [X] T026 Final gate from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then the full e2e suite relevant to tables (`pnpm test:e2e --grep "column-pin"` plus `page-table-scroll` and `sort-highlight` specs to catch remount-key regressions); run the quickstart.md manual smoke (narrow window, both domains)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately
- **Phase 2 (Foundational)**: after T001. T002 → T003 → T004 → T005; T006 [P] anytime; T007 last. BLOCKS all stories
- **Phase 3 (US1)**: after Phase 2. T008 → T009; T010–T014 [P] after T004 (independent files); T015 after T004; T016 after T009–T015; T017 after T016
- **Phase 4 (US2)**: after Phase 3 (rendering + e2e scaffolding). T018/T019 before T020
- **Phase 5 (US3)**: after Phase 3; independent of Phase 4. T021 → T022 → T023
- **Phase 6 (Polish)**: after Phases 3–5. T024/T025 [P]; T026 last

### User Story Dependencies

- **US1 (P1)**: Foundational only — delivers the whole pin mechanism + page wiring (MVP)
- **US2 (P2)**: builds on US1's wiring; only adds right-side verification/fixes
- **US3 (P3)**: builds on US1's wiring; config-lifecycle verification/fixes; independent of US2

### Parallel Opportunities

- T006 (locales) parallel to T002–T005
- T010–T014 (five single-purpose page updates) fully parallel; T015 (catalog) parallel to them
- Phase 4 and Phase 5 can proceed in parallel after Phase 3
- T024/T025 parallel in Polish

## Parallel Example: User Story 1

```bash
# After T004/T009, launch the five simple page updates together:
Task: "Update src/pages/finance/accounts/index.tsx to fixedForKey + pinFingerprint"
Task: "Update src/pages/finance/currencies/index.tsx to fixedForKey + pinFingerprint"
Task: "Update src/pages/finance/exchange-rates/index.tsx to fixedForKey + pinFingerprint"
Task: "Update src/pages/finance/balance-sheets/index.tsx to fixedForKey + pinFingerprint"
Task: "Update src/pages/inventory/scenarios/index.tsx to fixedForKey + pinFingerprint"
```

## Implementation Strategy

**MVP first**: Phases 1–3 alone ship the feature's core value (multiple left pins + all wiring + preserved defaults) in a fully-green, e2e-verified state. Phases 4–5 are verification-heavy increments on the same mechanism; Phase 6 closes governance and docs.

**Compile-atomicity caveat**: the repo is typecheck-red between T004 and T016 (types/hook/panel/pages must change together). Order within that window is test-driven (unit suites go green progressively); do not commit mid-window — the first commit point is after T016.
