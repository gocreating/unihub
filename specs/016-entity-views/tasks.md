# Tasks: Entity Views — Round 9

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-04f, plan.md round 9, research.md R44–R45, data-model.md §4/§7)

**Prerequisites**: Rounds 1–8 are shipped (round 8 at commit bf0b2eb). This list covers round 9: one defect diagnosed against the running app, plus one new tab action.

**Organization**: The defect is on the arrival/URL path → **US3**; "Reset changes" is view housekeeping → **US4**.

**Scope note**: frontend only — one hook, one menu component, the tab-state type, two locale files, one e2e spec. No backend, no migration, no grammar change.

**Testing note carried from R44**: three unit harnesses failed to reproduce the defect; it was found by driving the real app read-only. The regression must therefore assert **named content** (the adopted configuration, an empty override set) — round 8's `dot ⟺ overrides` invariant stays green throughout this bug and cannot detect it.

## Phase 1: Setup

- [X] T001 Confirm green baseline: `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; record counts for the ship report (backend untouched — one confirmation run at the end). Verify any failure in isolation first: balance-sheets and SyncTab flake only under full-suite load

## Phase 2: Foundational (blocking prerequisite)

**The reproduction — written from the observed browser state, and it must FAIL first**

- [X] T002 Add the failing regression to `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx` in a new `describe('round 9: the stored default view is adopted on arrival')`. Use a catalog-faithful harness (table seeded with `defaultFilterGroups`/`defaultSortRules`/`defaultPageSize` matching its view config) and a MATERIALIZED default view whose stored config differs from those page defaults (e.g. a different sort and `pageSize: 25`). Mount with a CLEAN url, let effects settle, then assert: (a) the table's live state equals the STORED config (`queryParams.ordering`, `limit`) — not the page defaults; (b) the search params contain NO override facets (`.f`/`.sort`/`.cols`/`.size`); (c) `activeTab.dirty === false`. Confirm it fails before proceeding — a green test here means the harness still does not model the real page

**Checkpoint**: the defect is captured in the suite and demonstrably red.

## Phase 3: User Story 3 — Share and deep-link a view via URL (P3)

**Goal**: arriving at a table applies the default view's stored configuration before anything is published, so a fresh navigation and a reload both land clean (FR-036).

**Independent test**: navigate to the catalog with no view params — the table shows the default view's own filter/sort/page size, no dot, no override params; repeat after a reload; a deep link to a different view still wins.

- [X] T003 [US3] **NO FIX NEEDED — the reported defect is not in this branch.** The running app at :3001 is a docker image (`unihub-frontend-1`) built 2026-08-11 20:24, ~2h BEFORE the round-6 fix (a0309e8) and round-7/8 (bf0b2eb, 22:14). Both reported symptoms are precisely the round-6 write-then-replay loop and the round-7 inline-state-hijacks-the-default-tab defect, already fixed here. The T002 regression — modelled on the user's real stored view (filters `[]`, pageSize differing from the page default) — PASSES against current source, and instrumenting the hook produced no console output in the container, proving the image does not contain this code. Recorded rather than inventing a change. (Original task: fix the adoption effect in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: move `defaultAdoptedRef.current = true` so it is consumed ONLY when adoption actually runs or is decisively unnecessary (no `defaultView`, or `defaultBaseline` already equals `defaultConfig`) — a bail for a transient reason must leave it armed for the next run; and replace the live `hasViewParams(searchParams, tableKey)` guard with the mount-captured `initialUrlHadViewStateRef`, so the application's own outbound write is never mistaken for a user-provided deep link (R44) — T002 green
- [X] T004 [US3] Latent smells recorded in research.md R44 rather than changed without a failing test: `defaultAdoptedRef` is consumed before its guards, and the "URL wins" guard reads live params. Neither is reachable in current source (rounds 6–8 removed the paths that fed them), so no speculative edit was made. (Original task: extend the guard comment block in the same file with the adoption rule, so the five interacting mechanisms (`lastParamRef`, `lastProcessedRef`, `inboundSettledRef`, `pendingLoadRef`, and the adoption one-shot) are documented together with the failure each prevents
- [X] T005 [P] [US3] Precedence already covered by the round-7/8 suites (deep link wins; active session tab wins; no-materialized-default is clean). (Original task: add precedence coverage to `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`: a deep link (`?tbl.view=<other id>` present AT MOUNT) still wins over adoption; an already-active session tab still wins; a table with NO materialized default is unaffected (page defaults, clean URL); and the round-8 invariant helper still passes after arrival

**Checkpoint**: US3 delta done — arrival is clean, deep links unaffected.

## Phase 4: User Story 4 — Organize saved views (P4)

**Goal**: every dirty tab can be returned to its baseline in one click, with no confirmation and no stored-data change (FR-035).

**Independent test**: dirty a saved view → tab menu → Reset changes → the saved configuration is back, the dot is gone, the override params have left the URL. On a scratch tab the blank configuration returns. On a pristine tab the item is disabled.

- [X] T006 [P] [US4] Write failing tests for the hook action in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`: `resetTab(tabId)` on a dirty saved tab restores the stored config and clears both the dot and the override params; on a scratch tab it restores the blank config it was created with; on an INACTIVE tab it resets that tab only, leaving the active tab and the URL untouched; it makes no API call
- [X] T007 [US4] Add `baseline?: ViewConfig` to `InternalTab` in `apps/unihub/frontend/src/components/EntityViews/useViewTabsState.ts` (in-memory, never persisted — round 5 removed tab persistence), and set it at every creation site in `useEntityViews.ts`: `addBlankTab` (the blank config), `duplicateTab` (the source's config), and the round-7 inline restoration (the URL's config)
- [X] T008 [US4] Implement `resetTab(tabId)` in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: resolve the baseline (stored view config for a saved/default-holder tab, `tab.baseline` otherwise), write it into tab state, and apply it through `loadIntoTable` so the round-6 pending-load gate drops the override params naturally; expose it on `UseEntityViewsReturn` — T006 green
- [X] T009 [P] [US4] Write failing tests for the menu item in `apps/unihub/frontend/src/components/EntityViews/ViewTabMenu.test.tsx`: "Reset changes" appears between Save and Close, calls `resetTab` with THIS tab's id, is enabled on a dirty tab, disabled on a pristine one, and opens NO confirmation dialog
- [X] T010 [US4] Add the item to `apps/unihub/frontend/src/components/EntityViews/ViewTabMenu.tsx` using a new `common.entityViews.resetChanges` key, enabled per the data-model §7 matrix — T009 green
- [X] T011 [P] [US4] Add `common.entityViews.resetChanges` to BOTH `apps/unihub/frontend/src/locales/en-US/pages.ts` ("Reset changes") and `apps/unihub/frontend/src/locales/zh-TW/pages.ts` (「還原變更」) in the same commit

**Checkpoint**: US4 delta done — reset works from any tab, active or not.

## Phase 5: Polish & Cross-Cutting

- [X] T012 [P] Extend e2e `apps/unihub/frontend/e2e/entity-views.spec.ts`: (a) navigate to the catalog from a different route and assert no `[aria-label="Unsaved changes"]` and no `inventory-catalog.f`/`.sort`/`.size` params, then reload and assert the same (SC-017); (b) with a saved view active, change the page size, confirm the dot and one override param appear, choose Reset changes, and confirm both clear in the same step (SC-018)
- [X] T013 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — user rule); backend `uv run ruff check . && uv run pytest` as an untouched-baseline confirmation. The e2e suite is NOT run here (the live stack serves real data); it awaits a human run
- [X] T014 Update `CLAUDE.md` with the round-9 SHIPPED note (the probe method and why unit harnesses missed it, the two adoption flaws, the testing lesson about consistency invariants, and the Reset action with its creation-baseline) and re-confirm migrations 0006 and 0007 remain pending on the running docker stack

## Dependencies

- T002 blocks T003 (red before green). T004–T005 follow T003.
- US4 is independent of US3: T006 blocks T008; T007 blocks T008 (the baseline field must exist first); T009 blocks T010; T011 is independent [P].
- Polish (T012–T014) last.

## Parallel opportunities

- US3 (T002→T003→T004/T005) and US4 (T006–T011) touch the same hook file, so run the stories sequentially even though they are logically independent; within US4, T011 (locales) and T009 (menu tests) are genuinely parallel with the hook work.

## Implementation strategy

Fix the defect first — it is the reported pain and the smaller change — then add Reset. MVP scope if interrupted: T002 + T003, which makes arriving at a table honest again. The Reset action is additive and can ship separately.
