# Tasks: Entity Views — Round 13

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-12d, plan.md round 13, research.md R49)

**Prerequisites**: Rounds 1–12 shipped (round 12 at commit ea93647).

**Scope note**: frontend only — two hooks, one component, two locale files, six test suites, one e2e spec. No backend, no migration, no data change.

**Correction note**: the auto-hide had been reported as unwanted before and was still in place on every page. It is removed here, not disabled.

## Phase 1: Setup

- [X] T001 Map the whole collapse surface before editing (hook state, component branch, locale key, page suites, e2e helper) and confirm which pages still pass a default-view name — none do, so the naming work is about the OPTION, not the pages

## Phase 2: User Story 2 — Switch between saved views (P2)

**Goal**: the view row is shown on every entity table, always (FR-025, replaced).

- [X] T002 [US2] Remove `collapsed`/`reveal` from `useEntityViews.ts` — the derived state, the callback, the return fields and the interface entries
- [X] T003 [US2] Delete the persistence in `apps/unihub/frontend/src/components/EntityViews/useViewTabsState.ts`: the `revealed` state, the storage key, the tolerant-parse helper, the write effect and the now-unused `tableKey` parameter. A hook that persists nothing must not look like one that does
- [X] T004 [US2] Remove the collapsed branch from `ViewTabs.tsx` with its Badge/Tooltip/Button affordance, the `collapsedRow` style, the icon import, and the `views.collapsed` effect dependencies
- [X] T005 [P] [US2] Delete `common.entityViews.showViews` from BOTH locale files in the same commit (constitution VIII)
- [X] T006 [US2] Update the suites: `useViewTabsState.test.ts` asserts the store writes NOTHING; the hook's auto-hide describe becomes "the row is always shown"; `ViewTabs.test.tsx` drops the collapsed describe and the factories drop the fields; five page suites drop their reveal step; the e2e spec loses `revealRow` and its auto-hide test

**Checkpoint**: US2 delta done — no hidden state anywhere.

## Phase 3: User Story 1 — Save a table configuration and reopen it later (P1)

**Goal**: every entity type's default view is named "Table" until the user renames it (FR-003, amended).

- [X] T007 [US1] Delete `defaultViewName` from `UseEntityViewsOptions` and its two consumers in `useEntityViews.ts`, so no page can name its default view — the option, not just its current absence, is what allowed the catalog's "YTD" to compete with the stored default view (R47)
- [X] T008 [US1] Update the four hook tests that encoded the withdrawn behaviour: the virtual default now carries an EMPTY name, and materialization stores it as "Table". Update rather than delete — the materialization path they cover is still live
- [X] T009 [US1] Leave stored views alone (clarified): a view already saved under another name keeps it. No auto-created rows, no rename migration — both would write to the user's data to satisfy a naming policy

**Checkpoint**: US1 delta done — "Table" is the only initial name possible.

## Phase 4: Polish & Cross-Cutting

- [X] T010 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; backend untouched. Verify any failure in isolation first — SyncTab and balance-sheets flake only under full-suite load
- [X] T011 Probe the running application read-only across all five pages: the row renders immediately, no collapsed affordance, no reveal control, no `unihub.views.*` storage key, and the expected tab names
- [X] T012 Update `spec.md` (FR-025 replaced, FR-003 amended, FR-009 no longer defers to it, the acceptance scenario and edge case, the assumption about persisted row state — earlier clarifications annotated as superseded rather than rewritten), record R49, and update `CLAUDE.md`

## Dependencies

- T001 → T002–T005 (any order) → T006. T007 → T008. T005 is independent [P].
- Polish (T010–T012) last.

## Implementation strategy

Remove the feature rather than gate it: a disabled auto-hide leaves dead state, a storage hook that stores nothing, and a locale key nobody renders. The naming change is one deleted option — small, but it closes the door that let a page's own default view compete with the account's stored one.
