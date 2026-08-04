# Tasks: Entity Views — Round 6

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-04c, plan.md round 6, research.md R40–R41, data-model.md §3)

**Prerequisites**: Rounds 1–5 are shipped (round 5 at commit c2c256e). This list covers round 6 only — a single reproduced defect. TDD is not optional here: the reproduction lands RED before the fix (constitution V; same reproduction-first discipline as the 015 phantom-diff bug).

**Organization**: One user story is affected. The spurious unsaved indicator is a URL/state-sync defect on the deep-linking path → **US3**, with regression coverage that also protects US1's Save affordance (a permanently dirty tab makes Save look perpetually needed).

**Scope note**: frontend only — one hook file, its suite, and one e2e spec. No backend, no migration, no API or URL-grammar change (the grammar is fine; *when* we emit is the bug).

## Phase 1: Setup

- [X] T001 Confirm green baseline: `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; record counts for the ship report (backend untouched — one confirmation run at the end)

## Phase 2: Foundational (blocking prerequisite)

**The reproduction — it must FAIL before anything is fixed**

- [X] T002 Add the failing regression to `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx` in a new `describe('round 6: the load never publishes a half-loaded tab')`, using a materialized default view whose stored config differs from the page defaults (e.g. `pageSize: 50` plus a sort rule): (a) mount with a CLEAN url → once `savedViews` resolves and the stored config is adopted, `activeTab.dirty === false` **and** the search params contain NO `.sort`/`.size`/`.f`/`.cols` (at most `.view`); (b) mount with the URL that today's code emits (`?tbl.view=<id>&tbl.sort=&tbl.size=25`) → `dirty === false` after settling, proving the replay loop is broken. Confirm BOTH assertions fail (or the second one does) against the current implementation before proceeding — a passing test here means the reproduction is wrong, not that the bug is absent

**Checkpoint**: the defect is captured in the committed suite and demonstrably red.

## Phase 3: User Story 3 — Share and deep-link a view via URL (P3)

**Goal (round-6 delta)**: the URL never describes a tab that has not finished loading, so an untouched load stays clean and cannot poison the next one — while a genuine override still loads dirty (FR-013 unchanged).

**Independent test**: load a table whose saved default differs from the page defaults, touch nothing, and confirm no indicator and no override params; reload and confirm the same; then hand-edit `.size=100` into the URL and confirm the view loads at 100/page WITH the indicator.

- [X] T003 [US3] Add the load gate to `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: a `pendingLoadRef` holding the config most recently handed to `table.loadConfig(...)`, set by EVERY caller — the default-adoption effect, the inbound URL effect, `switchTab`, `openView`, `addBlankTab`, `duplicateTab`. The outbound URL effect returns early while the ref is set and `reconcileConfig(table.snapshotConfig(), defaultConfig)` does not yet equal the pending value; when they match (or the ref is empty) it clears the ref and publishes as before (R40) — T002 green
- [X] T004 [US3] Document the guards where they live in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: a short comment block naming all FOUR navigation guards (`inboundSettledRef`, `lastParamRef`, `lastProcessedRef`, `pendingLoadRef`) and the distinct failure each prevents, so the next change to this effect does not delete one as redundant — the round-1 ping-pong guard in particular MUST survive
- [X] T005 [P] [US3] Extend the regression coverage in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`: a genuine hand-edited override (`?tbl.view=<id>&tbl.size=100`) still yields `dirty === true` with the override applied (FR-013/US3-AC2 intact); switching between two open views publishes no override params for either (the pre-adoption window exists on every `loadConfig` path, not just mount); opening a saved view from the kebab likewise emits only its `.view` reference

**Checkpoint**: US3 delta done — SC-015 holds for load, reload, and tab switching.

## Phase 4: Polish & Cross-Cutting

- [X] T006 [P] Extend e2e `apps/unihub/frontend/e2e/entity-views.spec.ts`: load the catalog, save the default view with a changed page size so its stored config differs from the page defaults, then reload TWICE without touching anything and assert zero `[aria-label="Unsaved changes"]` elements and a URL carrying no `inventory-catalog.size`/`.sort` params (SC-015)
- [X] T007 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — user rule); backend `uv run ruff check . && uv run pytest` as an untouched-baseline confirmation. The e2e suite is NOT run here (the live stack serves real data and these specs write saved views); it awaits a human run
- [X] T008 Update `CLAUDE.md` (round-6 SHIPPED note replacing the IN PROGRESS paragraph: the loop, the gate, why a boolean flag would not clear, the four-guard rule, and the known poisoned-bookmark residue) and re-confirm that migrations 0006 and 0007 remain pending on the running docker stack

## Dependencies

- T002 blocks T003 (red before green — the whole point of this round).
- T004 and T005 follow T003; T005 is [P] with T004 (different concerns in the same file — sequence them if edits collide).
- Polish (T006–T008) last; T006 is [P] with nothing outstanding.

## Parallel opportunities

- Little to parallelise: this is one defect in one file. T005's extra cases can be written while T004's comment block is added, and T006 can be drafted any time after T003.

## Implementation strategy

Reproduce, fix, then widen the net. The reproduction (T002) is the deliverable that keeps this from recurring — it asserts on the EMITTED PARAMS, not just the indicator, because a dot-only assertion passes while the URL is being poisoned for the next visit, which is exactly how this survived rounds 2–5 (R41). MVP scope if interrupted: T002 + T003 — that is the user-visible fix; T004–T006 are durability.
