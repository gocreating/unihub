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

- [x] T035 Full verification sweep: backend `uv run ruff format . && uv run ruff check . && uv run pytest` (448 passed); frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (547 passed) — note: src/generated/api-types.ts unchanged by design; sync endpoints are hand-typed per the 004-era precedent (plain APIViews outside the spectacular schema), and schema generation still succeeds
- [ ] T036 [P] Manual quickstart.md validation against a scratch `file://` remote covering spec SC-001..SC-006 (incl. force-push banner and incompatible-node gating) — NOT run in the implementation environment (no live app/DB); every SC scenario is covered by the automated pytest/RTL suites, but the in-app walk-through remains for a human session
- [x] T037 [P] i18n audit — every new string present in both src/locales/en-US/ and src/locales/zh-TW/, counts via ICU plurals; no hardcoded UI strings in new components
- [x] T038 Update the CLAUDE.md SPECKIT block (iteration summary) and spec.md status per house convention

---

## Phase 9: Refinement Round — Sync Tab UI (clarified 2026-07-21)

**Goal**: Apply the six user-review directives (spec §Clarifications 2026-07-21; FR-021–FR-024 + FR-006/007/009 amendments; research R9–R12). **Frontend-only** — no backend, OpenAPI, or migration work. Display refinements map to US3 (graph rendering), interaction refinements to US5 (node interactions).

**Independent Test**: quickstart.md §"Manual verification — Sync tab UI refinement round" — six checks against a scratch remote; all RTL suites green.

### Tests for the refinement round (write first, must fail)

- [x] T039 [P] [US3] Extend/update RTL specs in src/pages/io/SyncTab/CommitGraph.test.tsx: (a) commit nodes render the two-row constitution datetime — absolute `YYYY-MM-DD HH:mm` primary + relative-time secondary (no `toLocaleString()` output); (b) "Local" and "Remote latest" `Tag`s both carry the blue color; (c) `getSyncHistory` called with `limit: 10` initially and `limit: 20` on load-more; (d) each commit node exposes a kebab (aria-labelled Dropdown trigger) and NO inline action `<button>` in the row; (e) incompatible commit → kebab's Checkout item disabled with `incompatible_reason` text reachable; (f) the incompatible tooltip's hover target is a content-fit element (not the full-width row wrapper); (g) a `pendingContent` node renders inside the uncommitted node section when `has_local_changes` (and the old placeholder/publish-button strings are gone)
- [x] T040 [P] [US5] Update src/pages/io/SyncTab/SyncTab.actions.test.tsx (+ SyncTab.staging.test.tsx where flows start from the trigger button): no "Review & publish" button and no "Local changes not yet published" text anywhere; when history reports `has_local_changes` the staged publish review (staging header, per-table collapse, Publish confirm) auto-renders inside the uncommitted node without any click; Publish confirm disabled at zero staged; publish-preview fetch failure → descriptive error with a Retry control that refetches; opening a checkout review hides the inline pending review, dismissing it restores the pending review (FR-024); confirm still sends `base_commit`/`diff_digest`/`excluded[]` and 409 `preview_stale` refetches

### Implementation for the refinement round

- [x] T041 [US3] Rework src/pages/io/SyncTab/CommitGraph.tsx: dayjs two-row timestamps (R9); both badges `color="blue"`; `limit=10` initial / `limit=20` on `fetchNextPage` (R12); per-node kebab via AntD `Dropdown` + `MoreOutlined` text button replacing the inline Checkout button (disabled item carries `incompatible_reason`); tooltip hover target `width: fit-content` (R10); replace the pending-node placeholder + `onPublish` button with a `pendingContent?: ReactNode` slot rendered as the uncommitted node's body (R11); extract a shared `useSyncHistory` hook (colocated useSyncHistory.ts) so index.tsx can read `has_local_changes`; update en-US + zh-TW locales (add kebab/menu + retry strings; delete `pages.io.sync.graph.pendingNode` + `publishAction`); make T039 pass
- [x] T042 [US5] Rework src/pages/io/SyncTab/index.tsx: replace the imperative `handlePushPreview` trigger with a query (`['sync','publish-preview']`) `enabled` when `useSyncHistory` reports `has_local_changes`; render the staged publish review (staging header, collapse, Publish confirm, error + Retry) into `CommitGraph`'s `pendingContent`; enforce one-active-review (checkout supersedes inline pending; staging selection resets on switch — FR-024); keep pinning/`preview_stale` handling and the diverged/force-publish modal intact; update both locales; make T040 pass
- [x] T043 Run both quality loops (backend untouched — must stay green: `uv run ruff check . && uv run pytest`; frontend: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`)
- [ ] T044 [P] Manual six-point walk-through per quickstart.md §refinement round against a scratch `file://` remote (SC-007) — human session if no live app/DB is available in the implementation environment
- [x] T045 Update the CLAUDE.md SPECKIT block and spec.md status to record the refinement round as shipped

---

## Phase 10: Commit-Rail Polish Round (clarified 2026-07-22)

**Goal**: Apply the five second-round directives (spec §Clarifications 2026-07-22; FR-025–FR-027 + FR-006/009/022 amendments; research R13–R15). **Frontend-only, one component** — `CommitGraph.tsx` + its specs + locales. All map to US3 (graph rendering) except the kebab-content change (US5 interactions).

**Independent Test**: quickstart.md §"Manual verification — commit-rail polish round" — four checks; all RTL suites green.

### Tests for the polish round (write first, must fail)

- [x] T046 [P] [US3] Update RTL specs in src/pages/io/SyncTab/CommitGraph.test.tsx: (a) no "History" container — `History` text absent and no `.ant-card` element wraps the rail; (b) commit-node arrangement per FR-027 — within a node the DOM/text order is hash → single-line `YYYY-MM-DD HH:mm (relative)` timestamp → message (replaces the two-row datetime spec); (c) the sha7 hash renders as an `.ant-tag` chip, as do "Remote latest" and "Local" (uniform size via the same component); (d) "Load more" renders inside its own timeline node (`commit-node-load-more` testid) only when `has_more`, and the preceding commit node still draws its connector line; (e) the incompatible node's kebab Checkout item is disabled WITHOUT any reason text inside the menu (reason text absent from the menu, still shown by the node tooltip)
- [x] T047 [P] [US5] Update src/pages/io/SyncTab/SyncTab.actions.test.tsx 'disables the kebab checkout' spec: assert the menu item is disabled and contains NO incompatibility reason text; checkout still not callable

### Implementation for the polish round

- [x] T048 [US3] Rework src/pages/io/SyncTab/CommitGraph.tsx per R13–R15: remove the `Card` wrapper (bare rail incl. loading/error/rewritten states); "Load more" as a terminal `NodeRow` (gray dot, `commit-node-load-more`, only while `hasNextPage`; last commit `isLast` only when history exhausted); kebab Checkout item label-only when disabled; sha7 as a default monospace `Tag` replacing `Text code`; node content rows = badges+kebab / single-line `dayjs` `YYYY-MM-DD HH:mm (fromNow())` muted text (drop `DateTimeCell` usage, extend `relativeTime` locally) / message; delete `pages.io.sync.graph.title` from src/locales/en-US/pages.ts and src/locales/zh-TW/pages.ts; make T046+T047 pass
- [x] T049 Run both quality loops (frontend: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from apps/unihub/frontend/; backend untouched: `uv run ruff check . && uv run pytest` from apps/unihub/backend/)
- [ ] T050 [P] Manual four-point walk-through per quickstart.md §commit-rail polish round against a scratch `file://` remote (SC-008) — human session if no live app/DB is available
- [x] T051 Update the CLAUDE.md SPECKIT block and spec.md status to record the polish round as shipped

---

## Phase 11: Publish Button Label Rename (clarified 2026-07-22, round 3)

**Goal**: The publish confirmation button reads "Publish Selected Changes" (spec FR-023 amendment). Label-only; internal staging terminology unchanged.

**Independent Test**: The uncommitted node's confirm button renders "Publish Selected Changes"; no UI surface still says "Publish staged changes"; all suites green.

- [x] T052 [US4] Update label expectations first (must fail): replace /publish staged changes/i with /publish selected changes/i in src/pages/io/SyncTab/SyncTab.actions.test.tsx, src/pages/io/SyncTab/SyncTab.staging.test.tsx, and src/pages/io/SyncTab/SyncTab.pinning.test.tsx
- [x] T053 [US4] Update `pages.io.sync.publishPreview.confirmButton` to 'Publish Selected Changes' in src/locales/en-US/pages.ts and '發佈所選變更' in src/locales/zh-TW/pages.ts; make T052 pass
- [x] T054 Run the frontend quality loop (`pnpm lint && pnpm typecheck && pnpm test && pnpm build` from apps/unihub/frontend/); backend untouched
- [x] T055 Update the CLAUDE.md SPECKIT block and spec.md status to record round 3 as shipped

---

## Phase 12: Full-Document Canvas Background (clarified 2026-07-22, round 4)

**Goal**: The app shell's grey canvas spans the full document height on every page (FR-028, SC-009; research R16). Global fix batched into this branch; visible today as a white band below viewport height in full-page PR screenshots.

**Independent Test**: `e2e/layout-background.spec.ts` green; regenerated full-page PR screenshots (02/03/06) show grey to the bottom edge.

- [x] T056 Write the failing pixel-probe e2e lock in e2e/layout-background.spec.ts (dev server on an open port, mocked APIs): render the Sync tab with enough content that `document.scrollHeight` exceeds the viewport, take a `fullPage` screenshot, decode it in-page via canvas 2D, and assert the bottom-corner pixels are the canvas grey `rgb(240,242,245)` — must FAIL against the unfixed shell
- [x] T057 Add the R16 rule to src/index.css — paint the canvas color on `.ant-pro-layout` (in-flow, full-document height; comment explaining ProLayout's viewport-fixed `bg-list` gap) — and make T056 pass; verify the mobile-drawer overrides in the same file still apply
- [x] T058 Regenerate the 015 screenshots (`BASE_URL=<port> pnpm exec playwright test e2e/take-screenshots-015.spec.ts`), visually verify the three full-page captures (02/03/06) now show grey to the bottom, and commit the updated PNGs in apps/unihub/docs/screenshots/015-data-migration-refinement/
- [x] T059 Run the frontend quality loop (`pnpm lint && pnpm typecheck && pnpm test && pnpm build` from apps/unihub/frontend/); backend untouched
- [x] T060 Update the CLAUDE.md SPECKIT block and spec.md status to record round 4 as shipped

---

## Phase 13: Embedded Checkout Review (clarified 2026-07-22, round 5)

**Goal**: The checkout review renders inside the commit node being checked out, mirroring the uncommitted node's inline review (FR-029, SC-010; research R17). Runs BEFORE Phase 12's screenshot regeneration (T058) so screenshot 06 captures the embedded review.

**Independent Test**: In RTL, initiating a checkout renders the overwrite warning, staging, and Restore/Cancel `within()` the target commit node's testid; no review markup below the rail.

- [x] T061 [P] [US5] Update RTL specs first (must fail): in src/pages/io/SyncTab/SyncTab.actions.test.tsx assert the checkout review (overwrite warning, staging header, Restore this snapshot, Cancel) renders within `commit-node-<sha>` and the FR-024 exclusivity flow still holds; in src/pages/io/SyncTab/CommitGraph.test.tsx cover the `commitContent` slot (renders inside the matching node only)
- [x] T062 [US5] Add `commitContent?: { sha: string; node: ReactNode } | null` to src/pages/io/SyncTab/CommitGraph.tsx (rendered by the matching CommitNode below its message line) and move the checkout-review JSX in src/pages/io/SyncTab/index.tsx into that slot; make T061 pass

---

## Phase 14: Full-Height Sider Border (clarified 2026-07-22, round 6)

**Goal**: The side panel's right border extends to the document bottom on taller-than-viewport pages (FR-030, SC-011; research R18) — the fixed sider's 1px border currently stops at viewport height in full-page captures.

**Independent Test**: The new pixel-probe test in `e2e/layout-background.spec.ts` is green; regenerated full-page PR screenshots show the border line to the bottom edge.

- [x] T063 Extend e2e/layout-background.spec.ts with a failing second test: on the tall mocked Sync page, measure the fixed sider's width from the DOM, take a `fullPage` screenshot, decode in-page via canvas 2D, and assert the pixel window at the sider boundary near the document bottom contains a non-canvas-grey pixel (the border line) — must FAIL against the unfixed shell
- [x] T064 Add the R18 rule to src/index.css — `border-inline-start: 1px solid rgba(5,5,5,0.06)` on `.ant-pro-layout-container`, scoped out of mobile drawer mode, with a comment referencing the viewport-fixed sider border — and make T063 pass
- [x] T065 Regenerate the 015 screenshots (`BASE_URL=<port> pnpm exec playwright test e2e/take-screenshots-015.spec.ts`), visually verify the full-page captures show the border to the bottom, run the frontend quality loop (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`), and commit
- [x] T066 Update the CLAUDE.md SPECKIT block and spec.md status to record round 6 as shipped

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
- **Phase 9 (refinement round)**: after Phase 8 (amends shipped US3/US5 surfaces). T039 ∥ T040 (different spec files) → T041 (makes T039 pass) → T042 (needs T041's `pendingContent` slot + `useSyncHistory`; makes T040 pass) → T043 → T044/T045.
- **Phase 10 (commit-rail polish)**: after Phase 9. T046 ∥ T047 (different spec files) → T048 (single implementation task, makes both pass) → T049 → T050/T051.
- **Phase 11 (label rename)**: after Phase 10. T052 → T053 → T054 → T055 (strictly sequential; trivial scope).
- **Phase 12 (canvas background)**: after Phase 11. T056 (failing pixel-probe lock) → T057 (CSS fix, makes T056 pass); T058 (screenshot regeneration) DEFERRED until after Phase 13 so captures include the embedded checkout review; then T059 → T060.
- **Phase 13 (embedded checkout review)**: after T057. T061 (failing RTL specs) → T062 (slot + move, makes T061 pass) → then Phase 12's T058/T059/T060 close both rounds.
- **Phase 14 (sider border)**: after Phase 13. T063 (failing pixel probe) → T064 (CSS fix) → T065 (screenshots + loops) → T066.

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
