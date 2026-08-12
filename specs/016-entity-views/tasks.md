# Tasks: Entity Views — Round 12

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-08-12c, plan.md round 12, research.md R48)

**Prerequisites**: Rounds 1–11 shipped (round 11 at commit b91d0f0).

**Scope note**: frontend only — one shared helper, five pages, five test suites. No backend, no migration, no hook change, no UI change.

**Method note**: audit before editing. The four non-catalog pages already seeded nothing, so the round is about removing a drift hazard and locking behaviour per page — not about editing four pages into a shape they already had.

## Phase 1: Setup

- [X] T001 Audit all five entity pages for seeded filters, sorts, page sizes and default-view names, and for how each builds its `defaultViewConfig` — record the actual deltas before planning any edit

**Checkpoint**: the real gap is known (hand-copied baselines, not seeded configuration).

## Phase 2: Foundational (blocking prerequisite)

- [X] T002 Add `apps/unihub/frontend/src/components/EntityToolbar/viewConfig.ts` — `viewConfigFromColumns(columnDefs)` builds the page baseline from columns plus the shared `DEFAULT_PAGE_SIZE` — and export it from the barrel
- [X] T003 Write its test suite, including the property that matters: the page size it produces equals what a freshly mounted `useEntityTable` actually starts at, so the two cannot drift apart without a red test

**Checkpoint**: one definition of "this table, untouched" exists.

## Phase 3: User Story 1 — Save a table configuration and reopen it later (P1)

**Goal**: every entity table follows one pattern, with no per-page variation (FR-039).

- [X] T004 [US1] Adopt `viewConfigFromColumns` at all five pages (`finance/accounts`, `finance/currencies`, `finance/exchange-rates`, `inventory/catalog`, `inventory/scenarios`), replacing the hand-copied literal and the restated page size
- [X] T005 [P] [US1] Lock arrival behaviour per page in `AccountsPage.test.tsx`, `CurrenciesPage.test.tsx`, `ExchangeRatesPage.test.tsx` and `ScenariosPage.test.tsx`: the first request carries no filter, no ordering and the default page size; a stored default view is APPLIED on arrival with no indicator in either row shape (SC-021)
- [X] T006 [US1] Verify the verifier: disable adoption temporarily and confirm the new tests FAIL (`expected 25 to be 100`), then restore. A test that cannot fail would be recorded as coverage while proving nothing (the round-9 lesson)

**Checkpoint**: US1 delta done — the pattern is enforced by a mechanism and checked per page.

## Phase 4: Polish & Cross-Cutting

- [X] T007 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; backend untouched. Any failure verified in isolation first — balance-sheets and SyncTab flake only under full-suite load
- [X] T008 Smoke-probe the running application read-only: all five pages render with real data, none shows an indicator, none writes a URL parameter, no page errors
- [X] T009 Record R48 and update `CLAUDE.md`

## Dependencies

- T001 → T002 → T003 → T004. T005 is independent of T004 [P] but must run after it to pass. T006 follows T005.
- Polish (T007–T009) last.

## Implementation strategy

Audit first — it determined that the round's value is the shared helper and the per-page locks, not the page edits. The helper and its property test come before adoption so the pages have one definition to call; the per-page tests come last because they are the evidence that the pattern actually holds where it was never checked before.
