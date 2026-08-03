# Tasks: Entity Views — Round 5

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-04b, plan.md round 5, research.md R37–R39, data-model.md §4)

**Prerequisites**: Rounds 1–4 are shipped (round 4 at commit bb3f310). This list covers round 5 only. TDD is mandatory (constitution V): tests written against the new behavior before the code.

**Organization**: Tasks are grouped by user story. Round-5 directives map: per-visit tabs (the row rebuilds on every page load) → US2; the shared confirmation footer + the "Close" label → US4 (they live on the tab menu); the shared helper itself and the app-wide sweep are cross-cutting infrastructure → Foundational + a dedicated phase.

**Scope note**: no backend, no migration, no API or URL-grammar change this round. Eight of the nine confirm-dialog adoptions are OUTSIDE feature 016 — their suites assert on AntD's `.ant-modal-confirm-btns` DOM and must be updated in lockstep.

## Phase 1: Setup

- [X] T001 Confirm green baseline: `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; record counts for the ship report (the backend is untouched this round, so its suite only needs a final confirmation run)

## Phase 2: Foundational (blocking prerequisites)

**The shared confirmation helper — every delete gate in the app depends on it**

- [X] T002 [P] Write failing tests for the shared helper in NEW `apps/unihub/frontend/src/components/ConfirmDialog/index.test.tsx`: renders title/content/okText; the footer's FIRST child is Cancel and its LAST is the confirming button (constitution VI — assert DOM order and `justify-content: space-between`, not AntD's confirm markup); `danger: true` renders `ant-btn-dangerous`; confirming runs `onOk` and closes; cancelling runs nothing; an async `onOk` shows a loading state until it settles and keeps the dialog open if it rejects
- [X] T003 Create `apps/unihub/frontend/src/components/ConfirmDialog/index.tsx` exporting `confirmDialog({ title, content, okText, cancelText, danger, onOk })` over AntD `Modal` with an explicit `space-between` footer (Cancel left, primary right), called imperatively so migration is a one-line swap per site (R38) — T002 green
- [X] T004 [P] Change the `common.entityViews.close` VALUE only — `"Close tab"` → `"Close"`, zh-TW `「關閉分頁」` → `「關閉」` — in `apps/unihub/frontend/src/locales/en-US/pages.ts` and `apps/unihub/frontend/src/locales/zh-TW/pages.ts` (same commit; the key name stays so no selector churns beyond the label text)

**Checkpoint**: the helper exists and is proven compliant on its own; the label is updated.

## Phase 3: User Story 2 — Work across multiple views with tabs (P2)

**Goal (round-5 delta)**: the tab row is per-visit state. Every page load rebuilds it from the account's pinned views plus the single view the URL addresses; everything else — scratch tabs, opened-but-unpinned views, and their unsaved changes — is discarded.

**Independent test**: open a pinned view, two scratch tabs and an unpinned saved view, then refresh. The row shows exactly the pinned views (including the default holder) plus the URL's view; the scratch tabs are gone. Reveal the row on a single-default table and refresh — it stays revealed.

- [X] T005 [P] [US2] Write failing tests for the reduced store in NEW `apps/unihub/frontend/src/components/EntityViews/useViewTabsState.test.ts`: only `revealed` is written to `unihub.views.<tableKey>`; a STALE round-4 payload carrying `tabs`/`activeTabId` is read tolerantly (its `revealed` survives, its tabs are ignored, nothing throws); a corrupt payload falls back to `revealed: false`
- [X] T006 [US2] Reduce the store in `apps/unihub/frontend/src/components/EntityViews/useViewTabsState.ts`: persist `{ revealed }` only, keep `tabs`/`activeTabId` as plain React state seeded from the page defaults, and make `restore()` pick `revealed` out of any shape (R37) — T005 green
- [X] T007 [P] [US2] Write failing RTL tests in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`: a fresh mount with pinned + unpinned saved views opens ONLY the pinned ones (plus the default holder); a mount whose URL addresses an unpinned saved view opens that view too and makes it active; a mount with no URL view state activates the default holder; a remount does NOT resurrect scratch tabs or unsaved changes from the previous visit (replacing the round-1 "tabs survive a remount within the session" expectation)
- [X] T008 [US2] Build the tab list from pinned views + the URL on mount in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts` and DELETE the mount-time rehydrate effect that replayed a restored tab's config; keep the round-4 order-preserving merge for refetches DURING a visit, and PRESERVE the `lastProcessedRef`/`lastParamRef` separation — with no stored tab list the URL is the only carrier of "where you were", so the ping-pong guard and the outbound effect must stay exactly right (R37) — T007 green

**Checkpoint**: US2 delta done — refreshing is a clean rebuild, and the URL keeps the user's place.

## Phase 4: User Story 4 — Organize saved views (P4)

**Goal (round-5 delta)**: the view-delete confirmation obeys the constitution's footer rule, and the tab menu's close action reads "Close".

**Independent test**: tab menu → Delete opens a dialog with Cancel flush left and a danger Delete on the right; cancelling deletes nothing, confirming deletes the view. The menu's close item reads "Close".

- [X] T009 [P] [US4] Update `apps/unihub/frontend/src/components/EntityViews/ViewTabMenu.test.tsx` for the new confirm surface (Cancel is the footer's left-most control, the danger button right-most) and for the `"Close"` label
- [X] T010 [US4] Adopt `confirmDialog` in `apps/unihub/frontend/src/components/EntityViews/ViewTabMenu.tsx`, replacing `Modal.useModal()`/`modal.confirm` and its holder — T009 green

**Checkpoint**: US4 delta done inside the feature.

## Phase 5: App-wide confirmation adoption (cross-cutting, FR-031/SC-014)

**Goal**: no `Modal.confirm` remains anywhere — every confirmation renders the compliant footer from the one helper. Each task migrates one call site AND updates that file's suite where it reaches into AntD's confirm DOM; behavioural assertions (confirm runs the action, cancel does not) stay as they are.

- [X] T011 [P] Migrate `apps/unihub/frontend/src/components/AttributeManagementPanel/index.tsx` to `confirmDialog` and update that component's test selectors
- [X] T012 [P] Migrate `apps/unihub/frontend/src/components/ParameterRowsEditor/index.tsx` (it passes `okButtonProps: { danger: true }` — map to the helper's `danger` flag) and update its tests
- [X] T013 [P] Migrate `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` (the affected-balance-count confirm) and update the accounts tests
- [X] T014 [P] Migrate `apps/unihub/frontend/src/pages/finance/currencies/index.tsx` and update the currencies tests
- [X] T015 [P] Migrate `apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx` and update the exchange-rates tests
- [X] T016 [P] Migrate `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` and update the balance-sheets tests
- [X] T017 [P] Migrate `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx` and update the scenarios tests
- [X] T018 [P] Migrate `apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionForm.tsx` and update its tests (that suite already waits on `.ant-modal-wrap` display state — keep the pattern)
- [X] T019 Verify the sweep: `grep -rn "Modal.confirm\|modal.confirm" apps/unihub/frontend/src --include=*.tsx | grep -v test` returns nothing, and every migrated suite is green

**Checkpoint**: SC-014 holds app-wide — 9/9 confirmations use the shared footer.

## Phase 6: Polish & Cross-Cutting

- [X] T020 [P] Extend e2e `apps/unihub/frontend/e2e/entity-views.spec.ts`: with a pinned view, two "Add empty view" tabs and an unpinned saved view open, reload and assert the row contains exactly the pinned views plus the URL's view (SC-013); and that a revealed row stays revealed across a reload (FR-025)
- [X] T021 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — user rule); backend `uv run ruff check . && uv run pytest` as an untouched-baseline confirmation. The e2e suite is NOT run here (the live stack serves real data and these specs write saved views); it awaits a human run
- [X] T022 Update `CLAUDE.md` (round-5 SHIPPED note replacing the IN PROGRESS paragraph: what landed, test counts, gotchas) and re-confirm that migrations 0006 and 0007 are still pending on the running docker stack

## Dependencies

- Phase 2 blocks everything: T003 needs T002 red first; every Phase 4/5 migration needs T003. T004 is independent [P].
- US2 (T005–T008) is independent of the confirm work: T006 needs T005 red first; T008 needs T006 (the store must stop returning tabs before the hook stops consuming them) and T007 red first.
- US4 (T009–T010) needs T003; Phase 5 (T011–T018) needs T003 and is fully parallel across files; T019 gates on all of them.
- Polish (T020–T022) last.

## Parallel opportunities

- T002 ∥ T004 ∥ T005 ∥ T007 (distinct files, before any implementation).
- T011–T018 are eight independent single-file migrations — the widest parallel batch in this round.
- The whole US2 chain (T005→T006→T008) runs in parallel with the entire confirm-dialog effort; they share no files.

## Implementation strategy

The helper first (it unblocks nine call sites), then the two efforts in parallel: US2's derived-tab refactor and the app-wide confirm migration. MVP scope if interrupted: Phase 2 + US2 — the per-visit tab rule is the behaviour the user reported, while the footer sweep is a compliance fix that degrades gracefully if only partly applied (each migrated site is independently correct).
