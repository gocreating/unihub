# Tasks: Quick Search

**Input**: Design documents from `/specs/019-quick-search/` — [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (R1–R14), [data-model.md](data-model.md), [contracts/search-api.md](contracts/search-api.md), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — backend TDD is constitution-mandated (Principle V) and the user's standing preference (write tests before implementation, test the component/abstraction first).

**Organization**: Grouped by user story from spec.md. US1 (P1) is the MVP: after Phase 3 the search works end-to-end on all five tables and is view-scoped by construction.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

No setup tasks — existing app, no new dependencies, no migrations, no scaffolding. (Verified in plan.md Technical Context.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the core search primitive on each side — the backend filter class and the frontend debounce hook — which every story builds on.

- [ ] T001 Write failing unit tests for `EntitySearchFilter` in `apps/unihub/backend/tests/test_entity_search.py`, modeled on `tests/test_entity_filter.py` (FakeView + `APIRequestFactory`, Currency as the simple target model): absent/empty/whitespace `search` → queryset unchanged; case-insensitive substring match; union across declared fields (row matching on field B only is returned); `"cast"` kind matches a Decimal and a DateTime column textually; literal `%`/`_`/`(`/`)` treated as plain text (FR-013); a view with NO `searchable_fields` ignores the param (no 400); `search_attribute_values=True` matches a row whose only hit is an `AttributeValue.value`. Run `uv run pytest tests/test_entity_search.py` — MUST fail (class doesn't exist yet).
- [ ] T002 Implement `EntitySearchFilter(BaseFilterBackend)` in `apps/unihub/backend/core/filters.py` per research R2–R4: read+strip `search` param; build one OR'd `Q` across `searchable_fields` (`"text"` → `__icontains`; `"cast"` → `annotate(Cast(path, TextField()))` then `__icontains` on the alias); optional `Exists(AttributeValue.objects.filter(content_type=<view.attribute_content_type>, object_id=OuterRef("pk"), value__icontains=q))` leg when `search_attribute_values` is True (reuse `resolve`/content-type helpers from `core/attributes.py`); implement `get_schema_operation_parameters()` returning the `search` OpenAPI param (contracts/search-api.md); Google-style docstrings + full type hints. T001 suite goes green. Run `uv run ruff format . && uv run ruff check . && uv run pytest`.
- [ ] T003 [P] Write failing tests then implement shared debounce hook `useDebouncedValue<T>(value: T, delayMs = 300): T` in `apps/unihub/frontend/src/hooks/useDebouncedValue.ts` with `apps/unihub/frontend/src/hooks/useDebouncedValue.test.ts` (vitest fake timers: initial value immediate; updates only after the delay; rapid successive updates collapse to the final value; timer cleared on unmount).

**Checkpoint**: `EntitySearchFilter` green under unit tests; debounce hook green. No endpoint or page behavior changed yet.

---

## Phase 3: User Story 1 — Find records by typing free text (Priority: P1) 🎯 MVP

**Goal**: a search input in every entity table's toolbar that live-narrows the table across ALL attributes, with clearing restoring the un-searched view. (View scoping already holds by construction — AND composition — but its locks live in US2.)

**Independent Test**: on Finance→Currencies, type a fragment matching one currency's name → only it remains, no Enter pressed; clear → full list returns. On the catalog, a parameter-only fragment still matches (quickstart §1).

### Tests for User Story 1 (write first, red before green)

- [ ] T004 [P] [US1] Extend `apps/unihub/backend/tests/test_entity_search.py` with failing per-endpoint integration tests (auth_client GET real URLs, `?search=`): currencies match on `code`/`name`/`symbol`; accounts on `name`/`currency` + a `open_datetime` date fragment; exchange-rates on a `rate` decimal fragment ("31.05" matches 31.05000000) + a `date` fragment (the no-text-columns entity); items on `name`/`alias_name`/`spec`/`remark`/`url`, on `acquisition__source`, and on a dynamic-parameter value (create via `AttributeDefinition`+`AttributeValue` fixtures); acquisitions on `source`/`remark`; scenarios on `name` AND on `description` (searchable though un-filterable, R14); each endpoint: blank search returns everything, `count` reflects the searched set.
- [ ] T005 [P] [US1] Add failing tests to `apps/unihub/frontend/src/components/EntityToolbar/useEntityTable.test.tsx`: `searchQuery`/`setSearchQuery` exposed; `queryParams` contains `search` ONLY when the debounced trimmed value is non-empty (never `search: ''`); whitespace-only query → no `search` key; query change resets `offset` to 0; `snapshotConfig()` output has NO search key and `loadConfig()` does not touch the query (fake timers for the 300 ms debounce).
- [ ] T006 [P] [US1] Add failing tests to `apps/unihub/frontend/src/components/EntityToolbar/EntityToolbar.test.tsx`: when `searchProps` is passed, a search input renders after the Columns button; typing calls `onChange` per keystroke; the clear (allowClear ×) affordance calls `onChange('')`; no `searchProps` → no input (backward compatible); placeholder comes from i18n.

### Implementation for User Story 1

- [ ] T007 [P] [US1] Declare `searchable_fields` on the three finance viewsets in `apps/unihub/backend/finance/views.py` per the data-model §1 matrix (Currency: code/name/symbol text; Account: name/currency/color text + open_datetime/close_datetime cast; ExchangeRate: base_currency/quote_currency text + rate/date cast) and append `EntitySearchFilter` to each `filter_backends`. T004 finance legs go green.
- [ ] T008 [P] [US1] Declare `searchable_fields` on the three inventory viewsets in `apps/unihub/backend/inventory/views.py` per the matrix (Item: text fields + quantity/sku_price/deprecate_time cast + `acquisition__source`/`acquisition__remark` + `search_attribute_values = True`; Acquisition: source/remark text + request_time/obtained_at cast; Scenario: name/description text) and append `EntitySearchFilter` to each `filter_backends`. T004 inventory legs go green. Run full `uv run pytest`.
- [ ] T009 [US1] Wire search state into `useEntityTable` in `apps/unihub/frontend/src/components/EntityToolbar/useEntityTable.ts`: `searchQuery` state + `setSearchQuery`, debounce via `useDebouncedValue(searchQuery.trim(), 300)`, spread `search: debounced || undefined` into the `queryParams` memo, add the debounced value to the offset-reset effect deps (existing `skipNextOffsetResetRef` untouched — R8); `snapshotConfig`/`loadConfig` unchanged. Add `search?: string` to `EntityListParams` in `apps/unihub/frontend/src/components/EntityToolbar/types.ts` (both `buildEntityListQs` copies pass it through generically — no service edits). T005 goes green.
- [ ] T010 [US1] Add the search input to `apps/unihub/frontend/src/components/EntityToolbar/EntityToolbar.tsx`: optional `searchProps?: { value: string; onChange: (v: string) => void }`; AntD `Input` (prefix `SearchOutlined`, `allowClear`, i18n placeholder) rendered AFTER the Columns dropdown; convert the toolbar root to a full-width flex row with the input's wrapper `flex: 1 1 auto; min-width: 160px` (buttons keep intrinsic width); the input stays OUTSIDE the panel mutual-exclusion machinery (typing never closes/discards a dirty panel). Add locale key `common.entityOps.searchPlaceholder` to BOTH `apps/unihub/frontend/src/locales/en-US/pages.ts` and `apps/unihub/frontend/src/locales/zh-TW/pages.ts` in this task. T006 goes green.
- [ ] T011 [US1] Relax PageTable toolbar CSS in `apps/unihub/frontend/src/components/PageTable/index.tsx` (R10): `.ant-pro-table-list-toolbar-left` from `flex: none !important` to `flex: 1 1 auto !important; min-width: 0` so `headerTitle` content can stretch; verify existing suites (`pnpm test`) and eyeball non-entity `headerTitle` consumers (sync/io previews) render unchanged.
- [ ] T012 [P] [US1] Pass `searchProps={{ value: table.searchQuery, onChange: table.setSearchQuery }}` to `EntityToolbar` on the three finance pages: `apps/unihub/frontend/src/pages/finance/currencies/index.tsx`, `apps/unihub/frontend/src/pages/finance/accounts/index.tsx`, `apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx`.
- [ ] T013 [P] [US1] Same wiring on the two inventory pages: `apps/unihub/frontend/src/pages/inventory/scenarios/index.tsx` and `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`; on the catalog ALSO extend the `flatMode` memo (`index.tsx` ~L222-228) so a non-empty debounced search forces flat mode (R5 — search always queries the items endpoint).
- [ ] T014 [US1] Page-level locks: extend `apps/unihub/frontend/src/pages/finance/currencies/CurrenciesPage.test.tsx` (typing in the search box → mocked `listCurrencies` called with `search: <query>` after debounce; clearing → param gone) and `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx` (tree mode + non-empty search → `listItems` (flat) called with `search`; clearing returns to `listAcquisitions`). Fake timers for the debounce.

**Checkpoint**: quick search works end-to-end on all five tables; results are view-scoped (AND composition); URL/views untouched by construction. MVP shippable.

---

## Phase 4: User Story 2 — Search inside the active view (Priority: P2)

**Goal**: per-tab search context and hard locks that search narrows the view (never escapes it) and never touches view state (no dirty dot, no URL params, no saved-view payload).

**Independent Test**: quickstart §2 — a term matching in-scope and out-of-scope records returns only the in-scope one; each tab retains its own query; no dot, no URL params, nothing stored on save.

### Tests for User Story 2 (write first)

- [ ] T015 [P] [US2] Add the FR-004 lock to `apps/unihub/backend/tests/test_entity_search.py`: a request carrying BOTH a `filters` payload and `search` returns the intersection (a row matching the search but excluded by the filter is absent; the result set is a subset of the filters-only response).
- [ ] T016 [P] [US2] Add failing tests to `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`: (a) typing a query then `switchTab` to another tab clears the table's query, switching back restores it; (b) a newly added blank tab starts with an empty query; (c) with a search active, NO view URL params are emitted and the active tab shows NO dirty indicator — asserted via the round-8 `expectIndicatorMatchesUrl` discipline (check EMITTED PARAMS, not just the dot); (d) `saveTab` on a searching tab PATCHes/POSTs a `config` containing no search key.
- [ ] T017 [P] [US2] Add tests to `apps/unihub/frontend/src/components/EntityViews/useViewTabsState.test.ts`: `InternalTab.search` defaults to `''`/undefined on creation and the hook still persists NOTHING (`sessionStorage.length === 0` — round-13 rule).

### Implementation for User Story 2

- [ ] T018 [US2] Add `search?: string` to `InternalTab` in `apps/unihub/frontend/src/components/EntityViews/useViewTabsState.ts` (transient, per-visit — data-model §2 lifecycle table in a doc comment).
- [ ] T019 [US2] Wire per-tab context in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: `switchTab` snapshots the outgoing tab's query from `table.searchQuery` and calls `table.setSearchQuery(target.search ?? '')`; initialize `search: ''` at every tab-creation site (`addBlankTab`, `duplicateTab`, pinned-merge insertion, inbound `applyParsed` restoration); `resetTab` leaves the query untouched. DO NOT modify the five navigation guards (L210-243), `serialization.ts`, `normalizeConfig`, or `ViewConfig`. T016/T017 go green.

**Checkpoint**: per-tab search context works; searching provably cannot dirty a view, leak into the URL, or persist into a saved view.

---

## Phase 5: User Story 3 — See why each record matched (Priority: P3)

**Goal**: matched fragments render highlighted (`<mark>`) wherever they appear in visible columns; hidden-attribute matches still list the row, unmarked.

**Independent Test**: quickstart §3 — search a Name fragment → highlighted in the cell; hide that column → row stays, no mark.

### Tests for User Story 3 (write first)

- [ ] T020 [P] [US3] Write failing tests in `apps/unihub/frontend/src/components/HighlightText/SearchMark.test.tsx`: `SearchMark` renders plain text with no/empty context query; renders `<mark>` around every case-insensitive occurrence inside a `SearchHighlightProvider` with a query; non-string-safe inputs (number) are stringified; nested providers — nearest wins.
- [ ] T021 [P] [US3] Add a failing test to `apps/unihub/frontend/src/components/ItemDisplay/` suite (or create `ParameterTag` coverage in the existing ItemDisplay test file): `ParameterTag` with `highlight` marks matches inside the parameter value text.

### Implementation for User Story 3

- [ ] T022 [US3] Create `SearchHighlightContext` + `SearchMark` in `apps/unihub/frontend/src/components/HighlightText/SearchMark.tsx` (context default `''`; `SearchMark({ text })` reads context and delegates to the existing `HighlightText`; export `SearchHighlightProvider`); re-export from the component barrel. T020 green.
- [ ] T023 [US3] Add `highlight?: string` to `ParameterTag` in `apps/unihub/frontend/src/components/ItemDisplay/index.tsx` (value text through `HighlightText`, same pattern as spec/name); `ItemDisplay` forwards its existing `highlight` prop into its `ParameterTag`s. T021 green.
- [ ] T024 [P] [US3] Adopt highlighting on the finance pages — wrap each `PageTable` in `SearchHighlightProvider value={<debounced query>}` (expose the debounced value from `useEntityTable` as e.g. `activeSearch`) and route text cell renders through `SearchMark`: `pages/finance/currencies/index.tsx` (`code`/`name` gain render fns, `symbol` render wraps its string), `pages/finance/accounts/index.tsx` (name; currency Tag content; datetime cells' primary absolute row only — R9), `pages/finance/exchange-rates/index.tsx` (currency Tags, formatted rate, date primary row).
- [ ] T025 [P] [US3] Adopt highlighting on the inventory pages: `pages/inventory/catalog/index.tsx` (pass `highlight={<debounced query>}` to the Item cell's `<ItemDisplay>` — adding it to that `colDefMap` dep array — and route plain text/`displayText`-derived cells incl. `attr:*` columns and Remark through `SearchMark`); `pages/inventory/scenarios/index.tsx` (name inside the `<Link>`, description).
- [ ] T026 [US3] Page-level highlight locks: extend `CurrenciesPage.test.tsx` (searched fragment appears as `<mark>` in the matching visible cell; a cell not containing the query has no mark) and `CatalogPage.test.tsx` (mark inside ItemDisplay name and inside a parameter tag; a row matched only on a HIDDEN attribute renders without any mark — FR-007's second half).

**Checkpoint**: highlights render in visible columns on all five pages; hidden-attribute matches remain unmarked rows.

---

## Phase 6: User Story 4 — Typing stays smooth (Priority: P3)

**Goal**: consolidated lookups + latest-query-wins, locked by tests (the runtime wiring shipped inside US1 via the debounce; this phase locks SC-003/FR-009).

**Independent Test**: quickstart §4 — 10-character burst → 1–2 `search=` requests; final results match final text.

- [ ] T027 [P] [US4] Add SC-003/FR-009 locks to `apps/unihub/frontend/src/components/EntityToolbar/useEntityTable.test.tsx`: a 10-keystroke burst (fake timers, <300 ms apart) produces exactly ONE `queryParams` transition carrying the final full string (never an intermediate prefix); the input-facing `searchQuery` updates on every keystroke (responsive echo); typing then clearing before the debounce fires never emits a `search` param at all.
- [ ] T028 [P] [US4] Add a stale-response lock to `apps/unihub/frontend/src/pages/finance/currencies/CurrenciesPage.test.tsx`: mock `listCurrencies` so the response for query "a" resolves AFTER the response for "ab" (out-of-order); the table shows the "ab" results (React Query key isolation — FR-009).

**Checkpoint**: all four stories locked by unit/page tests.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T029 [P] Regenerate the OpenAPI artifact per R12: from `apps/unihub/backend/` run `uv run python manage.py spectacular --file /tmp/claude-1000/-home-cp-projects-gocreating-unihub-019-quick-search/47872915-cf79-4973-8f6d-2e14f0e3f6bf/scratchpad/openapi.yaml`, then from `apps/unihub/frontend/` run `pnpm exec openapi-typescript <that file> -o src/generated/api-types.ts`; verify the diff shows the new `search` query parameters on the six list operations.
- [ ] T030 [P] Write e2e spec `apps/unihub/frontend/e2e/quick-search.spec.ts` (repo conventions: header docstring with prereqs + run command, `login(page)` helper): type → rows narrow + `<mark>` appears; URL stays param-free and no dirty dot while searching; tab-switch restores per-tab queries; network probe counts ≤2 `search=` requests for a fast 10-char burst; catalog search flattens tree rows and clearing restores them. NOTE: listed but NOT run here — the live stack serves the user's real data (standing rule; human runs it via `pnpm test:e2e --grep "quick-search"`).
- [ ] T031 Full quality loops: backend `uv run ruff format . && uv run ruff check . && uv run pytest` from `apps/unihub/backend/`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from `apps/unihub/frontend/` (memory: `pnpm build` is stricter than typecheck — run it before committing). Fix anything red.
- [ ] T032 Update the CLAUDE.md Active Feature block (019 section) with shipped status, final test counts, and any gotchas discovered; note that quickstart.md §1–§6 and the e2e spec await a human run against the dev stack.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (Foundational)**: starts immediately — T001 → T002 (TDD pair, sequential); T003 independent [P].
- **Phase 3 (US1)**: T004 after T002 (needs the class); T005/T006 after T003 conceptually but writable in parallel (they mock time, not the hook); T007/T008 after T004 red; T009 after T005 red (and T003); T010 after T006 red; T011 with T010; T012/T013 after T009+T010; T014 last in phase.
- **Phase 4 (US2)**: needs US1's T009 (the table-side query state). T015 independent of frontend [P]. T016/T017 red → T018 → T019 green.
- **Phase 5 (US3)**: needs US1's wiring for page adoption; T020/T021 red → T022/T023 → T024/T025 [P] → T026.
- **Phase 6 (US4)**: needs T009; T027/T028 [P].
- **Phase 7**: after all stories. T029/T030 [P]; T031 gate; T032 final.

### User Story Dependencies

- **US1 (P1)**: only on Foundational. Independently testable (quickstart §1) — MVP.
- **US2 (P2)**: backend lock (T015) is independent; frontend tasks touch `useEntityTable`'s search state from US1 (T009). View-scoping itself already holds after US1 (AND composition) — US2 adds per-tab context + invariant locks.
- **US3 (P3)**: consumes the debounced query from T009; otherwise independent of US2.
- **US4 (P3)**: pure test locks over US1's wiring; independent of US2/US3.

### Parallel Opportunities

- T003 alongside T001/T002 (different stack).
- T004/T005/T006 together (three different test files).
- T007 ∥ T008 (different files); T012 ∥ T013 (different pages).
- After US1: US2 (T015–T019), US3 (T020–T026), US4 (T027–T028) are mutually independent phase-wise — interleave freely; within US3, T024 ∥ T025.
- T029 ∥ T030 in polish.

## Implementation Strategy

MVP = Phase 2 + Phase 3 (US1): search works on all five tables, view-scoped, URL/view-state-safe by construction. Then US2 (locks + per-tab context), US3 (highlighting), US4 (throttle locks) in order — each checkpoint independently verifiable via its quickstart section. Single implementer: sequential phases, using the [P] markers to batch same-shape edits (e.g. the five page adoptions).

## Notes

- Backend tests: red before green (constitution V); name `test_<function>_<scenario>`.
- The five `useEntityViews` navigation guards, `serialization.ts` FACETS, `normalizeConfig`, and `ViewConfig` are OFF-LIMITS (data-model §3) — any task touching them is mis-scoped.
- Never `search: ''` in `queryParams` (the pass-through serializer would emit `search=`).
- The search input must NOT join PageTable remount keys — a remount would drop input focus mid-typing.
- AntD test gotchas that will bite here: closed Dropdowns stay MOUNTED (`.ant-dropdown-hidden`); icon aria-labels join accessible names.
