# Tasks: Entity Views — Rounds 7 & 8

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Sessions 2026-08-04d/e, plan.md rounds 7 & 8, research.md R42–R43, data-model.md §3–§4)

**Prerequisites**: Rounds 1–6 are shipped (round 6 at commit a0309e8). **Round 7 is already implemented and green in the working tree** — its remaining task was the CLAUDE.md ship note, now written. This list therefore carries round 7's completed work for the record and adds round 8.

**Organization**: Both rounds land on the URL/deep-linking path → **US3**, with assertions that also protect US1 (a stored view's configuration and its Save affordance).

**Scope note**: frontend only in both rounds — one hook, its suite, one e2e spec. No backend, no migration, no grammar change.

**Round 8 is guard rails, not new behaviour.** A probe confirmed the compactness directives already hold (clean → `tbl.view=<id>`; edit → `+tbl.sort=name`; Save → compact again immediately). If the invariant suite passes on the first run, that is the correct outcome to report — the deliverable is the regression net over a rule broken three different ways.

## Phase 1: Setup

- [X] T001 Confirm green baseline: `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/` — 759 passed / 4 skipped, 61 files (an earlier 10-failure run was the documented balance-sheets/SyncTab load flakes, each green in isolation)

## Phase 2: Round 7 — inline URL state never lands on a stored view (COMPLETE)

- [X] T002 Failing reproduction from the user's steps in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`: catalog-faithful harness (table seeded with the same defaults its view config describes), add a blank tab, capture the emitted URL, remount with it, assert the row is `[default (clean, seeded filter intact), separate active scratch tab]`
- [X] T003 [US3] Inline state creates its OWN unsaved tab in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`, reusing an existing tab only when it is `kind === 'anonymous'`; the `DEFAULT_TAB_ID` fallback is deleted (R42)
- [X] T004 [US3] Idempotent restoration in the same file: id generated once, creation inside the `setTabs` updater with an existence check, updater-form `setActiveTabId`
- [X] T005 [US3] Coverage in the same suite: an already-active unsaved tab is updated rather than duplicated; the `.view=<id>` saved path is unchanged; one round-2 test that encoded the old behaviour now expects its own anonymous tab
- [X] T006 e2e in `apps/unihub/frontend/e2e/entity-views.spec.ts`: the reported flow, ending by clicking back to the default tab and asserting its year-to-date filter still applies
- [X] T007 Round-7 ship note in `CLAUDE.md` (the fallback, why round 5 turned it into a per-reload bug, the data-correctness framing, the creation-once discipline)

**Checkpoint**: round 7 is complete and green; it ships in this round's commit.

## Phase 3: User Story 3 — Share and deep-link a view via URL (P3) — round 8

**Goal**: the indicator and the URL are one state seen twice. For the ACTIVE tab, the dot appears iff the URL holds at least one override parameter; inactive tabs keep their own dots.

**Independent test**: drive one table through load → edit → save → switch → reload and confirm at every step that dot-presence and override-presence agree; confirm a tab you edited and switched away from still shows its dot.

- [X] T008 [US3] Add the reusable invariant helper `expectIndicatorMatchesUrl(result, tableKey)` to `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`: read the ACTIVE tab's `dirty` and the search params, derive `hasOverrides` (any `<tableKey>.` param except `.view` and `.page`), and assert both directions with a message naming which side broke — a dot with no overrides means an invented difference, overrides with no dot means the URL describes state the table is not in (FR-033/R43)
- [X] T009 [US3] Add the journey test in the same file using a stored view whose config differs from the page defaults: assert the invariant after (a) the initial load, (b) a toolbar edit, (c) Save, (d) switching to another tab and back, (e) a remount with the URL the app left behind. Also assert the concrete compact forms — clean → only `.view`; edited → `.view` plus exactly the changed facet; saved → back to only `.view` (FR-034/SC-016)
- [X] T010 [P] [US3] Add inactive-tab coverage in the same file: a saved view edited then switched away from KEEPS its indicator while inactive; an unsaved scratch tab keeps its indicator while inactive; neither contributes override params to the URL while another tab is active (FR-013)
- [X] T011 [US3] NOT NEEDED — the invariant suite passed on its first run, so no production code changed this round. Recorded in the ship report rather than inventing a change. (Original task: only if T008–T010 expose a genuine divergence, fix it in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`, preserving all four navigation guards (`lastParamRef`, `lastProcessedRef`, `inboundSettledRef`, `pendingLoadRef`). If the suite is green as written, record that explicitly in the ship report rather than inventing a change

**Checkpoint**: US3 delta done — the invariant is asserted at every step of the journey.

## Phase 4: Polish & Cross-Cutting

- [X] T012 [P] Extend e2e `apps/unihub/frontend/e2e/entity-views.spec.ts`: with a saved view active, assert the URL holds only `inventory-catalog.view=<id>` and no dot; change the page size and assert both the dot and exactly one override param appear; Save and assert both clear in the same step
- [X] T013 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — user rule); backend `uv run ruff check . && uv run pytest` as an untouched-baseline confirmation. Verify any suite failure in isolation before treating it as a regression — balance-sheets and SyncTab flake only under full-suite load. The e2e suite is NOT run here (the live stack serves real data); it awaits a human run
- [X] T014 Update `CLAUDE.md` with the round-8 SHIPPED note (the probe result, the bidirectional invariant, whether any divergence was found) and re-confirm migrations 0006 and 0007 remain pending on the running docker stack

## Dependencies

- Phase 2 is complete; nothing blocks on it.
- T008 blocks T009 and T010 (they call the helper). T011 is conditional on their outcome.
- Polish (T012–T014) last; T012 is [P] with T013's backend half.

## Parallel opportunities

- T010 is [P] with T009 once the helper exists, though both edit the same suite file — sequence them if the edits collide.

## Implementation strategy

Write the invariant helper first so every subsequent assertion is expressed in the same vocabulary, then walk the journey with it. MVP scope if interrupted: T008 + T009 — the helper and the journey test are what actually prevent a fourth recurrence.
