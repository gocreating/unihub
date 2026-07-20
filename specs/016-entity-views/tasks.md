# Tasks: Entity Views

**Input**: Design documents from `/specs/016-entity-views/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/entity-views-api.md, contracts/view-url-serialization.md, quickstart.md

**Tests**: INCLUDED — constitution Principle V mandates backend TDD (red-green), and the project's standing rule is tests-before-implementation on both sides.

**Organization**: Grouped by user story. Frontend paths are relative to `apps/unihub/frontend/`, backend paths to `apps/unihub/backend/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (save/reopen), US2 (tabs), US3 (URL), US4 (manage)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared type + i18n scaffolding every later task builds on

- [ ] T001 Add `ViewConfig` + `ViewColumn` interfaces (per data-model.md §2) to apps/unihub/frontend/src/components/EntityToolbar/types.ts and export them
- [ ] T002 [P] Add base `common.entityViews.*` locale keys (tabular, view, save, saveAs, duplicate, edit, newView, unsavedIndicator aria-label) to BOTH apps/unihub/frontend/src/locales/en-US/pages.ts and apps/unihub/frontend/src/locales/zh-TW/pages.ts (ICU plurals for any counts)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend EntityView API + frontend serialization/hook plumbing that ALL user stories require

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend (TDD — tests first, must fail, then implement to green)

- [ ] T003 Write FAILING pytest suite per contracts/entity-views-api.md test contract (11 tests: auth, table_key scoping, owner scoping via second user, missing name 400, duplicate name 400 / other-table 201, config-must-be-object, PATCH rename/pin/position + table_key-immutable 400, delete 204→404, reorder happy path, reorder foreign/mixed-id 400, position-appended-on-create) in apps/unihub/backend/tests/test_entity_views.py using the existing `force_login` fixture recipe
- [ ] T004 Create `EntityView` model (nanoid PK via core.nanoid, owner FK auth.User CASCADE, table_key indexed, name, config JSONField, pinned, position, timestamps, UniqueConstraint(owner, table_key, name), ordering position/created_at) in apps/unihub/backend/core/models.py + migration apps/unihub/backend/core/migrations/0005_entityview.py
- [ ] T005 Create `EntityViewSerializer` (owner excluded, config-is-dict validation, name/table_key strip+length validation, unique-name → stable 400 message, table_key immutable on update) in apps/unihub/backend/core/serializers.py
- [ ] T006 Create `EntityViewViewSet` (ModelViewSet get/post/patch/delete, queryset owner-filtered, `?table_key=` list filter, `pagination_class = None`, `perform_create` stamps owner + appends position, `@action reorder` per contract) in apps/unihub/backend/core/views.py and register `entity-views` on the router in apps/unihub/backend/core/urls.py
- [ ] T007 Register `core.entityview` TableDescriptor (fk_content_type_label override owner→auth.user, import_order after existing core tables) in apps/unihub/backend/core/apps.py — if the registry cannot represent the auth.user FK, record the deferral explicitly in code comment + plan.md per Principle I
- [ ] T008 Green + quality loop: `uv run pytest tests/test_entity_views.py` passes, then `uv run ruff format . && uv run ruff check . --fix && uv run pytest` from apps/unihub/backend/

### Frontend foundation

- [ ] T009 [P] Add `EntityView` service type + `listEntityViews(tableKey)`, `createEntityView(payload)`, `updateEntityView(id, patch)`, `deleteEntityView(id)`, `reorderEntityViews(tableKey, ids)` (existing fetchJson/CSRF pattern) in apps/unihub/frontend/src/services/unihub-backend/core.ts; regenerate apps/unihub/frontend/src/generated/api-types.ts via `pnpm generate-types` with the backend running
- [ ] T010 [P] Write FAILING unit suite for URL serialization per contracts/view-url-serialization.md (serialize/parse round-trip on visible facets, saved+overrides layering, malformed-input fallbacks returning null+reason, per-namespace isolation, bracket-name tolerance, both contract examples) in apps/unihub/frontend/src/components/EntityViews/serialization.test.ts
- [ ] T011 Implement `serialization.ts` (ViewConfig ↔ `view[<tableKey>]` inner mini-format; reuse `rulesToOrdering`/`orderingToRules` and JSON filters; visible-columns compaction + default-based reconstruction; page transport) in apps/unihub/frontend/src/components/EntityViews/serialization.ts until T010 is green
- [ ] T012 [P] Add `loadGroups(groups)` (sets active AND pending) + tests in apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntityFilter.ts and useEntityFilter.test.tsx
- [ ] T013 [P] Add `loadRules(rules)` (sets active+pending, bumps `panelApplyCount` for the remount-key pattern) + tests in apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntitySort.ts and useEntitySort.test.tsx
- [ ] T014 [P] Add `loadState(columns, sticky)` with drift reconciliation (unknown keys dropped, missing runtime keys appended with default visibility, labels stay runtime) + tests in apps/unihub/frontend/src/components/EntityToolbar/hooks/useColumnConfig.ts and useColumnConfig.test.ts
- [ ] T015 Add `snapshotConfig(): ViewConfig`, `loadConfig(config)` (delegates to the three load* + setLimit/offset), expose `pageSize`, thread `key` through as `tableKey` + tests in apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntityTable.ts and useEntityTable.test.tsx (depends on T012–T014)
- [ ] T016 [P] Add optional `viewBar?: ReactNode` slot rendered inside the white pageCard between title row and toolbar row (Principle VII structure stays PageTable-owned) in apps/unihub/frontend/src/components/PageTable/index.tsx

**Checkpoint**: API live + serialization/hook plumbing green — user stories can begin

---

## Phase 3: User Story 1 — Save a table configuration and reopen it later (Priority: P1) 🎯 MVP

**Goal**: Configure a table, save as a named view, reopen it later with one click; dirty indicator + Save on change

**Independent Test**: quickstart.md steps 1–4 on /inventory/catalog — save a config, reset, reopen via View ▾, exact restore; dirty dot appears on edit and clears on Save

- [ ] T017 [P] [US1] Write FAILING RTL suite for `useEntityViews` (renders default Tabular tab from page defaults, snapshot-vs-baseline dirty calc, open saved view applies config via loadConfig, save persists + clears dirty, save-as creates named view, ZERO API calls before explicit save — staged-mutation rule) in apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx
- [ ] T018 [P] [US1] Write FAILING RTL suites for `ViewTabs` (active tab render, unsaved dot, i18n'd Tabular label) and `SaveViewModal` (name prompt, Cancel-left/Save-right footer, dirty-guarded close, duplicate-name 400 surfaced inline) in apps/unihub/frontend/src/components/EntityViews/ViewTabs.test.tsx and SaveViewModal.test.tsx
- [ ] T019 [US1] Implement `useEntityViews({tableKey, table, defaultConfig})` core — React Query fetch of saved views, ViewTab state (default + saved kinds), normalized dirty compare (research R7), open/save/save-as mutations with cache invalidation in apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts (green T017)
- [ ] T020 [US1] Implement `SaveViewModal.tsx` (AntD Modal, name input, primary right / Cancel left, no outside-click close when dirty) in apps/unihub/frontend/src/components/EntityViews/SaveViewModal.tsx (green T018 half)
- [ ] T021 [US1] Implement `ViewTabs.tsx` (tab strip with active highlight + dirty dot, OverflowTooltip labels) and `ViewDropdown.tsx` (right-edge View ▾: saved-view list opens views, Save enabled only when a view is dirty; panel maxHeight 60vh internal scroll) in apps/unihub/frontend/src/components/EntityViews/ — all strings via formatMessage, BOTH locales updated in the same commit
- [ ] T022 [US1] Wire the reference page: `tableKey: 'inventory-catalog'`, `useEntityViews`, `viewBar={<ViewTabs …/>}`, remount key gains active-tab identity in apps/unihub/frontend/src/pages/inventory/catalog/index.tsx + extend apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx
- [ ] T023 [US1] Checkpoint: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from apps/unihub/frontend/ + manual quickstart steps 1–4

**Checkpoint**: US1 fully functional on the catalog — MVP

---

## Phase 4: User Story 2 — Work across multiple views with tabs (Priority: P2)

**Goal**: Pinned tabs per account, session tabs, `[+]` scratch tab, tab switching preserves per-tab config, narrow-screen overflow scroll

**Independent Test**: Pin views, open extras, switch between them, reload (session restore), fresh session (only pinned return), shrink window (tabs scroll, edges fixed)

- [ ] T024 [P] [US2] Write FAILING tests: pinned views merge as tabs in position order, `[+]` opens anonymous tab with default config instantly, tab switch preserves each tab's config, sessionStorage (`unihub.views.<tableKey>`) persists/restores open tabs + active id, close unpinned tab removes it, closed-session simulation drops anonymous tabs — extend apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx and ViewTabs.test.tsx
- [ ] T025 [US2] Implement in apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts: pinned-tab merge, `addAnonymousTab()`, `closeTab()` (unpinned only), `switchTab()` (snapshot current → load target), sessionStorage persistence layer
- [ ] T026 [US2] Implement tab-strip layout in apps/unihub/frontend/src/components/EntityViews/ViewTabs.tsx: `[+]` fixed left, scrollable middle (`overflow-x auto`, no wrap), View control fixed right, per the issue mockup `[+] _Tab1_ Tab2 Tab3 [View]`; close affordance on unpinned tabs
- [ ] T027 [US2] Write Playwright e2e for row layout + narrow screen (tab strip scrolls horizontally while `[+]`/`[View]` stay at the edges — geometry assertions per project rule) in apps/unihub/frontend/e2e/entity-views.spec.ts (dev server on :3001)
- [ ] T028 [US2] Checkpoint: frontend quality loop + quickstart step 8

**Checkpoint**: US1 + US2 work independently

---

## Phase 5: User Story 3 — Share and deep-link a view via URL (Priority: P3)

**Goal**: Active view state always in the URL (`view[<tableKey>]`); opening/changing such URLs navigates directly; saved-ref + overrides; graceful fallbacks

**Independent Test**: Copy URL mid-config → private window reproduces state; edit `view[...]` param → table follows; bad id/corrupt payload → Tabular + warning

- [ ] T029 [P] [US3] Write FAILING tests: on-mount parse activates described view, query-string change navigates (back/forward), config edits `replace` URL while tab switches `push`, `type=saved&id&overrides` opens dirty tab with overrides layered, unknown id / corrupt inner / bad JSON → Tabular fallback + `message.warning`, `page` transports to offset, second-namespace param untouched — extend apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx (React Router test harness with MemoryRouter + real search params)
- [ ] T030 [US3] Implement URL sync in apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts via `useSearchParams`: continuous outbound serialization of the active tab (replace/push semantics per contract §Behavioral 1–2), inbound watcher, page↔offset transport, fallback handling
- [ ] T031 [US3] Add fallback warning i18n keys (`common.entityViews.unresolvedView`, `common.entityViews.invalidView`) to BOTH locale files in apps/unihub/frontend/src/locales/en-US/pages.ts and zh-TW/pages.ts, surfaced via `message.warning`
- [ ] T032 [US3] Extend apps/unihub/frontend/e2e/entity-views.spec.ts: deep-link an inline config URL → exact table state on load; saved-ref + `page_size` override → dirty dot visible
- [ ] T033 [US3] Checkpoint: frontend quality loop + quickstart step 6

**Checkpoint**: All URL scenarios from spec US3 pass

---

## Phase 6: User Story 4 — Organize saved views (Priority: P4)

**Goal**: Edit modal (rename/pin/unpin/reorder/delete — staged until Save), Duplicate to `X (1)`, `X (2)`…

**Independent Test**: Open View ▾ → Edit, stage several changes, Cancel (nothing persisted), redo + Save (all persisted, deletions confirmed); Duplicate yields first-unused suffix

- [ ] T034 [P] [US4] Write FAILING RTL suite for `ManageViewsModal`: lists views, staged rename/pin/reorder/delete with ZERO API calls before Save, Cancel discards, Save commits (DELETEs + PATCHes + reorder + single cache invalidation), Save-with-deletions first shows `Modal.confirm` `okType:'danger'` with ICU-plural count, deleting a view open in a tab converts that tab to anonymous with same config (FR-019) in apps/unihub/frontend/src/components/EntityViews/ManageViewsModal.test.tsx; plus duplicate-suffix tests (`X (1)`, skip taken → `X (2)`) in useEntityViews.test.tsx
- [ ] T035 [US4] Implement `ManageViewsModal.tsx` (staged local state; reuse EntityToolbar `SortableList` for drag-reorder; rename inline with unique-name validation; pin toggles; delete marks; footer Cancel-left/Save-right; dirty-guarded close) in apps/unihub/frontend/src/components/EntityViews/ManageViewsModal.tsx + commit logic in useEntityViews.ts (`reorderEntityViews` bulk + patches/deletes)
- [ ] T036 [US4] Add Duplicate to `ViewDropdown.tsx` + `duplicateActiveTab()` first-unused-suffix logic in useEntityViews.ts; locale keys both files
- [ ] T037 [US4] Checkpoint: frontend quality loop + quickstart steps 5, 7

**Checkpoint**: All four user stories independently functional on the catalog

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T038 [P] Adopt views on apps/unihub/frontend/src/pages/inventory/scenarios/index.tsx (`tableKey: 'inventory-scenarios'`) + page test update
- [ ] T039 [P] Adopt views on apps/unihub/frontend/src/pages/finance/accounts/index.tsx (`finance-accounts`) + AccountsPage.test.tsx update
- [ ] T040 [P] Adopt views on apps/unihub/frontend/src/pages/finance/currencies/index.tsx (`finance-currencies`) + page test update
- [ ] T041 [P] Adopt views on apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx (`finance-exchange-rates`) + page test update
- [ ] T042 Full quality loop both sides: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` (backend) and `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (frontend); run e2e entity-views.spec.ts against the dev stack
- [ ] T043 Execute quickstart.md end-to-end; verify every spec.md acceptance scenario + edge case; tick specs/016-entity-views/checklists/requirements.md if anything drifted
- [ ] T044 Update CLAUDE.md SPECKIT block with the shipped-iteration summary for 016-entity-views

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: none — start immediately
- **Foundational (P2)**: needs T001; T003→T004→T005→T006→T008 strictly ordered (TDD); T007 after T004; T009 after T006; T010→T011; T012–T014 after T001; T015 after T012–T014; T016 independent
- **US1 (P3)**: needs ALL of Phase 2
- **US2 (P4)**: needs US1 (extends useEntityViews/ViewTabs files)
- **US3 (P5)**: needs US1 (URL sync layers on the same hook); independent of US2 except shared files — run after US2 to avoid same-file conflicts
- **US4 (P6)**: needs US1 (+ ViewDropdown from T021); after US3 for same-file ordering
- **Polish (P7)**: T038–T041 need US1 minimum (ideally all stories); T042–T044 last

### User Story Dependencies

US2, US3, US4 all extend US1's `useEntityViews.ts`/`ViewTabs.tsx` — sequential story order (P1→P2→P3→P4) is the conflict-free path for a single implementer. Each story remains independently TESTABLE at its checkpoint.

### Parallel Opportunities

- Phase 2: {T003-backend chain} ∥ {T010→T011} ∥ {T012, T013, T014 mutually} ∥ T016
- Phase 3: T017 ∥ T018 (different test files)
- Phase 7: T038 ∥ T039 ∥ T040 ∥ T041 (different pages)

## Parallel Example: Phase 2 kickoff

```bash
# After T001–T002, launch simultaneously:
Task: "T003 failing backend suite in backend/tests/test_entity_views.py"
Task: "T010 failing serialization suite in frontend/src/components/EntityViews/serialization.test.ts"
Task: "T012 loadGroups in useEntityFilter.ts"
Task: "T013 loadRules in useEntitySort.ts"
Task: "T014 loadState in useColumnConfig.ts"
Task: "T016 viewBar slot in PageTable/index.tsx"
```

## Implementation Strategy

**MVP first**: Phases 1–3 only → saved views work end-to-end on the inventory catalog (save, reopen, dirty+Save). Stop, validate, demo.

**Incremental delivery**: +US2 (tabs/pins/session) → +US3 (URLs) → +US4 (manage/duplicate) → Polish (all five pages + full loops). Every checkpoint leaves the app shippable; earlier stories never break (each checkpoint reruns the full frontend suite).

## Notes

- Backend tasks are strict red-green: T003 MUST fail before T004–T007 begin; frontend test-first tasks (T010, T017, T018, T024, T029, T034) likewise precede their implementations.
- i18n: every UI task adds its keys to BOTH locale files in the same commit (Principle VIII); counts use ICU plurals.
- Staged-mutation rule (project memory): SaveViewModal/ManageViewsModal must be provably API-silent before Save — locked by T017/T034 zero-call assertions.
- Commit after each task or logical group.
