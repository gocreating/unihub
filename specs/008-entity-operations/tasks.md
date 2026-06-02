# Tasks: Entity Operations

**Input**: Design documents from `specs/008-entity-operations/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Backend test tasks included per Constitution Principle V (test-first). Frontend quality loop (lint/typecheck/Vitest) is a polish-phase task.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Backend Infrastructure (Foundation for all user stories)

**Purpose**: Create the reusable filter backend and pagination classes in `core/`. No new migrations. These block all backend integration work.

**⚠️ CRITICAL**: Constitution Principle V — tests MUST be written first and MUST fail before implementation is added.

- [x] T001 Write failing tests for EntityFilterBackend: single-condition filter (contains, equals, is), multi-group OR logic, invalid JSON → 400, unknown attr key → skipped, in `apps/unihub/backend/tests/test_entity_filter.py`
- [x] T002 Implement `EntityFilterBackend` in `apps/unihub/backend/core/filters.py` — parse JSON `filters` query param, build Q() objects per condition, group logic AND/OR, groups OR-ed together (makes T001 pass)
- [x] T003 [P] Write failing tests for `EntityOffsetPagination` (count/next/previous/results envelope, limit/offset params, max_limit=500) and `EntityCursorPagination` (next/previous cursors, no count, limit param) in `apps/unihub/backend/tests/test_entity_pagination.py`
- [x] T004 [P] Implement `EntityOffsetPagination` (default_limit=50, max_limit=500) and `EntityCursorPagination` (page_size=50, page_size_query_param='limit') in `apps/unihub/backend/core/pagination.py` (makes T003 pass)

**Checkpoint**: `uv run pytest tests/test_entity_filter.py tests/test_entity_pagination.py` passes — infrastructure is ready

---

## Phase 2: Frontend Foundation

**Purpose**: Shared TypeScript types and EntityToolbar shell. These block all frontend user story work.

- [x] T005 Create shared types — `FilterCondition`, `FilterGroup`, `FilterPayload`, `SortRule`, `SortState`, `ColumnDef`, `ColumnState`, `FilterableAttribute`, `EntityListParams`, `OffsetPaginatedResponse<T>`, `CursorPaginatedResponse<T>` — in `apps/unihub/frontend/src/components/EntityToolbar/types.ts`
- [x] T006 [P] Create `EntityToolbar.tsx` shell in `apps/unihub/frontend/src/components/EntityToolbar/EntityToolbar.tsx` — render three `Dropdown` buttons (Filter, Sort, Columns) with AntD badge active-indicator; panel content is empty placeholder for now; accepts `filterProps`, `sortProps`, `columnProps` and passes hook instances to each panel
- [x] T007 [P] Create `apps/unihub/frontend/src/components/EntityToolbar/index.ts` barrel exporting `EntityToolbar`, all hook types, and `FilterableAttribute`

**Checkpoint**: TypeScript types compile; EntityToolbar renders three empty dropdown buttons without errors

---

## Phase 3: User Story 1 — Filter Entity List (Priority: P1) 🎯 MVP

**Goal**: Users can open a filter panel, define one or more conditions optionally grouped with AND/OR logic, click Apply to narrow the entity list, and close without clicking Apply to discard changes.

**Independent Test**: Open Accounts page → click Filter button → add condition `name contains "test"` → click Apply → verify only matching accounts appear → add second condition → close without Apply → verify first filter still active.

- [x] T008 [P] [US1] Write failing backend integration test for `AccountViewSet` with filter: `name contains`, `name equals`, `currency is`, multi-group OR, empty `filters` param returns all records, in `apps/unihub/backend/tests/test_entity_filter.py`
- [x] T009 [US1] Wire `EntityFilterBackend`, `filterable_fields` (`name`/text, `currency`/single_select, `open_datetime`/date, `close_datetime`/date), and `EntityOffsetPagination` to `AccountViewSet` in `apps/unihub/backend/finance/views.py` (makes T008 pass)
- [x] T010 [P] [US1] Wire `EntityFilterBackend`, `filterable_fields`, and `EntityOffsetPagination` to `CurrencyViewSet` (`code`/text, `name`/text) and `ExchangeRateViewSet` (`base_currency`/single_select, `quote_currency`/single_select, `date`/date) in `apps/unihub/backend/finance/views.py`
- [x] T011 [P] [US1] Create `useEntityFilter` hook in `apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntityFilter.ts` — `pendingGroups`/`activeGroups` state, `apply()` commits pending → active + URL-encodes to `?filters=`, `cancel()` restores active, `reset()` clears all, `toApiParam()` serialises to `FilterPayload`, reads initial state from URL on mount
- [x] T012 [P] [US1] Create `FilterPanel.tsx` in `apps/unihub/frontend/src/components/EntityToolbar/FilterPanel.tsx` — renders condition rows (attribute dropdown + operator dropdown + value input), Add Condition button, Add Group button, group logic (AND/OR) toggle per group, Apply and Cancel buttons; incomplete conditions show validation indicator; accepts `attrs: FilterableAttribute[]` and hook instance
- [x] T013 [US1] Update `listAccounts()` in `apps/unihub/frontend/src/services/unihub-backend/finance.ts` to accept `EntityListParams` (filters, ordering, limit, offset) and return `Promise<OffsetPaginatedResponse<Account>>`; update `listCurrencies()` and `listExchangeRates()` similarly
- [x] T014 [US1] Integrate filter into Accounts page in `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` — mount `EntityToolbar` in `headerTitle` prop, instantiate `useEntityFilter('accounts')`, add `filter.toApiParam()` to React Query key and `listAccounts()` call, switch `dataSource` from raw array to `data?.results ?? []`
- [x] T015 [P] [US1] Add `common.entityOps.*` i18n keys (filter, addCondition, addGroup, apply, cancel, reset, noFilters, and operator labels) to `apps/unihub/frontend/src/locales/en-US/pages.ts` and `apps/unihub/frontend/src/locales/zh-TW/pages.ts`

**Checkpoint**: Filter panel opens, conditions can be added, Apply updates the Account list, closing without Apply discards changes, URL reflects active filter

---

## Phase 4: User Story 2 — Sort Entity List (Priority: P2)

**Goal**: Users can open the sort panel, add ordered sort rules (column + direction), click Apply to re-order the entity list; OR click a column header directly to immediately cycle that column through no-sort → ascending → descending → no-sort without using Apply. Both entry points stay bidirectionally in sync.

**Independent Test**: Accounts page → click `Name` column header → list sorts ascending immediately → click again → descending → click again → sorted removed. Open sort panel → verify header changes are reflected → add a tiebreaker rule via panel → Apply → verify combined sort. Open panel with pending change → click a column header → verify header takes effect, panel resets to new state.

- [x] T016 [P] [US2] Create `useEntitySort` hook in `apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntitySort.ts` — `pendingRules`/`activeRules` state, `apply()` commits + URL-encodes to `?ordering=`, `cancel()` restores, `handleHeaderClick(field)` cycles null → ascend → descend → null immediately (updates `activeRules` directly, no Apply needed; resets pendingRules to new activeRules if panel was open), `sortOrderForField(field)` returns `'ascend'|'descend'|null`, `toOrderingParam()` serialises `activeRules` to DRF ordering string, reads from URL on mount
- [x] T017 [P] [US2] Create `SortPanel.tsx` in `apps/unihub/frontend/src/components/EntityToolbar/SortPanel.tsx` — renders sort rule rows (field dropdown + direction toggle), priority-order list with up/down controls, Add Sort Rule button, Apply and Cancel buttons; applies `sortRules` from hook as initial panel state each time it opens (discards any prior pending edits when re-opened after a header click)
- [x] T018 [US2] Integrate `SortPanel` into `EntityToolbar.tsx` in `apps/unihub/frontend/src/components/EntityToolbar/EntityToolbar.tsx` — pass `sortProps.hook` to `SortPanel`; active-indicator badge shows when `sortProps.hook.isActive`
- [x] T019 [US2] Integrate sort into Accounts page in `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` — add `sorter: true` + `sortOrder: sort.sortOrderForField(key)` to each sortable column, wire `onChange` to `sort.handleHeaderClick`, add `sort.toOrderingParam()` to React Query key and `listAccounts()` call, instantiate `useEntitySort('accounts')`
- [x] T020 [P] [US2] Add `common.entityOps.sort`, `common.entityOps.addSort`, `common.entityOps.sortAsc`, `common.entityOps.sortDesc` i18n keys to both locale files in `apps/unihub/frontend/src/locales/`

**Checkpoint**: Column header click cycles sort state immediately; sort panel reflects header changes; multi-rule panel sort applies on Apply; both update the Accounts list and URL

---

## Phase 5: User Story 4 — Navigate Paginated Results (Priority: P2)

**Goal**: The entity list shows records in pages. Pagination controls in the sticky table footer allow navigation. Offset mode shows total count and supports jump-to-page. Cursor mode shows only previous/next. Both modes respect any active filter and sort.

**Independent Test**: (Accounts) add enough records to span multiple pages → confirm pagination controls appear in footer at all scroll positions → navigate to page 2 → apply a filter → verify page resets to 1 and only matching records show. (BalanceSheets) navigate cursor pages, confirm no total count shown, next/previous work.

- [x] T021 [P] [US4] Write failing backend integration tests for `AccountViewSet` pagination: `count` field present, `limit`/`offset` params respected, filter + ordering params preserved in `next`/`previous` URLs, in `apps/unihub/backend/tests/test_entity_pagination.py`
- [x] T022 [US4] Wire `EntityCursorPagination` to `BalanceSheetViewSet` (T021 covers offset; BalanceSheet uses cursor) in `apps/unihub/backend/finance/views.py`; confirm `EntityOffsetPagination` already wired via T009/T010
- [x] T023 [US4] Update `listBalanceSheets()` in `apps/unihub/frontend/src/services/unihub-backend/finance.ts` to return `Promise<CursorPaginatedResponse<BalanceSheet>>`
- [x] T024 [US4] Add offset pagination UI to Accounts page in `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` — wire `pagination` prop of `PageTable` to `{total: data?.count, pageSize: limit, current: Math.floor(offset/limit)+1, onChange: (page, size) => setOffset((page-1)*size)}`, confirm active filter resets to page 1 on Apply (already enforced by filter hook clearing offset)
- [x] T025 [P] [US4] Add cursor pagination UI to BalanceSheets page in `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` — render previous/next buttons using `data?.previous` / `data?.next` cursor URLs, no total count or page jump, pass `cursor` state to `listBalanceSheets()` call

**Checkpoint**: Accounts list paginates with total count visible in footer; navigating to page 3 then changing filter resets to page 1; BalanceSheets page shows prev/next only with no count

---

## Phase 6: User Story 3 — Customize Column Visibility, Order, and Sticky Pinning (Priority: P3)

**Goal**: Users can open the column panel, show/hide individual columns, drag to reorder them, toggle sticky-left (pin first visible column) and sticky-right (pin last visible column), then click Apply to commit changes. Closing without Apply restores the previous column configuration.

**Independent Test**: Accounts page → open column panel → hide `currency` column → reorder `name` and `open_datetime` → enable sticky-left → Apply → verify hidden column gone, new order reflected, first column stays pinned while scrolling horizontally → open panel again → toggle sticky-left off → close without Apply → verify sticky still active.

- [x] T026 [P] [US3] Create `useColumnConfig` hook in `apps/unihub/frontend/src/components/EntityToolbar/hooks/useColumnConfig.ts` — accepts initial `ColumnDef[]`, `pendingState`/`activeState` as `ColumnState`, `apply()` commits, `cancel()` restores, `setPendingState()`, `visibleColumns` (sorted by `order`, filtered to `visible: true`), `firstColumnFixed` (`'left'` if `activeState.stickyLeft`), `lastColumnFixed` (`'right'` if `activeState.stickyRight`); prevents hiding last visible column (returns error signal); not URL-reflected
- [x] T027 [P] [US3] Create `ColumnPanel.tsx` in `apps/unihub/frontend/src/components/EntityToolbar/ColumnPanel.tsx` — renders each column as a row with visibility checkbox and up/down order buttons (or drag handle), sticky-left and sticky-right toggle switches at the top of the panel, Apply and Cancel buttons; disables hiding when only one column visible
- [x] T028 [US3] Integrate `ColumnPanel` into `EntityToolbar.tsx` in `apps/unihub/frontend/src/components/EntityToolbar/EntityToolbar.tsx` — pass `columnProps.hook` to `ColumnPanel`; active-indicator badge on Columns button when any column is hidden or reordered from defaults or sticky is active
- [x] T029 [US3] Integrate column config into Accounts page in `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` — instantiate `useColumnConfig(ACCOUNT_COLUMN_DEFS)`, derive ProTable `columns` array from `cols.visibleColumns`, set `fixed: cols.firstColumnFixed` on first visible column and `fixed: cols.lastColumnFixed` on last visible column
- [x] T030 [P] [US3] Add `common.entityOps.columns`, `common.entityOps.stickyLeft`, `common.entityOps.stickyRight` i18n keys to both locale files in `apps/unihub/frontend/src/locales/`

**Checkpoint**: Columns panel toggles visibility correctly; Apply reflects changes; horizontal scroll shows pinned column; closing without Apply restores previous config; hiding last column is blocked

---

## Phase 7: Polish — Full Finance Integration & Quality Loop

**Purpose**: Extend entity operations to the remaining Finance pages, verify all i18n keys are present in both locales, and confirm the quality loop passes clean.

- [x] T031 [P] Integrate EntityToolbar (filter + sort + offset pagination, using existing COLUMN_DEFS) into Currencies page in `apps/unihub/frontend/src/pages/finance/currencies/index.tsx`
- [x] T032 [P] Integrate EntityToolbar (filter + sort + offset pagination) into ExchangeRates page in `apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx`
- [x] T033 Integrate EntityToolbar (sort + cursor pagination; no filter needed for BalanceSheet since only date field) into BalanceSheets page in `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` — extend the cursor pagination UI from T025 with the full EntityToolbar mount
- [x] T034 [P] Verify `en-US/pages.ts` and `zh-TW/pages.ts` are fully in sync for all `common.entityOps.*` keys added across T015, T020, T030 in `apps/unihub/frontend/src/locales/`
- [x] T035 Run backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` — confirm zero errors
- [x] T036 Run frontend quality loop from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test` — confirm zero warnings or errors
- [x] T037 Walk through the `quickstart.md` checklist in `specs/008-entity-operations/quickstart.md` for the Accounts page and confirm all items are checked

**Checkpoint**: All Finance entity list pages have filter, sort, column controls, and pagination. Quality loop passes. Quickstart checklist satisfied.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Backend Infra)     — no dependencies, start immediately
Phase 2 (Frontend Foundation) — no dependencies, can start in parallel with Phase 1
Phase 3 (US1 Filter)        — requires Phase 1 (T001–T004) AND Phase 2 (T005–T007)
Phase 4 (US2 Sort)          — requires Phase 2 (T005–T007); backend already has OrderingFilter
Phase 5 (US4 Pagination)    — requires Phase 1 (T001–T004); frontend parts require Phase 2
Phase 6 (US3 Columns)       — requires Phase 2 (T005–T007) only; no backend dependency
Phase 7 (Polish)            — requires all user story phases complete
```

### User Story Dependencies

- **US1 (P1, Filter)**: Phase 1 + Phase 2 complete → can start. No dependency on US2/US3/US4.
- **US2 (P2, Sort)**: Phase 2 complete → frontend work can start immediately. No dependency on US1.
- **US4 (P2, Pagination)**: Phase 1 complete → backend work. Phase 2 complete → frontend work. No dependency on US1/US2.
- **US3 (P3, Columns)**: Phase 2 complete → can start. Pure frontend, no backend dependency.

### Within Each User Story

- Backend test → backend implementation (sequential, test-first)
- Frontend types (Phase 2) → hook → panel component (sequential)
- Hook + panel → EntityToolbar integration (sequential)
- EntityToolbar → page integration (sequential within each page)
- Page integration tasks for *different pages* are [P] (parallel)

### Parallel Opportunities

- T001 and T003 within Phase 1 can run in parallel (different files)
- T002 and T004 can run in parallel once T001 and T003 pass respectively
- Phase 1 and Phase 2 can run in parallel (entirely different stack layers)
- T011 and T012 (hook + panel for US1) can run in parallel (different files)
- T016 and T017 (hook + panel for US2) can run in parallel
- T026 and T027 (hook + panel for US3) can run in parallel
- T031, T032 (Finance page integrations in Phase 7) can run in parallel
- All i18n tasks ([P] marked) can run in parallel with implementation tasks

---

## Parallel Example: Phase 3 (US1 — Filter)

```
# After Phase 1 and Phase 2 are complete:

Parallel batch 1 — run together:
  T008: Write failing backend filter integration tests
  T011: Create useEntityFilter hook
  T012: Create FilterPanel.tsx

Sequential:
  T009: Implement backend wiring (makes T008 pass)      ← after T008
  T010: Wire other Finance viewsets                     ← after T009 (same file)
  T013: Update service functions                        ← after T009
  T014: Integrate into AccountsPage                    ← after T011, T012, T013

Parallel with T014:
  T015: Add i18n keys                                  ← after T012
```

---

## Implementation Strategy

### MVP (Phase 1 + Phase 2 + Phase 3 only — ~15 tasks)

1. Phase 1: Backend infrastructure (T001–T004)
2. Phase 2: Frontend foundation (T005–T007)
3. Phase 3: US1 filter end-to-end on Accounts page (T008–T015)
4. **STOP and VALIDATE**: Apply a filter on Accounts, confirm list narrows, URL updates, close without Apply discards
5. Demo: Filter is the highest-value operation and is independently testable as a complete feature

### Incremental Delivery

1. MVP: Filter → demo
2. Add Sort (US2): header-click + panel, Accounts page → demo
3. Add Pagination (US4): Accounts offset + BalanceSheets cursor → demo
4. Add Column Control (US3): visibility/order/sticky → demo
5. Polish: extend to all Finance pages, quality loop

### Suggested Single-Developer Order

Complete phases sequentially: 1 → 2 → 3 → 4 → 5 → 6 → 7. Within each phase, complete the [P]-marked tasks first (run in parallel if possible) then the sequential ones.

---

## Notes

- [P] tasks touch different files and have no dependency on incomplete tasks in the same phase — safe to run simultaneously
- Backend tasks follow Constitution Principle V test-first: tests in T001/T003/T008/T021 MUST fail before T002/T004/T009/T022 implement
- Column config (US3) is purely frontend — no backend changes required
- The `ordering` query param for sort already works via DRF `OrderingFilter` in Finance viewsets — no new backend code needed for US2
- `EntityToolbar` is a shared component — once built in Phase 2–3, it is extended (not rewritten) in subsequent phases
- Pagination changes the service function return type from `T[]` to `OffsetPaginatedResponse<T>` — this is a **breaking change** to existing callers; T013 must update all call sites in the same commit to avoid TypeScript errors
- All 37 tasks follow strict checklist format: checkbox, ID, [P]?, [Story]?, description with file path
