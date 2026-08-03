# Tasks: Entity Views — Round 4

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-04, plan.md round 4, research.md R29–R36, data-model.md, contracts/)

**Prerequisites**: Rounds 1–3 are implemented (round 3's 26-task list completed in the working tree; its ship note lands with this round's commit). This list covers round 4 only. TDD is mandatory (constitution V): backend tests red before implementation; component/hook tests written against the new API before the rewrite.

**Organization**: Tasks are grouped by user story. Round-4 directives map: no-prompt Save + "New view" auto-label → US1; blank "Add empty view", drag-stretch fix, kebab cleanup → US2; id-based URL reference → US3; Rename dialog, duplicate naming, promotion fixes, menu dismissal, manage-modal removal → US4; the non-unique-name backend contract is story-independent → Foundational.

**Migration**: this round adds **core/0007** (constraint removal only). Together with the still-unapplied 0006, a deploy now carries two pending migrations.

## Phase 1: Setup

- [ ] T001 Confirm green baseline: `uv run ruff check . && uv run pytest` from `apps/unihub/backend/` and `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; record counts for the ship report

## Phase 2: Foundational (blocking prerequisites)

**Backend — names become non-unique labels (TDD: T002/T003 red before T004–T005)**

- [ ] T002 [P] Write failing `TestNonUniqueNames` (contract tests 30–33: two views with the same `(owner, table_key, name)` both 201 with distinct ids; PATCH renaming onto an existing name → 200; `"  Sales  "` stored as `"Sales"` on create AND rename; `"   "` → 400 on create and rename) in `apps/unihub/backend/tests/test_entity_views.py`; delete the superseded `test_create_duplicate_name_same_table` and drop the rename-collision assertion from `test_patch_rename_pin_position`
- [ ] T003 [P] Write failing `test_duplicate_names_survive_sync_round_trip` (contract test 34 — two same-named views publish → wipe → checkout back as two distinct rows with ids preserved) in `apps/unihub/backend/tests/test_entity_views_io.py`
- [ ] T004 Remove `UniqueConstraint(owner, table_key, name)` from `EntityView.Meta.constraints` in `apps/unihub/backend/core/models.py` and generate `apps/unihub/backend/core/migrations/0007_*.py` (`RemoveConstraint` only — no field changes, so the data_io descriptor and CSV headers are untouched)
- [ ] T005 Drop the name-collision branch from `EntityViewSerializer.validate()` in `apps/unihub/backend/core/serializers.py`, keeping `validate_name`'s strip + reject-blank — T002/T003 green; run the full backend suite so the round-3 `TestDefaultTransfer` stays green
- [ ] T006 Regenerate the OpenAPI schema (spectacular file route) + `pnpm generate-types` in `apps/unihub/frontend/`; confirm the schema diff is EMPTY (a constraint change must not alter the contract)

**Frontend — shared strings**

- [ ] T007 [P] Update `apps/unihub/frontend/src/locales/en-US/pages.ts` and `apps/unihub/frontend/src/locales/zh-TW/pages.ts` in the same commit: ADD the rename-dialog keys (`renameViewTitle`, reusing `viewName`/`viewNameRequired`); REMOVE the keys orphaned by this round (`saveViewTitle`, `duplicateName`, `manageTitle`, `manageViews`, `manageSaveError`, `savedList`, `noSaved`, `edit`)

**Checkpoint**: backend accepts duplicate/trimmed names with the default-transfer suite still green; the API contract is provably unchanged; strings are ready.

## Phase 3: User Story 1 — Save a table configuration and reopen it later (P1)

**Goal (round-4 delta)**: Save is a single interaction with no dialog anywhere — a tab that has no stored view is created under its current label, and a fresh scratch tab is auto-labelled "New view".

**Independent test**: open a scratch tab (labelled "New view"), adjust a filter, choose Save from its menu → the view is stored under "New view" with no prompt and the dirty dot clears; a second scratch tab saves under the same label without error.

- [ ] T008 [P] [US1] Write failing RTL tests (`saveTab` on a tab with no `viewId` POSTs `{name: <tab label>, config}` and binds the created id to that tab; `saveTab` never returns `'needs-name'`; saving two scratch tabs under the identical auto-label succeeds) in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`
- [ ] T009 [US1] Implement the no-prompt save in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: `saveTab` creates the view when the tab has none (using its current label), the `'needs-name'` outcome and `saveTabAs` are removed from `UseEntityViewsReturn`, and `saveTab` resolves to `'saved'` in every path — T008 green
- [ ] T010 [US1] Auto-label new scratch tabs "New view" at creation in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts` (localized via the existing `newViewName` key, stored on the tab so the label survives a reload), and DELETE `apps/unihub/frontend/src/components/EntityViews/SaveViewModal.tsx` + `SaveViewModal.test.tsx`, removing the `onNeedsName` prop from `ViewTabMenu.tsx` and its modal state from `ViewTabs.tsx`

**Checkpoint**: US1 delta done — saving is one click, always.

## Phase 4: User Story 2 — Work across multiple views with tabs (P2)

**Goal (round-4 delta)**: "Add empty view" yields a genuinely blank configuration; a dragged tab keeps its own width; the kebab carries only Add and Open.

**Independent test**: on the inventory catalog (whose default view carries the seeded YTD filter), Add empty view → the new tab shows NO filter conditions, no sort, every column visible in natural order, nothing pinned; dragging a wide tab past a narrow one shows no width distortion; the kebab has exactly two entries.

- [ ] T011 [P] [US2] Write failing tests for `blankConfig` (empty filters/sort, every page column visible in declared order with sequential `order` and no `pin`, page default `pageSize`) and for the add-tab action using it, in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`
- [ ] T012 [US2] Export `blankConfig(defaults: ViewConfig): ViewConfig` from `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts` per data-model §2 and use it in the add-tab action (renamed `addBlankTab`, replacing `addAnonymousTab`'s use of `defaultConfig`); update the `ViewKebab.tsx` call site — T011 green
- [ ] T013 [P] [US2] Write a failing test asserting a horizontal `SortableList` item's inline transform contains NO `scale` component (only `translate`), in `apps/unihub/frontend/src/components/EntityToolbar/SortableList.test.tsx`
- [ ] T014 [US2] Use `CSS.Translate.toString(transform)` for `orientation === 'horizontal'` (keeping `CSS.Transform.toString` for the vertical default) in `apps/unihub/frontend/src/components/EntityToolbar/SortableList.tsx` — T013 green, and the dragged tab stops stretching (R33/FR-027)
- [ ] T015 [US2] Remove the "Manage views…" entry from `apps/unihub/frontend/src/components/EntityViews/ViewKebab.tsx` and its `onOpenManage` prop; update `ViewKebab.test.tsx` to assert exactly two entries (Add empty view · Open ▸)

**Checkpoint**: US2 delta done — blank means blank, drags look right, the kebab is minimal.

## Phase 5: User Story 3 — Share and deep-link a view via URL (P3)

**Goal (round-4 delta)**: `<tableKey>.view=` carries the view id, so duplicate names cannot make a link ambiguous and renames never break links.

**Independent test**: activate a saved view → the URL shows `?<tableKey>.view=<12-char id>`; rename that view and reload the same URL → it still resolves to that view; a bogus id falls back to the default view with a notice.

- [ ] T016 [P] [US3] Update the serialization suite in `apps/unihub/frontend/src/components/EntityViews/serialization.test.ts` for id-based references (emit `view=<id>`, parse an id, no name lookup, unresolvable id → fallback) and drop the round-2 "matches the page default name while virtual" cases
- [ ] T017 [US3] Change the `view` facet to carry the saved-view id in `apps/unihub/frontend/src/components/EntityViews/serialization.ts` (`serializeSavedEntries` takes an id; the parser returns `viewId` instead of `viewName`) per contracts/view-url-serialization.md v2.1 — T016 green
- [ ] T018 [US3] Resolve inbound references by id and emit ids outbound in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`; a tab with no stored view (scratch tab or still-virtual page default) emits NO `.view` and serializes inline — PRESERVE the `lastProcessedRef`/`lastParamRef` separation (round-1 ping-pong guard)

**Checkpoint**: US3 delta done — links are exact and rename-proof.

## Phase 6: User Story 4 — Organize saved views (P4)

**Goal (round-4 delta)**: Rename is a prefilled dialog; a duplicate keeps its source's name; promoting a view disturbs nothing; menus dismiss on outside click and Esc; the management modal is gone.

**Independent test**: tab menu → Rename opens a modal prefilled with the current name (trims on commit, refuses blank); Duplicate produces an identically-named tab; promoting the third tab leaves it third with no dirty dot on either tab; clicking the table body closes an open menu; the kebab offers no Manage entry.

- [ ] T019 [P] [US4] Write failing RTL tests for the rename dialog (opens prefilled from the tab menu; commits a trimmed name via `renameTab`; refuses a blank/whitespace-only name; Cancel and Esc leave the name unchanged; on a tab with no stored view it relabels locally without any API call) in NEW `apps/unihub/frontend/src/components/EntityViews/RenameViewModal.test.tsx`
- [ ] T020 [US4] Create `apps/unihub/frontend/src/components/EntityViews/RenameViewModal.tsx` (AntD `Modal`, auto-focused prefilled input, Enter submits, Cancel left / primary right, no `maskClosable` while the value differs) and wire it into `apps/unihub/frontend/src/components/EntityViews/ViewTabs.tsx`, REMOVING the round-3 inline rename input — T019 green
- [ ] T021 [P] [US4] Write a failing test asserting `duplicateTab` names the copy exactly like its source (no "(1)" suffix) in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`, and update `ViewTabMenu.test.tsx`'s duplicate expectation
- [ ] T022 [US4] Drop the first-unused-suffix logic from `duplicateTab` in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts` — T021 green (FR-015)
- [ ] T023 [P] [US4] Write failing tests for the promotion defects (promoting a currently-unpinned session tab does NOT move it in the strip; neither the promoted nor the demoted tab is dirty afterwards, including when the demoted one was the ACTIVE tab with live config) in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`
- [ ] T024 [US4] Fix both defects in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts` per R32: the pinned-merge effect preserves the current strip order for already-open tabs and only inserts genuinely new pinned tabs (by `position`); `setDefaultTab` snapshots the active tab's live config into tab state BEFORE swapping identities — T023 green (FR-026/SC-011)
- [ ] T025 [P] [US4] Write failing tests (a `mousedown` outside the menu and its tab closes it; `Escape` closes it; a click INSIDE the menu does not close it before the action runs) in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.test.tsx`
- [ ] T026 [US4] Add the document-level `mousedown`/`keydown` dismissal in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.tsx` while a tab menu is open (ignore targets inside `.ant-dropdown` or the owning tab), per R36 — T025 green
- [ ] T027 [US4] DELETE `apps/unihub/frontend/src/components/EntityViews/ManageViewsModal.tsx` + `ManageViewsModal.test.tsx`, remove its render and state from `ViewTabs.tsx`, and remove `commitManageChanges` + the `ManageChanges` type from `useEntityViews.ts` and its tests (every capability is tab-addressed — R34/FR-017)

**Checkpoint**: US4 delta done — one dialog, one management surface, no side effects.

## Phase 7: Polish & Cross-Cutting

- [ ] T028 [P] Update e2e `apps/unihub/frontend/e2e/entity-views.spec.ts`: add the SC-010 width lock (measure the dragged tab's `boundingBox().width` mid-drag and assert it stays within 2px of its resting width — a real-browser assertion per the visual-geometry rule), and update the helper flows that used the Save-view modal (`createSavedView` now uses Rename + Save) and the removed kebab entry
- [ ] T029 [P] Sweep for stale references: `grep -rn "SaveViewModal\|ManageViewsModal\|commitManageChanges\|duplicateName\|manageTitle\|savedList\|needs-name" apps/unihub/frontend/src apps/unihub/frontend/e2e` returns nothing outside git history
- [ ] T030 Full quality loops: backend `uv run ruff format . && uv run ruff check . --fix && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — user rule). The e2e suite is NOT run here (the live stack serves real data and these specs write saved views); it awaits a human run
- [ ] T031 Update `CLAUDE.md` (round-4 SHIPPED note replacing the IN PROGRESS paragraph: what landed, test counts, gotchas) and note that BOTH migrations 0006 and 0007 are pending on the running docker stack

## Dependencies

- Phase 2 blocks everything: T004/T005 need T002/T003 red first; T006 needs T005; T007 is independent [P].
- US1 (T008–T010) needs T005 (duplicate names must be accepted before two scratch tabs can share the auto-label). US2 (T011–T015) and US3 (T016–T018) are independent of US1 and of each other. US4's T019–T022 need T007 (strings) and T010 (the inline input is removed alongside the modal cleanup); T023–T024 are independent of the rest of US4; T027 must follow T015 (kebab entry first, then the component).
- Polish (T028–T031) last; T028 ∥ T029.

## Parallel opportunities

- T002 ∥ T003 (different test files); T007 ∥ the whole backend chain; T008 ∥ T011 ∥ T013 ∥ T016 ∥ T019 ∥ T021 ∥ T023 ∥ T025 (all test-authoring in distinct files, after Phase 2); T028 ∥ T029.
- US1, US2 and US3 have no interdependencies once Phase 2 lands — they can proceed in any order.

## Implementation strategy

Backend first (it unblocks duplicate names, which US1's auto-label depends on), then US1 → US2 → US3 → US4. The two defects the user called out (drag stretch T013–T014, promotion side effects T023–T024) are self-contained and can be pulled forward if they need to ship first. MVP scope if interrupted: Phase 2 + US1 + those two fix pairs — that covers every directive the user framed as broken rather than missing.
