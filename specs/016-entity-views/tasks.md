# Tasks: Entity Views — Round 11

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-12b, plan.md round 11, research.md R47)

**Prerequisites**: Rounds 1–10 shipped (round 10 at commit 2a1a8c6).

**Scope note**: frontend only — one shared helper, two hooks, one component, the catalog page, their tests, one e2e spec. No backend, no migration, no grammar change.

**Method note**: the reported deep link was reproduced in a unit test first, then confirmed fixed against the user's real data with a read-only probe. The probe is what showed the unit fix was insufficient on the real page — the second cause (column placement) only appears when columns arrive late.

## Phase 1: Setup

- [X] T001 Confirm the green baseline and re-check which artefact serves the app (the round-10 lesson: a freshness check expires)

## Phase 2: Foundational (blocking prerequisite)

- [X] T002 Add the failing regression to `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx` in `describe('round 11: the default tab holds its stored config')`: with `?tbl.view=<an unpinned view>` at mount and a materialized default whose config differs, the DEFAULT tab must not be dirty, the deep-linked tab must own the table, and `ready` must be false until the views resolve. Confirm red (`expected true to be false`)

**Checkpoint**: the reported state is captured in the suite.

## Phase 3: User Story 1 — Save a table configuration and reopen it later (P1)

**Goal**: a tab's configuration is its own view's, whether or not it is the tab on screen (FR-013), and a column the configuration never knew about lands where the page declares it (FR-021).

- [X] T003 [US1] Split adoption in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts` into two decisions: (a) sync the default TAB's configuration to its stored view, always; (b) load it into the TABLE only when that tab is active and the URL brought no view state
- [X] T004 [US1] Add `apps/unihub/frontend/src/components/EntityToolbar/columnOrder.ts` — `mergeMissingByDeclaredOrder(listedKeys, declaredKeys)` places columns a configuration does not mention after their nearest declared predecessor — with its own unit suite covering user-chosen orders, consecutive newcomers, and the no-predecessor case
- [X] T005 [US1] Adopt the helper in BOTH `reconcileConfig` (useEntityViews.ts) and `useColumnConfig.loadState` — a disagreement between them just moves the mismatch — T002 green

**Checkpoint**: US1 delta done — no tab reports changes nobody made.

## Phase 4: User Story 2 — Switch between saved views (P2)

**Goal**: the view row appears complete or not at all (FR-038).

- [X] T006 [US2] Write the failing tests: `ready` in the hook suite, and in `ViewTabs.test.tsx` that no tabs render while the row is not ready, that the placeholder reserves height, and that the complete set renders once ready
- [X] T007 [US2] Expose `ready` from `useEntityViews`, set from INSIDE the pinned-merge effect so the flag and the tabs it describes land in the same commit; render the height-reserving placeholder in `ViewTabs` ahead of the collapsed branch — T006 green

**Checkpoint**: US2 delta done — one paint, no tab-by-tab fill-in.

## Phase 5: The catalog's own default view

- [X] T008 Remove the seeded filter, sort, page size and the "YTD" default-view name from `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`; the page's `ViewConfig` baseline keeps only columns and takes `DEFAULT_PAGE_SIZE`
- [X] T009 Export `DEFAULT_PAGE_SIZE` from `useEntityTable` (and the barrel) so a page baseline cannot drift from the table's own default into a false indicator
- [X] T010 Update the four catalog tests that assert the removed behaviour (YTD tab name, lit Filter, lit Sort, 50/page) to the new contract — deliberate behaviour change, not a test weakening

## Phase 6: Polish & Cross-Cutting

- [X] T011 [P] Extend e2e `apps/unihub/frontend/e2e/entity-views.spec.ts`: a deep link to an unpinned view leaves every other tab without an indicator; and the tab count never changes after the row first appears
- [X] T012 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; backend untouched. The e2e suite is NOT run here (the live stack serves real data)
- [X] T013 Re-probe the real page: the reported deep link, the tab-count transitions, and a re-check that round 10's transient write is gone
- [X] T014 Record R47 and update `CLAUDE.md`

## Dependencies

- T002 → T003 → T004 → T005 (the unit fix is insufficient without the placement rule).
- T006 → T007. T008 → T010; T009 blocks T008.
- Polish (T011–T014) last.

## Implementation strategy

Fix the tab-configuration split first — it is the literal report — then the placement rule, which is what makes it hold on a page with late-arriving columns. The catalog removal is independent and could ship alone; the flash fix is independent of both.
