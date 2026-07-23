# Tasks: Entity Views — Round 2

**Input**: Design documents from `/specs/016-entity-views/` (spec.md Clarifications Session 2026-07-23, plan.md round 2, research.md R14–R21, data-model.md, contracts/)

**Prerequisites**: Round 1 is SHIPPED (its task list is in git history). This list covers round 2 only. TDD is mandatory (constitution V): backend tests red before implementation; the serialization unit suite is rewritten before the module.

**Organization**: Tasks are grouped by user story. Round-2 directives map: default-view-as-plain-view → US1; "+" placement + auto-hide → US2; readable URLs + per-column pins → US3; double-click rename + manage-modal default row → US4; data_io/git-sync (FR-024) is story-independent backend infrastructure → Foundational.

## Phase 1: Setup

- [ ] T001 Confirm green baseline: run `uv run ruff check . && uv run pytest` from `apps/unihub/backend/` and `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; note counts for the ship report

## Phase 2: Foundational (blocking prerequisites)

**Backend — model, registry, sync (TDD: T002/T003 must be red before T004–T008 turn them green)**

- [ ] T002 [P] Write failing tests 12–15 (is_default create + partial-unique 400, PATCH-immutable 400, DELETE-default 400 with non-default sibling 204, migration 0006 sticky→per-column-pin config rewrite) in `apps/unihub/backend/tests/test_entity_views.py` per contracts/entity-views-api.md
- [ ] T003 [P] Write failing tests 16–19 (export excludes owner column, import stamps acting user, missing acting user errors, `bare_repo` publish→wipe→checkout round trip with zero second-publish diffs) in NEW `apps/unihub/backend/tests/test_entity_views_io.py`
- [ ] T004 Add `is_default` BooleanField + partial `UniqueConstraint(owner, table_key, WHERE is_default)` to EntityView in `apps/unihub/backend/core/models.py`; create migration `apps/unihub/backend/core/migrations/0006_*.py` including the data migration rewriting every stored `config` (`stickyLeft`→`pin:'left'` on first visible by order, `stickyRight`→`pin:'right'` on last visible, keys removed)
- [ ] T005 Expose `is_default` (create-only; PATCH change → 400) in `apps/unihub/backend/core/serializers.py` and reject DELETE of `is_default` rows (400) in `apps/unihub/backend/core/views.py` — T002 tests 12–14 green
- [ ] T006 Add `TableDescriptor.owner_field: str | None = None` to `apps/unihub/backend/data_io/registry.py` (excluded by `auto_system_fields`); skip the field in `services/csv_exporter.py` + `services/change_preview.py` diffing; stamp `acting_user` into the field in `change_preview.py` materialization (`apply_diff(..., acting_user=None)`, explicit error when an `owner_field` table imports without one)
- [ ] T007 Thread `acting_user` through `apps/unihub/backend/sync/services/apply_helper.py` (`import_from_clone`, `apply_selected`) and pass `request.user` from `apps/unihub/backend/data_io/views.py` (ImportConfirmView, ImportZipConfirmView, batch confirm path) and `apps/unihub/backend/sync/views.py` (SyncCheckoutConfirmView)
- [ ] T008 Replace the deferral comment in `apps/unihub/backend/core/apps.py` with the `core.entityview` TableDescriptor registration (`owner_field="owner"`, `config` as `is_json`, `import_order` beside `core.attributedefinition`) — T003 tests 16–19 green; run full backend suite
- [ ] T009 Regenerate OpenAPI schema (spectacular file route per 018 precedent) + `pnpm generate-types`; add `is_default` to the EntityView service type in `apps/unihub/frontend/src/services/unihub-backend/core.ts`

**Frontend — shared config shape & terminology**

- [ ] T010 Switch `ViewConfig` to v2 (per-column `pin?: 'left'|'right'` on `ViewColumn`, REMOVE `stickyLeft`/`stickyRight`) in `apps/unihub/frontend/src/components/EntityToolbar/types.ts` (+ all references); map snapshot/load 1:1 to `ColumnDef.pin` in `apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntityTable.ts`; upgrade v1 shapes in `normalizeConfig` (`apps/unihub/frontend/src/components/EntityViews/serialization.ts`); update affected unit tests
- [ ] T011 [P] Rename the default-tab label "Tabular"→"Table" (zh-TW 「表格」) and add round-2 keys (inline-rename error, reveal-affordance tooltip/aria) in `apps/unihub/frontend/src/locales/en-US/pages.ts` and `apps/unihub/frontend/src/locales/zh-TW/pages.ts` (same commit, ICU plurals where counted)

**Checkpoint**: backend suite green with is_default + sync round trip; frontend compiles on ViewConfig v2; all stories unblocked.

## Phase 3: User Story 1 — Save a table configuration and reopen it later (P1)

**Goal (round-2 delta)**: the default view is a plain view — modifiable, renamable, savable; page-provided initial name (catalog "YTD"); materializes as the `is_default` row on first save/rename.

**Independent test**: on a fresh catalog, edit filters on the "YTD" tab → dirty dot; Save → view persists (`is_default=true`); reload → stored name/config load as the default tab; baseline follows the stored config.

- [ ] T012 [P] [US1] Write failing RTL tests (virtual default named per `defaultViewName`, save materializes with `is_default:true, pinned:true`, materialized row binds the default tab incl. name/config/baseline, dirty vs stored baseline after materialization) in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.test.tsx`
- [ ] T013 [US1] Implement default-view materialization in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: accept `defaultViewName`, bind the `is_default` saved row to the always-first default tab (else virtual from page defaults), Save on the virtual default POSTs `is_default:true, pinned:true`, baseline switches to the stored config once materialized
- [ ] T014 [US1] Thread `defaultViewName` through `apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntityTable.ts` and pass `'YTD'` from `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` (other four pages keep the localized "Table" default)

**Checkpoint**: US1 delta done — default view saves/renames like a plain view on all five pages.

## Phase 4: User Story 2 — Work across multiple views with tabs (P2)

**Goal (round-2 delta)**: "+" sits right of the rightmost tab and never scrolls out of view; the view row auto-hides when only the default view exists, with a compact reveal affordance carrying the dirty dot.

**Independent test**: fresh table → row hidden, affordance visible; reveal → row with one default tab, "+" flush after it; open tabs until overflow → strip scrolls, "+" stays visible; close extras with `revealed=false` → row collapses again.

- [ ] T015 [P] [US2] Write failing RTL tests (element order tabs→"+"→View, "+" outside the scrollable strip, collapsed mode renders only the affordance, dirty dot on affordance when hidden default dirty, auto-expand on 2nd tab / non-default URL state, `revealed` persisted in sessionStorage) in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.test.tsx` and `useViewTabsState.test.ts`
- [ ] T016 [US2] Rework `apps/unihub/frontend/src/components/EntityViews/ViewTabs.tsx` layout: `[scrollable strip (flex: 0 1 auto)][+ (flex: 0 0 auto)][spacer][View]` per R16; add the collapsed-mode compact affordance (right-aligned icon button, OverflowTooltip-compliant tooltip, dirty dot) in the SAME viewBar slot
- [ ] T017 [US2] Add `revealed` to the sessionStorage state in `apps/unihub/frontend/src/components/EntityViews/useViewTabsState.ts` and derive `collapsed` in `useEntityViews.ts` (no non-default saved views AND one open tab AND no non-default URL state AND not revealed) per R21/FR-025

**Checkpoint**: US2 delta done — layout + auto-hide behave on all five pages.

## Phase 5: User Story 3 — Share and deep-link a view via URL (P3)

**Goal (round-2 delta)**: readable per-facet URL grammar (name-based saved refs, `and()/or()` filter groups, `~left/~right` pin suffixes, clean URL on clean default), replacing the packed mini-format; per-column pins round-trip.

**Independent test**: activate a saved view → URL reads `?<tableKey>.view=<name>`; hand-edit `.size=100` → table follows with dirty marker; paste an inline multi-facet URL in a fresh session → identical state incl. two pins on one side; malformed facet → default view + notice.

- [ ] T018 [P] [US3] REWRITE the serialization unit suite first (red) against contracts/view-url-serialization.md in `apps/unihub/frontend/src/components/EntityViews/serialization.test.ts`: emit shapes (clean default → no params; saved-by-name; each facet; pin suffixes incl. `attr:` keys; minimal encoding), parse shapes (both encodings, repeated `.f` order, namespace isolation with two tables), fallback taxonomy, round-trip property incl. multi-pin
- [ ] T019 [US3] REWRITE `apps/unihub/frontend/src/components/EntityViews/serialization.ts`: per-facet param names `<tableKey>.<facet>`, `f` group grammar `logic(attr op val; …)`, `cols` with `~left/~right`, `view` by name, minimal-encoding emitter, `URLSearchParams` parser, legacy `view[…]` format dropped — T018 green
- [ ] T020 [US3] Update URL inbound/outbound effects in `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts`: name-based resolution (incl. page default name while virtual), overrides-on-saved dirty marker, clean-URL emission for clean default tab, FR-008 fallbacks with `message.warning` — PRESERVE the `lastProcessedRef`/`lastParamRef` separation (round-1 ping-pong guard)

**Checkpoint**: US3 delta done — URLs are readable end-to-end and round-trip per-column pins.

## Phase 6: User Story 4 — Organize saved views (P4)

**Goal (round-2 delta)**: double-click a tab to rename inline (saved + default; anonymous → name-and-save modal); manage modal treats the default row as rename/pin-only.

**Independent test**: double-click a saved tab → inline input; Enter commits (collision shows a translated error and stays open), Esc cancels; double-click the virtual default → rename materializes it; the manage modal's default row hides delete + drag but renames/pins.

- [ ] T021 [P] [US4] Write failing RTL tests (dbl-click swaps label for autofocused input, Enter/blur commit → PATCH or materializing POST, Esc cancels, 400 collision keeps input open + error, anonymous dbl-click opens SaveViewModal, tab switching suspended while editing) in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.test.tsx`
- [ ] T022 [US4] Implement inline tab rename in `apps/unihub/frontend/src/components/EntityViews/ViewTabs.tsx` + rename/materialize actions in `useEntityViews.ts` per R17
- [ ] T023 [US4] Restrict the default row in `apps/unihub/frontend/src/components/EntityViews/ManageViewsModal.tsx`: no delete button, excluded from SortableList drag, rename + pin enabled; staged-commit path handles the materialized default like any saved view; update `ManageViewsModal.test.tsx`

**Checkpoint**: US4 delta done.

## Phase 7: Polish & Cross-Cutting

- [ ] T024 [P] Update e2e `apps/unihub/frontend/e2e/entity-views.spec.ts`: "+"-right-of-last-tab geometry incl. overflow at narrow viewport (real-browser position asserts), readable deep-link (`.view=YTD` + hand-edited `.size` override), reveal-affordance flow (hidden → reveal → auto-collapse)
- [ ] T025 [P] Verify remaining "Tabular" references are gone from UI strings and tests (`grep -ri tabular apps/unihub/frontend/src apps/unihub/frontend/e2e`)
- [ ] T026 Full quality loops: backend `uv run ruff format . && uv run ruff check . --fix && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — user rule); run the e2e suite against the dev stack
- [ ] T027 Update CLAUDE.md Active Feature section (round-2 SHIPPED note: what landed, test counts, gotchas) and note quickstart.md §Round-2 manual walk-through remains for a human session

## Dependencies

- Phase 2 blocks everything: T004/T005 need T002 red first; T006–T008 need T003 red first; T009 needs T005; T010 needs T009 (types); T011 independent [P].
- US1 (T012–T014) needs T005 (is_default API) + T010; US2 (T015–T017) needs T010/T011; US3 (T018–T020) needs T010 (T018/T019 are a self-contained pure-module pair, parallel to US1/US2); US4 (T021–T023) needs T013 (materialize action) — otherwise stories are independent.
- T020 finalizes the "non-default URL state" input to US2's collapse condition (T017) — wire the predicate in T017, confirm in T020.
- Polish (T024–T027) last; T024 ∥ T025.

## Parallel opportunities

- T002 ∥ T003 (different test files); T011 ∥ backend chain; T012 ∥ T015 ∥ T018 ∥ T021 (different test files, after Phase 2); US3's pure serialization pair (T018→T019) ∥ US1/US2 implementation; T024 ∥ T025.

## Implementation strategy

Foundational backend chain first (it resolves the Principle-I deferral and unblocks types), then US1 → US2 → US3 → US4 in priority order — each checkpoint is independently testable; US3's serialization pair can start any time after T010. MVP scope if interrupted: Phase 2 + US1 (default view as plain view is the highest-value directive).
