# Tasks: Data Migration Refinement

**Input**: Design documents from `/specs/015-data-migration-refinement/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/sync-api.md](contracts/sync-api.md)

**Tests**: INCLUDED — the constitution mandates test-first backend development (Principle V) and spec FR-004 demands a permanent regression test. Backend test tasks precede their implementation tasks and MUST fail first.

**Organization**: Grouped by user story (US1–US5 from spec.md) so each story is an independently testable increment. Backend paths are relative to `apps/unihub/backend/`, frontend paths to `apps/unihub/frontend/`.

## Phase 1: Setup

**Purpose**: Confirm a green baseline so every later failure is attributable to this feature.

- [x] T001 Run both quality loops untouched and record the baseline (backend: `uv run ruff check . && uv run pytest` from apps/unihub/backend/; frontend: `pnpm lint && pnpm typecheck && pnpm test` from apps/unihub/frontend/)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Primitives every story builds on — the remote-pinned clone base, the SyncConfig marker fields, and the diff digest.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Write failing tests for a new `GitSyncService.reset_to_remote()` primitive in tests/sync/test_git_service.py — fetch + hard-reset the clone to the remote head, returning the remote head sha; cases: normal, empty remote (returns None), unreachable remote (GitError), clone with stray local-only commits gets discarded
- [x] T003 Implement `reset_to_remote()` in sync/services/git_service.py (fetch via `_authenticated_url()`, `git reset --hard FETCH_HEAD`, empty-remote detection reusing the existing stderr checks) and make T002 pass
- [x] T004 [P] Add `local_state_commit` and `last_known_remote_commit` (both Char(40), null) to `SyncConfig` in sync/models.py + new migration sync/migrations/000X_sync_state_markers.py; expose `local_state_commit` in `SyncConfigReadSerializer` (sync/serializers.py)
- [x] T005 [P] Write failing tests then implement `diff_digest()` (sha256 over canonical JSON of a per-table changes list) in sync/services/digest.py with tests in tests/sync/test_digest.py — stable under dict-key order, sensitive to any row/field change

**Checkpoint**: Foundation ready — user stories can begin.

---

## Phase 3: User Story 1 — Sync Previews Reflect the Complete Dataset (Priority: P1) 🎯 MVP

**Goal**: Push/pull previews always diff the complete unfiltered dataset against the true remote head; confirm applies exactly what was previewed (base+digest pinning). Kills the 1000+-phantom-deletion bug (FR-001..FR-004).

**Independent Test**: Seed multi-year inventory data → publish → unchanged preview reports `up_to_date` with zero deletions; corrupt the server clone's HEAD → preview still diffs against the remote head; change 1 record → preview lists exactly 1 record and confirm applies exactly it.

### Tests for User Story 1 (write first, must fail)

- [x] T006 [P] [US1] Write failing reproduction/regression tests in tests/sync/test_publish_preview_regression.py: (a) multi-year inventory dataset (records far outside the catalog default filter) + publish → preview `up_to_date`, zero deletes; (b) FR-004 scenario — same dataset, then preview reports no deletion for any record still in the DB; (c) stale-clone scenario — reset the server clone to an older commit, remote head is newer → preview diffs against the REMOTE head, not the stale clone HEAD; (d) pull-direction preview covers all registered tables' full datasets
- [x] T007 [P] [US1] Write failing pinning tests in tests/sync/test_preview_pinning.py: preview response carries `base_commit` + `diff_digest`; publish confirm with matching digest succeeds and pushes a fast-forward commit; confirm after a local DB change → `409 preview_stale`; confirm after the remote moved → `409 preview_stale`; publish updates `local_state_commit`

### Implementation for User Story 1

- [x] T008 [US1] Rework sync/services/publish_helper.py: `preview_publish_against_head` → `preview_publish_against_remote(clone_dir)` computing the diff against the freshly reset remote head (via T003), returning `(base_commit, changes)`; add digest via T005
- [x] T009 [US1] Update `GitSyncService.publish_preview()/publish()/force_publish()` in sync/services/git_service.py: call `reset_to_remote()` first; `publish()` accepts `base_commit`+`diff_digest`, recomputes + verifies before committing (mismatch → new `PreviewStaleException`); pushes remain fast-forward from the remote-head base; both publishes set `local_state_commit`
- [x] T010 [US1] Update sync/views.py + sync/serializers.py: publish-preview response gains `base_commit`/`diff_digest`; `SyncPublishView`/`SyncForcePublishView` accept the pinning body and map `PreviewStaleException` → `409 {"error": "preview_stale"}`; apply-preview path also goes through `reset_to_remote()`; make T006+T007 pass
- [x] T011 [US1] Regenerate the OpenAPI schema and frontend types (backend running: `pnpm generate-types` from apps/unihub/frontend/ → src/generated/api-types.ts); update src/services/unihub-backend/sync.ts types + `publishSync`/`forcePublishSync` to send `{base_commit, diff_digest}`; thread the previewed values through src/pages/io/SyncTab/index.tsx state, and on `409 preview_stale` show a message and auto-refresh the preview
- [x] T012 [US1] Run both quality loops + `pnpm build`; verify checkpoint scenarios manually per quickstart.md against a `file://` scratch remote

**Checkpoint**: Previews are trustworthy — MVP shippable.

---

## Phase 4: User Story 2 — Preview Tables Follow the Standard Footer Layout (Priority: P2)

**Goal**: Every change-preview table paginates per the constitution: "N records" left; size selector THEN pagination, flush right (FR-005).

**Independent Test**: Render a >1-page preview in RTL; assert DOM order info → size selector → pagination, controls in a right-aligned group; verify visually in the app.

### Tests for User Story 2 (write first, must fail)

- [x] T013 [P] [US2] Write failing RTL tests in src/components/ImportExport/ClientPaginationFooter.test.tsx (record count left, size Select before Pagination in DOM, right-aligned controls group, page-size change + page change callbacks, ICU plural "record/records") and extend src/components/ImportExport/ChangePreviewTable.test.tsx (each tab >1 page renders the shared footer; antd built-in pagination absent)

### Implementation for User Story 2

- [x] T014 [US2] ~~Create `ClientPaginationFooter`~~ REUSED the shared `EntityOffsetFooter` (it is purely prop-driven — no server coupling), wrapped in a client-paged `PagedPreviewTable` inside src/components/ImportExport/ChangePreviewTable.tsx; existing `common.entityOps.pagination.*` ICU keys cover both locales, no new keys needed
- [x] T015 [US2] Wire it into all three tabs of src/components/ImportExport/ChangePreviewTable.tsx (`pagination={false}` + sliced data + footer); make T013 pass; run frontend quality loop + `pnpm build`

**Checkpoint**: US1+US2 independently shippable.

---

## Phase 5: User Story 3 — Commit Graph in the Sync Tab (Priority: P3)

**Goal**: The Sync tab shows the data repo's commit history with local-state/remote-head markers, per-commit compatibility, and force-push (rewritten-history) detection (FR-006..FR-009).

**Independent Test**: With a seeded multi-commit scratch repo: graph lists commits (paged), marks local + remote head; force-push the remote from a shell → rewritten banner; doctor a CSV header in one commit → that node reports incompatible with a reason.

### Tests for User Story 3 (write first, must fail)

- [x] T016 [P] [US3] Write failing tests in tests/sync/test_views_history.py: happy path payload (newest-first, `is_remote_head`, `is_local_state`, `has_more` paging with `limit`/`before`, `has_local_changes`), empty remote, not-configured 400, git error 500, `last_known_remote_commit` recorded on fetch, `history_rewritten` true when the stored sha is no longer an ancestor of the new head
- [x] T017 [P] [US3] Write failing tests in tests/sync/test_compatibility.py for `classify_commit(clone_dir, sha)`: all-valid headers → compatible; missing required column → incompatible with column named in reason; unknown/missing-optional columns tolerated; absent table file tolerated; unreadable file → incompatible

### Implementation for User Story 3

- [x] T018 [US3] Implement history primitives in sync/services/git_service.py: `history(limit, before)` via `git log --format=%H%x1f%P%x1f%aI%x1f%s`, ancestor check via `git merge-base --is-ancestor`, and `last_known_remote_commit` read/update hooks in `status()` + `reset_to_remote()` call sites
- [x] T019 [US3] Implement `classify_commit()` in sync/services/compatibility.py — header-line-only `git show <sha>:<file>` reads validated with the header rules from data_io/services/csv_importer.py (extract a reusable `validate_headers()` there if needed); make T017 pass
- [x] T020 [US3] Add `SyncHistoryView` (GET /api/v1/sync/history/) in sync/views.py + serializers in sync/serializers.py + route in sync/urls.py per contracts/sync-api.md; make T016 pass; run backend quality loop
- [x] T021 [US3] Regenerate OpenAPI + `pnpm generate-types`; add `getSyncHistory` to src/services/unihub-backend/sync.ts
- [x] T022 [P] [US3] Write failing RTL tests in src/pages/io/SyncTab/CommitGraph.test.tsx: loading state, error + retry, node rendering (sha7, relative time, message), local/remote badges, pending-local-changes pseudo-node when `has_local_changes`, rewritten-history banner, disabled incompatible node with gated tooltip reason, load-more
- [x] T023 [US3] Implement `CommitGraph` in src/pages/io/SyncTab/CommitGraph.tsx (custom vertical commit rail per research R3; React Query `['sync','history']`; i18n en-US + zh-TW) and mount it in src/pages/io/SyncTab/index.tsx above the existing actions; make T022 pass; run frontend loop + `pnpm build`

**Checkpoint**: Graph visible and truthful; legacy buttons still present (removed in US5).

---

## Phase 6: User Story 4 — Row-Level Staging of Changes (Priority: P4)

**Goal**: Previews are stageable at row/table/all scopes (default all); publish applies only staged rows via hybrid CSVs; unstaged changes stay pending; the selective-apply engine (with FK dependency auto-include) lands here for US5 to reuse (FR-010..FR-014).

**Independent Test**: Changeset across ≥2 tables → uncheck one row + one whole table → publish → remote gains exactly the staged changes; next preview shows the unstaged rows again; zero-staged confirm is blocked.

### Tests for User Story 4 (write first, must fail)

- [x] T024 [P] [US4] Write failing tests in tests/sync/test_partial_publish.py: publish with `excluded` rows produces hybrid CSVs = base rows + staged ops only; unstaged changes reappear in the next preview; excluding everything → `400 nothing_staged`; digest still enforced with exclusions present
- [x] T025 [P] [US4] Write failing tests in tests/sync/test_selective_apply.py for the data_io selective-apply engine: applies only staged ChangeRecords in registry topo order (parents created first, children deleted first); AttributeValue columns upserted; staged create referencing an unstaged create auto-includes it transitively; staged parent-delete auto-includes its child-deletes present in the diff; returns the `auto_included` list; all inside one transaction

### Implementation for User Story 4

- [x] T026 [US4] Implement `apply_selected(diff_by_table, excluded, descriptors)` + FK dependency closure in data_io/services/change_preview.py (registry-metadata-driven only); make T025 pass
- [x] T027 [US4] Implement partial publish in sync/services/publish_helper.py (`write_csvs_from_base_plus_staged`) and accept/validate `excluded[]` (+ `nothing_staged` guard) in `publish()`/`force_publish()` (sync/services/git_service.py) and views/serializers (sync/views.py, sync/serializers.py); make T024 pass; run backend loop; regenerate OpenAPI + `pnpm generate-types`
- [x] T028 [P] [US4] Write failing RTL tests in src/components/ImportExport/ChangePreviewTable.staging.test.tsx: all rows checked by default; row toggle, per-table collapse-header toggle, master all-changes toggle each update exactly their scope; selected/total ICU counts; onSelectionChange payload
- [x] T029 [US4] Implement staging UI: antd `rowSelection` on the three tabs of src/components/ImportExport/ChangePreviewTable.tsx, table-scope checkbox in the collapse headers + master checkbox + counts in src/pages/io/SyncTab/index.tsx, confirm disabled at zero staged with an explanatory hint, `excluded[]` sent on publish/force-publish via src/services/unihub-backend/sync.ts; locales en-US + zh-TW; make T028 pass; run frontend loop + `pnpm build`

**Checkpoint**: Partial publish live end-to-end; selective-apply engine ready for US5.

---

## Phase 7: User Story 5 — Operate Sync Through Commit-Node Interactions (Priority: P5)

**Goal**: All sync operations run from the graph — publish from the pending-local node, checkout (preview+staged confirm) from any compatible commit node, incompatible nodes disabled — and the four legacy buttons plus the legacy apply endpoints are removed (FR-015..FR-020).

**Independent Test**: Scratch repo with compatible + incompatible commits: every legacy capability reachable via node interactions; checkout of an older compatible commit restores that snapshot exactly (then publish creates a new forward head); incompatible node cannot be checked out.

### Tests for User Story 5 (write first, must fail)

- [x] T030 [P] [US5] Write failing tests in tests/sync/test_views_checkout.py: checkout preview of an older sha diffs commit-vs-DB (replace semantics) with `base_commit`/`diff_digest`; `up_to_date` when DB matches; incompatible sha → `409 incompatible_commit`; confirm applies staged subset via the US4 engine, returns `results` + `auto_included`, sets `local_state_commit`/`last_applied_*`; digest drift → `409 preview_stale`; full-selection checkout of remote head ≡ legacy apply; legacy `apply/preview` + `apply/confirm` routes are gone (404)

### Implementation for User Story 5

- [x] T031 [US5] Generalize sync/services/apply_helper.py to `preview_from_commit(clone_dir, sha)`; add `CheckoutPreviewView` + `CheckoutConfirmView` (with compatibility gate via T019) in sync/views.py + sync/serializers.py + sync/urls.py; delete `SyncApplyPreviewView`/`SyncApplyConfirmView` and their routes; make T030 pass; run backend loop
- [x] T032 [US5] Regenerate OpenAPI + `pnpm generate-types`; update src/services/unihub-backend/sync.ts — add `getCheckoutPreview`/`confirmCheckout`, remove `getApplyPreview`/`confirmApply`
- [x] T033 [P] [US5] Write failing RTL tests in src/pages/io/SyncTab/SyncTab.actions.test.tsx: the four legacy buttons are gone; pending-local node offers Publish (and Force publish in the rewritten/diverged state with the existing two recovery choices); commit node opens checkout preview with staging and confirms only on explicit action; incompatible node offers no checkout; checkout preview warns local unpublished changes would be overwritten; `auto_included` rows surfaced to the user after confirm
- [x] T034 [US5] Rebuild src/pages/io/SyncTab/index.tsx interactions graph-first (node actions on CommitGraph nodes via src/pages/io/SyncTab/CommitGraph.tsx, publish/checkout flows reusing the staging preview, legacy buttons removed); locales en-US + zh-TW; make T033 pass; run frontend loop + `pnpm build`

**Checkpoint**: All five stories complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T035 Full verification sweep: backend `uv run ruff format . && uv run ruff check . && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; confirm regenerated src/generated/api-types.ts is committed and in sync with the backend schema
- [ ] T036 [P] Manual quickstart.md validation against a scratch `file://` remote covering spec SC-001..SC-006 (incl. force-push banner and incompatible-node gating)
- [ ] T037 [P] i18n audit — every new string present in both src/locales/en-US/ and src/locales/zh-TW/, counts via ICU plurals; no hardcoded UI strings in new components
- [ ] T038 Update the CLAUDE.md SPECKIT block (iteration summary) and spec.md status per house convention

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 → Phase 2**: baseline before primitives.
- **Phase 2 blocks all stories** (T003 reset primitive: US1/US3/US5; T004 markers: US1/US3/US5; T005 digest: US1/US4/US5).
- **US1 (Phase 3)**: only Phase 2 needed. **MVP.**
- **US2 (Phase 4)**: independent of all other stories (pure frontend) — can run in parallel with US1.
- **US3 (Phase 5)**: needs Phase 2; independent of US1/US2 (graph is read-only).
- **US4 (Phase 6)**: needs US1's pinning plumbing (T008–T011) for the digest-checked confirm body.
- **US5 (Phase 7)**: needs US3 (graph + compatibility classifier) and US4 (staging + selective-apply engine); US2's footer applies to its checkout previews automatically.
- **Phase 8**: after all desired stories.

### Within Each Story

Tests first (must fail) → services → views/serializers → OpenAPI regen + generated types → frontend service → frontend UI → quality loops.

### Parallel Opportunities

- T004 ∥ T005 (after T002/T003); T006 ∥ T007; T016 ∥ T017; T024 ∥ T025; T022, T028, T033 (RTL authoring) ∥ their backend counterparts; US2 entirely ∥ US1/US3.

## Parallel Example: User Story 1

```bash
# After Phase 2, author both failing backend suites together:
Task: "Reproduction/regression tests in tests/sync/test_publish_preview_regression.py"
Task: "Pinning tests in tests/sync/test_preview_pinning.py"
```

## Implementation Strategy

MVP = Phases 1–3 (US1): the data-loss hazard is closed and shippable alone. Then
increments in priority order — US2 (cheap compliance win, parallelizable), US3 (graph),
US4 (staging), US5 (interaction redesign, removes legacy surface) — validating each
checkpoint independently before moving on. Single-developer sequential order:
T001→T038 as numbered.

## Notes

- Backend TDD is constitutional: every test task must be observed failing before its implementation task starts.
- OpenAPI/type regeneration (T011, T021, T027, T032) requires the backend dev server (`pnpm generate-types` hits `http://localhost:8001/api/schema/`).
- Commit after each task or logical group (per-story branches not required — single feature branch `015-data-migration-refinement`).
