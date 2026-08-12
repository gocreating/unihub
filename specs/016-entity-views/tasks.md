# Tasks: Entity Views — Round 10

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-12, plan.md round 10, research.md R46)

**Prerequisites**: Rounds 1–9 shipped (round 9 at commit 37f4687). This round fixes the defect round 9 wrongly closed as "not in this branch".

**Scope note**: frontend only — one hook, its test suite, one e2e spec. No backend, no migration, no grammar change, no new UI.

**Method note**: three unit harnesses failed to reproduce this in round 9, and its absence was then read as evidence the bug was elsewhere. The reproduction here comes from driving the real page with real data and recording every URL write; only once the mechanism was known could the unit regression be written to fail.

## Phase 1: Setup

- [X] T001 Re-check which artefact serves the app before trusting any earlier diagnosis: `docker ps` plus the image `Created` timestamp against `git log -1`. Round 9's "the container is stale" finding had expired — the image is now NEWER than round 9's commit, so the user's report describes current code

## Phase 2: Foundational (blocking prerequisite)

**The reproduction — from the running application, and it must FAIL first**

- [X] T002 Drive the real page read-only (login, navigate by nav click, reload; GET requests only) with `history.pushState`/`replaceState` wrapped so every URL write is recorded, not just the final address. Capture the arrival URL, the tab labels and the indicator state
- [X] T003 Add the failing regression to `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx` in `describe('round 10: late-arriving columns must not block adoption')`. Model what round 9's harness omitted: attribute columns arriving a tick AFTER mount, the saved-view list resolving after THEM, and a stored default view differing from the page defaults in filter, sort and page size. Assert the adopted configuration, an empty override set and a clean indicator. Confirm it fails (`expected 50 to be 25`)

**Checkpoint**: the defect is captured in the suite and demonstrably red.

## Phase 3: User Story 3 — Share and deep-link a view via URL (P3)

**Goal**: arriving at a table applies the default view's stored configuration and leaves the URL clean, on a page whose columns are discovered asynchronously as much as on one whose columns are fixed (FR-036, FR-037, SC-017, SC-019).

**Independent test**: navigate to the catalog with no view params — the table shows the default view's own configuration, no dot, no parameters; reload and repeat; a deep link to another view still wins.

- [X] T004 [US3] Fix the pristine test in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: compare the TABLE's live snapshot against the page defaults rather than the default tab's mount-time config, which a growing column universe makes permanently unequal
- [X] T005 [US3] Replace the `defaultAdoptedRef` one-shot with `adoptedTokenRef`, holding the configuration last offered: idempotent, re-entrant while the column universe settles, and loop-proof. Answer "did the URL address view state?" from the mount-captured `initialUrlHadViewStateRef` (moved above its new consumer), never from live params — R44 recorded both flaws without fixing them
- [X] T006 [US3] Add `table.snapshotConfig` to the adoption dependencies so the effect re-evaluates as the table's own column state is patched: a run inside that one-commit skew sees a live snapshot that legitimately differs from the defaults, and without a re-run adoption never happened
- [X] T007 [US3] Add `searchParams` to the OUTBOUND effect's dependencies (FR-037) — its decision is made against the URL, so a stale value let it conclude the address bar was already correct and skip the corrective write that follows adoption. Document why each is load-bearing — T003 green
- [X] T008 [US3] Re-verify against the running application with the same probe: arrival and reload must both end at a bare `/inventory/catalog` with no indicator

**Checkpoint**: US3 delta done — the reported flow is clean, deep links unaffected.

## Phase 4: Polish & Cross-Cutting

- [X] T009 [P] Extend e2e `apps/unihub/frontend/e2e/entity-views.spec.ts` with the catalog-shaped case: arrive at a table whose default view is materialized, assert no override parameters and no indicator, reload, assert the same
- [X] T010 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; backend untouched. The e2e suite is NOT run here (the live stack serves real data)
- [X] T011 Record R46 in `specs/016-entity-views/research.md` — including the retracted round-9 conclusion and the residual transient write — and update `CLAUDE.md`

## Dependencies

- T001 → T002 → T003 (red) → T004–T007 (green) → T008 (real-data confirmation).
- T009–T011 last. T009 is independent of the hook work [P].

## Implementation strategy

Fix in the order the failures stack: adoption must run at all (T004–T006) before the URL can be corrected (T007), and the real-data probe (T008) is the only check that covers all three — each of the three defects alone kept the flow broken, and the unit regression only proves the first two.
