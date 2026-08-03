# Tasks: Entity Views — Round 3

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-03, plan.md round 3, research.md R22–R28, data-model.md §7 menu matrix, contracts/entity-views-api.md)

**Prerequisites**: Rounds 1–2 are SHIPPED (their task lists are in git history at 467beff / 8e1f169). This list covers round 3 only. TDD is mandatory (constitution V): backend tests red before implementation; hook/component tests written against the new API before the rewrite.

**Organization**: Tasks are grouped by user story. Round-3 directives map: per-tab Save targeting a non-active tab → US1; hidden scrollbar + edge shadows, drag reorder, kebab replacing "+" and "View ▾" → US2; URL grammar untouched (regression only) → US3; per-tab dropdown menu (incl. close/rename relocation, Set as default) + manage-modal default row → US4; the transferable `is_default` backend contract is story-independent → Foundational.

**No migration this round** — `is_default`, `pinned`, `position` all exist since migration 0006; only their write rules change.

## Phase 1: Setup

- [ ] T001 Confirm green baseline: `uv run ruff check . && uv run pytest` from `apps/unihub/backend/` and `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; record counts for the ship report

## Phase 2: Foundational (blocking prerequisites)

**Backend — transferable default role (TDD: T002/T003 red before T004 turns them green)**

- [ ] T002 [P] Write failing `TestDefaultTransfer` (contract tests 20–28: promote transfers the role, promotion forces `pinned=True`, demoted view keeps pin/position/name/config, promotion changes no `position`, `{is_default: false}` → 400, promote with no existing default → 200, promoting the current holder is an idempotent 200, delete guard follows the role, no `IntegrityError` mid-swap) in `apps/unihub/backend/tests/test_entity_views.py`; delete the superseded `test_patch_cannot_change_is_default`
- [ ] T003 [P] Write failing `test_sync_round_trip_preserves_default_role` (contract test 29 — publish → wipe → checkout on the `bare_repo` fixture restores which view holds `is_default`) in `apps/unihub/backend/tests/test_entity_views_io.py`
- [ ] T004 Make `is_default` transferable in `apps/unihub/backend/core/serializers.py`: `validate_is_default` rejects only an explicit `false` on the current holder (message `"The default view cannot be unset; set another view as default instead."`); override `update()` to run inside `transaction.atomic()`, clearing the incumbent FIRST (`filter(owner, table_key, is_default=True).exclude(pk=instance.pk).update(is_default=False)`) then saving with `is_default=True` and `pinned=True` — per-statement constraint, so order matters (R25) — T002/T003 green; confirm the `destroy` guard in `apps/unihub/backend/core/views.py` needs no change (it reads the flag, not a fixed row)
- [ ] T005 Regenerate the OpenAPI schema (spectacular file route per the 018 precedent) + `pnpm generate-types` in `apps/unihub/frontend/`; confirm `is_default` is writable on PATCH in `apps/unihub/frontend/src/services/unihub-backend/core.ts`

**Frontend — shared capabilities the tab row needs**

- [ ] T006 [P] Add an additive `orientation?: 'vertical' | 'horizontal'` prop (default `'vertical'`) to `apps/unihub/frontend/src/components/EntityToolbar/SortableList.tsx` swapping `verticalListSortingStrategy` → `horizontalListSortingStrategy`, and configure `PointerSensor` with `activationConstraint: { distance: 5 }` so a click never starts a drag (R22); extend `apps/unihub/frontend/src/components/EntityToolbar/SortableList.test.tsx` (existing vertical callers unchanged, horizontal reorder works)
- [ ] T007 [P] Add round-3 i18n keys to `apps/unihub/frontend/src/locales/en-US/pages.ts` and `apps/unihub/frontend/src/locales/zh-TW/pages.ts` in the same commit — tab menu (`tabMenu.save/close/duplicate/pin/unpin/setDefault/rename/delete`), kebab (`kebab.addEmptyView/open/noViewsToOpen/manageViews`, aria-label `kebab.label`), and the set-as-default failure toast; re-purpose or remove the now-unused `common.entityViews.view` control label and the standalone `close` button label
- [ ] T008 [P] Write failing RTL tests for tab-addressed hook actions (`saveTab`/`duplicateTab`/`pinTab`/`setDefaultTab`/`deleteTab`/`reorderTabs` each act on the GIVEN tabId, never on the active one; `deleteTab` on a saved view converts that tab to anonymous per FR-019; `setDefaultTab` PATCHes `{is_default: true}` and refreshes the list so the demotion shows; `reorderTabs` POSTs the table's COMPLETE id order per R26; promoting while the default is still virtual converts the virtual tab to anonymous) in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`
- [ ] T009 Generalize `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts` from active-tab actions to tab-addressed ones (`saveTab(tabId)`, `duplicateTab(tabId, baseName)`, `pinTab(tabId, pinned)`, `setDefaultTab(tabId)`, `deleteTab(tabId)`, `reorderTabs(orderedTabIds)`; keep thin active-tab wrappers where modals need them), and DROP the round-2 "default tab is always first" invariant so tab order comes purely from `position` (R27/R28) — T008 green

**Checkpoint**: backend suite green with a transferable default role; hook exposes per-tab actions; shared drag supports a horizontal strip; all stories unblocked.

## Phase 3: User Story 1 — Save a table configuration and reopen it later (P1)

**Goal (round-3 delta)**: Save is no longer a single row-level action — it targets whichever tab asked for it, including a tab that is not active.

**Independent test**: right-click an inactive dirty saved tab → Save → that view's stored config updates and its dirty dot clears while the active tab is untouched; right-click an inactive anonymous tab → Save → the name modal opens and saves THAT tab.

- [ ] T010 [P] [US1] Write failing RTL tests (Save on a non-active dirty tab persists that tab's config and clears only its dirty dot; `SaveViewModal` opened from a non-active anonymous tab creates the view from that tab's config and binds the resulting id to it) in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.test.tsx`
- [ ] T011 [US1] Make the name-and-save flow tab-addressed in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.tsx` and `SaveViewModal.tsx`: track the requesting `tabId` in state and pass it to `saveTabAs(tabId, name)`, replacing the implicit active-tab assumption — T010 green

**Checkpoint**: US1 delta done — saving is unambiguous for any tab.

## Phase 4: User Story 2 — Work across multiple views with tabs (P2)

**Goal (round-3 delta)**: the strip scrolls with no scrollbar and edge shadows instead; tabs drag to reorder and the order persists; one kebab at the row's right edge replaces both the "+" button and the "View ▾" control.

**Independent test**: overflow the strip → no scrollbar, shadow on the overflowing side(s); drag a tab past a neighbour → order changes, survives reload, matches the manage modal; the kebab offers Add empty view / Open ▸ (only non-open views, disabled empty state) / Manage views…; a left-click on an inactive tab still just switches.

- [ ] T012 [P] [US2] Write failing RTL tests (strip has hidden-scrollbar styles; shadow elements toggle from `scrollLeft`/`clientWidth`/`scrollWidth` — none at width ≥ content, right-only at 0, both mid-scroll, left-only at end; drag end calls `reorderTabs` with the new order; row renders `[strip][kebab]` with no "+" and no "View ▾") in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.test.tsx`
- [ ] T013 [P] [US2] Write failing RTL tests for the kebab (Add empty view → `addAnonymousTab`; Open submenu lists ONLY saved views not currently open, in position order; disabled empty-state entry when all are open or none exist; Manage views… opens the modal; menu body constrains to `maxHeight: 60vh`) in NEW `apps/unihub/frontend/src/components/EntityViews/ViewKebab.test.tsx`
- [ ] T014 [US2] Create `apps/unihub/frontend/src/components/EntityViews/ViewKebab.tsx` (AntD `Dropdown` + `MoreOutlined`, right-aligned `placement="bottomRight"`, `maxHeight: 60vh` internal scroll, nested `Open ▸` submenu) and DELETE `ViewDropdown.tsx` + its test — T013 green
- [ ] T015 [US2] Rebuild the strip in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.tsx`: render tabs through the horizontal `SortableList` (T006), hide the scrollbar (`scrollbarWidth: 'none'`, `msOverflowStyle: 'none'`, `&::-webkit-scrollbar { display: none }`), add absolutely-positioned `data-testid="view-tabs-shadow-left|right"` gradient overlays (`pointer-events: none`) driven by a scroll/`ResizeObserver`-fed metric hook, and lay the row out as `[strip][kebab]` with the kebab fixed at the right edge (R22/R24) — T012 green
- [ ] T016 [US2] Persist the dragged order in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: `reorderTabs` composes the table's COMPLETE id order (strip saved views in new order, then the remaining views in current relative order), POSTs `reorder/`, and updates the cached list optimistically; anonymous tabs contribute no id (R26)

**Checkpoint**: US2 delta done — scrollbar-free strip with shadows, persisted drag order, single kebab control.

## Phase 5: User Story 3 — Share and deep-link a view via URL (P3)

**Goal (round-3 delta)**: none — the round-2 readable grammar stands. This phase is a regression guard for the hook refactor (T009) and the dropped always-first invariant (T028).

- [ ] T017 [US3] Re-run and, where the always-first assumption leaked in, update `apps/unihub/frontend/src/components/EntityViews/serialization.test.ts` and the URL sections of `useEntityViews.test.tsx`; confirm the `lastProcessedRef`/`lastParamRef` separation still holds after the refactor (round-1 ping-pong guard) and that a clean default tab still emits NO params

**Checkpoint**: URL behavior unchanged and locked.

## Phase 6: User Story 4 — Organize saved views (P4)

**Goal (round-3 delta)**: every tab carries its own menu (left-click when active, right-click always) with Save · Close · Duplicate · Pin/Unpin · Set as default · Rename · Delete, inapplicable items disabled not hidden; the per-tab `×` and the double-click rename gesture are removed; the default role is transferable and the manage modal's default row becomes draggable.

**Independent test**: right-click an inactive tab → its menu opens (no browser context menu) with the matrix from data-model §7; Set as default on an ordinary view → it pins and its Delete/Close grey out while the previous default becomes deletable, and neither tab moves; Delete from the menu keeps the tab open as anonymous.

- [ ] T018 [P] [US4] Write failing RTL tests for the menu (left-click inactive = switch only, no menu; left-click active = menu; right-click any tab = menu with `preventDefault`; exactly one menu open at a time; the full enablement matrix from data-model.md §7; Delete goes through `Modal.confirm` with `okType: 'danger'`; Rename opens the inline input for saved/default and `SaveViewModal` for anonymous) in NEW `apps/unihub/frontend/src/components/EntityViews/ViewTabMenu.test.tsx`
- [ ] T019 [US4] Create `apps/unihub/frontend/src/components/EntityViews/ViewTabMenu.tsx` — controlled AntD `Dropdown` (open state owned by `ViewTabs`, keyed by `tabId`), items Save/Close/Duplicate/Pin-Unpin/Set as default/Rename/Delete wired to the tab-addressed hook actions, disabled flags per the matrix, `maxHeight: 60vh` body (R23) — T018 green
- [ ] T020 [US4] Wire the menu into `apps/unihub/frontend/src/components/EntityViews/ViewTabs.tsx`: `onClick` opens the menu only when the tab is already active (otherwise `switchTab`), `onContextMenu` opens it for any tab with `preventDefault()`; REMOVE the per-tab close `×` and the `onDoubleClick` rename trigger (the inline rename input stays, now started by the menu's Rename)
- [ ] T021 [US4] Implement `setDefaultTab` in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: PATCH `{is_default: true}`, invalidate/refetch the table's view list so the demotion is visible, convert an open VIRTUAL default tab to anonymous when another view is promoted (R25), surface failures with a translated `message.error`; never touch positions (SC-011)
- [ ] T022 [US4] Allow dragging the default row in `apps/unihub/frontend/src/components/EntityViews/ManageViewsModal.tsx` (delete stays blocked, rename/pin stay enabled) and route its staged reorder through the same complete-order composition as the strip; update `ManageViewsModal.test.tsx` (default row draggable, still undeletable, order matches the strip)

**Checkpoint**: US4 delta done — one menu per tab, transferable default, consistent ordering across strip and modal.

## Phase 7: Polish & Cross-Cutting

- [ ] T023 [P] Extend e2e `apps/unihub/frontend/e2e/entity-views.spec.ts` with real-browser geometry locks (memory rule: visual-geometry work is locked in a browser, not JSDOM): (a) SC-009 — overflow the strip, assert `clientWidth < scrollWidth`, zero rendered scrollbar height, and shadow presence at scroll 0 / mid / end; (b) SC-010 — drag a tab with real mouse moves, assert the new left-to-right order, reload, assert it persists; (c) SC-006 — at 375px with 6+ tabs the kebab box stays fully inside the row's right edge while the strip scrolls
- [ ] T024 [P] Sweep for stale references: `grep -rn "ViewDropdown\|entityViews.view'\|newTab" apps/unihub/frontend/src apps/unihub/frontend/e2e` — no orphaned imports, i18n keys, or aria-label selectors (round-1 gotcha: AntD icon aria-labels join accessible names, so `/^view/i` anchoring may need updating where the "View" control label disappears)
- [ ] T025 Full quality loops: backend `uv run ruff format . && uv run ruff check . --fix && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — user rule); run `pnpm exec playwright test e2e/entity-views.spec.ts` against the dev stack
- [ ] T026 Update `CLAUDE.md` (round-3 SHIPPED note: what landed, test counts, gotchas — replacing the IN PROGRESS paragraph) and note that quickstart.md §Round-3 manual walk-through awaits a human session; re-confirm migration 0006 still needs applying on the running docker stack

## Dependencies

- Phase 2 blocks everything: T004 needs T002/T003 red first; T005 needs T004; T009 needs T008 red first; T006/T007 are independent [P].
- US1 (T010–T011) needs T009 (tab-addressed save). US2 (T012–T016) needs T006 (horizontal drag) + T009 (reorder action). US3 (T017) needs T009. US4 (T018–T022) needs T009 + T005 (writable `is_default`) and lands after US2's strip rebuild (T015) because the menu mounts on the rebuilt tab element.
- T022 shares the complete-order composition written in T016 — implement it once in the hook, consume it in both.
- Polish (T023–T026) last; T023 ∥ T024.

## Parallel opportunities

- T002 ∥ T003 (different test files); T006 ∥ T007 ∥ T008 (different files, no shared state); T010 ∥ T012 ∥ T013 ∥ T018 (test files, after Phase 2); T023 ∥ T024.

## Implementation strategy

Backend chain first (it unblocks the writable `is_default` the tab menu needs), then the hook generalization — every later phase depends on tab-addressed actions. US2 before US4 because the menu mounts on the rebuilt tab element. MVP scope if interrupted: Phase 2 + US2 (the row's new shape is the most visible directive); the tab menu (US4) is the largest single increment and is self-contained once the hook is generalized.
