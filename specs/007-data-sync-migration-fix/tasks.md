---

description: "Task list for data sync migration fix and publish preview"
---

# Tasks: Data Sync Migration Fix & Publish Preview

**Input**: Design documents from `specs/007-data-sync-migration-fix/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Backend tests required (TDD — Constitution Principle V). Frontend tests: quality loop only (lint, typecheck, Vitest).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

---

## Phase 1: Foundational (Baseline Verification)

**Purpose**: Confirm the existing quality loop is green before any changes. This is the baseline all new work must preserve.

**⚠️ CRITICAL**: Complete before any user story work begins.

- [ ] T001 Run backend quality loop from `apps/unihub/backend/`: `uv run ruff check .` and `uv run pytest` — confirm all pass before modifying any files
- [ ] T002 Run frontend quality loop from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test` — confirm all pass

**Checkpoint**: Quality loop green — user story work can now begin

---

## Phase 2: User Story 1 — All Data Categories Are Included in Sync (Priority: P1) 🎯 MVP

**Goal**: Register `language`, `music`, and `people` domain models in the `data_io` registry so they are included in all sync, export, and import operations.

**Independent Test**: Navigate to IO → Export tab and verify that "Languages", "Word Cards", "Grammar Sheets", "Songs", "Persons", and "Relationships" appear in the table list. Publish and verify all CSV files appear in the remote GitHub repo.

### Tests for User Story 1 (write first — must FAIL before implementation)

- [ ] T003 [US1] Write failing registry completeness test: create `apps/unihub/backend/tests/test_registry.py` asserting that `get_registry()` contains `language.language`, `language.wordcard`, `language.grammarsheet`, `music.song`, `people.person`, `people.relationship` — run `uv run pytest tests/test_registry.py` and confirm FAIL

### Implementation for User Story 1

- [ ] T004 [P] [US1] Create `apps/unihub/backend/language/apps.py` — add `LanguageConfig(AppConfig)` with `ready()` that registers `language.language` (Language model, import_order=10), `language.wordcard` (WordCard model, import_order=11, FK to language.language), and `language.grammarsheet` (GrammarSheet model, import_order=12, FK to language.language) using field schemas from `specs/007-data-sync-migration-fix/data-model.md`
- [ ] T005 [P] [US1] Create `apps/unihub/backend/music/apps.py` — add `MusicConfig(AppConfig)` with `ready()` that registers `music.song` (Song model, import_order=20) using field schema from `specs/007-data-sync-migration-fix/data-model.md`
- [ ] T006 [P] [US1] Create `apps/unihub/backend/people/apps.py` — add `PeopleConfig(AppConfig)` with `ready()` that registers `people.person` (Person model, import_order=30) and `people.relationship` (Relationship model, import_order=31, two FKs to people.person) using field schemas from `specs/007-data-sync-migration-fix/data-model.md`
- [ ] T007 [US1] Run `uv run pytest tests/test_registry.py` — confirm T003 test now passes (registry completeness); then run full `uv run pytest` to confirm no regressions
- [ ] T008 [US1] Run `uv run ruff format . && uv run ruff check . --fix` from `apps/unihub/backend/` — confirm zero issues on the three new `apps.py` files

**Checkpoint**: User Story 1 complete — six new tables are registered, export/import/sync all include them. Verify independently via IO → Export tab and a test publish.

---

## Phase 3: User Story 2 — Preview Changes Before Publishing to Remote (Priority: P2)

**Goal**: Add a publish preview step so the user sees per-table change counts (added/modified/deleted) and must explicitly confirm before any data is pushed to the remote.

**Independent Test**: Click "Publish" in the Sync tab. An inline preview section appears showing per-table summary. Clicking "Confirm & Publish" pushes; clicking "Cancel" does nothing. With no changes since last publish, an info toast appears instead of a preview.

### Backend: Tests (write first — must FAIL before implementation)

- [ ] T009 [US2] Write failing tests for `GET /api/v1/sync/publish/preview/` in `apps/unihub/backend/tests/sync/test_views_publish.py` — add three test cases following the existing mock pattern (`patch("sync.views._get_git_service", ...)`):
  1. `test_publish_preview_not_configured` — no SyncConfig → 400 `{"error": "not_configured"}`
  2. `test_publish_preview_has_changes` — mock `svc.publish_preview()` returning `[{"table": "finance.account", "display_name": "Accounts", "added": 1, "modified": 0, "deleted": 0}]` → 200 `{"status": "has_changes", "changes": [...]}`
  3. `test_publish_preview_up_to_date` — mock `svc.publish_preview()` returning `[]` → 200 `{"status": "up_to_date"}`
  Run `uv run pytest tests/sync/test_views_publish.py` and confirm all three new tests FAIL (endpoint does not exist yet)

### Backend: Implementation

- [ ] T010 [US2] Implement `preview_publish_against_head(clone_dir: Path) -> list[dict]` in `apps/unihub/backend/sync/services/publish_helper.py` — for each table in `get_registry()`: (1) export current DB via `export_table(descriptor)` → decode bytes → `parse_csv(text, descriptor)` → build PK-keyed dict `local_rows`; (2) run `git show HEAD:{csv_filename(label)}` in clone_dir — if returncode != 0 treat as no_prior_publish (all local records are "added"); otherwise parse → build PK-keyed dict `head_rows`; (3) compute `added = PKs in local_rows not in head_rows`, `deleted = PKs in head_rows not in local_rows`, `modified = PKs in both with at least one differing field value`; (4) skip tables with added + modified + deleted == 0; return list of `{"table": label, "display_name": descriptor.display_name, "added": added, "modified": modified, "deleted": deleted}`
- [ ] T011 [US2] Add `publish_preview(self) -> list[dict] | None` method to `GitSyncService` in `apps/unihub/backend/sync/services/git_service.py` — call `self.ensure_clone()`, then call `preview_publish_against_head(self.clone_dir)`, return `None` if the result list is empty (nothing changed), otherwise return the list
- [ ] T012 [US2] Implement `SyncPublishPreviewView(APIView)` in `apps/unihub/backend/sync/views.py` — GET handler: fetch SyncConfig, if None return 400; call `_get_git_service(config).publish_preview()`; if None return `{"status": "up_to_date"}`; otherwise return `{"status": "has_changes", "changes": result}` (handle `GitError` → 500 with sanitised message)
- [ ] T013 [US2] Add URL route in `apps/unihub/backend/sync/urls.py` — import `SyncPublishPreviewView` and add `path("publish/preview/", SyncPublishPreviewView.as_view())` before the existing `publish/` route
- [ ] T014 [US2] Run `uv run pytest tests/sync/test_views_publish.py` — confirm all three T009 tests now pass; run full `uv run pytest` to confirm no regressions; run `uv run ruff format . && uv run ruff check .` to confirm zero issues

### Frontend: Types and i18n (all parallelizable)

- [ ] T015 [P] [US2] Add to `apps/unihub/frontend/src/services/unihub-backend/sync.ts`:
  - `SyncPublishPreviewChange` interface: `{ table: string; display_name: string; added: number; modified: number; deleted: number; }`
  - `SyncPublishPreviewResult` interface: `{ status: 'up_to_date' | 'has_changes' | 'no_prior_publish'; changes?: SyncPublishPreviewChange[]; }`
  - `getPublishPreview()` async function: `GET /api/v1/sync/publish/preview/` → returns `SyncPublishPreviewResult`
- [ ] T016 [P] [US2] Add publish preview i18n keys to `apps/unihub/frontend/src/locales/en-US/pages.ts` — add under `pages.io.sync.*` namespace:
  - `pages.io.sync.publishPreview.confirmButton`: `"Confirm & Publish"`
  - `pages.io.sync.publishPreview.cancelButton`: `"Cancel"`
  - `pages.io.sync.publishPreview.upToDate`: `"Nothing to publish — already up to date."`
  - `pages.io.sync.publishPreview.error`: `"Failed to compute publish preview."`
  - `pages.io.sync.publishPreview.added`: `"Added"`
  - `pages.io.sync.publishPreview.modified`: `"Modified"`
  - `pages.io.sync.publishPreview.deleted`: `"Deleted"`
- [ ] T017 [P] [US2] Add the same publish preview i18n keys to `apps/unihub/frontend/src/locales/zh-TW/pages.ts` with Traditional Chinese translations for all 7 keys added in T016 (use the same key names; translate values to zh-TW)

### Frontend: UI Update

- [ ] T018 [US2] Update `apps/unihub/frontend/src/pages/io/SyncTab/index.tsx` — modify the publish flow in `ActionsCard` (depends on T015, T016, T017):
  - Add state: `publishPreview: SyncPublishPreviewChange[] | null` (null = not yet fetched; `[]` = no changes), `publishPreviewing: boolean`
  - Change the Publish button's `onClick` to call a new `handlePublishPreview()` function instead of `publish.mutate()`
  - `handlePublishPreview()`: set `publishPreviewing=true`, call `getPublishPreview()`, on `status="up_to_date"` show info toast `pages.io.sync.publishPreview.upToDate`, on `status="has_changes"` or `"no_prior_publish"` set `publishPreview = result.changes ?? []`, on error show `pages.io.sync.publishPreview.error` toast; always set `publishPreviewing=false`
  - Render an inline preview section below the buttons (same position as apply preview) when `publishPreview !== null` — use a compact Ant Design `Table` (no PageTable; this is embedded modal-level content not a standalone page table) with columns: Table Name (`display_name`), Added (green `<Tag>+{n}`), Modified (orange `<Tag>~{n}`), Deleted (red `<Tag>-{n}`)
  - Show "Confirm & Publish" button (`pages.io.sync.publishPreview.confirmButton`) that calls `publish.mutate()` then sets `publishPreview=null`
  - Show "Cancel" button (`pages.io.sync.publishPreview.cancelButton`) that sets `publishPreview=null`
  - Publish button label stays `pages.io.sync.publish.button`; it now triggers preview, not direct publish

### Frontend: Quality Loop

- [ ] T019 [US2] Run frontend quality loop from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test` — confirm zero errors and zero warnings

**Checkpoint**: User Story 2 complete — publish flow shows inline preview before pushing. Verify via quickstart.md Part 2.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories before shipping.

- [ ] T020 [P] Run full backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . && uv run pytest` — all must pass
- [ ] T021 [P] Run full frontend quality loop from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test` — all must pass
- [ ] T022 Manually verify quickstart.md Part 1 (registry + export/import round-trip for newly registered tables)
- [ ] T023 Manually verify quickstart.md Part 2 (publish preview: normal flow, up-to-date flow, first-ever publish, diverged history)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1 green baseline — can start after T001 and T002
- **Phase 3 (US2)**: Can start after Phase 1; US2 backend does not depend on US1 being done; US2 frontend does not depend on US1; US2's preview will automatically include the newly registered tables once US1 is complete (registry is used at runtime)
- **Phase 4 (Polish)**: Depends on both Phase 2 and Phase 3 complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 1 only — no dependencies on US2
- **US2 (P2)**: Depends on Phase 1 only — backend and frontend can proceed in parallel with US1. The preview endpoint will automatically discover new tables via `get_registry()` once US1 is done; no code coupling between US1 and US2.

### Within Each User Story

- T003 (failing test) MUST be written and MUST fail before T004–T006 (implementation) — TDD
- T004, T005, T006 are parallelizable (different files)
- T009 (failing tests) MUST be written and MUST fail before T010–T013 (backend implementation) — TDD
- T010 and T011 must be done before T012 (view depends on service method)
- T013 (URL) can be done alongside T012 (both are small edits)
- T015, T016, T017 are parallelizable (different files); all must precede T018
- T018 depends on T015 (types), T016 (en-US i18n), T017 (zh-TW i18n), T011 (backend method available)

### Parallel Opportunities

Within US1:
- T004 (language/apps.py), T005 (music/apps.py), T006 (people/apps.py) — all different files, run in parallel

Within US2 frontend:
- T015 (sync.ts types), T016 (en-US locale), T017 (zh-TW locale) — all different files, run in parallel before T018

US1 and US2 backend work can proceed in parallel with US2 frontend setup (T015–T017)

---

## Parallel Example: User Story 1

```
Parallel block 1:
  Task T004: Create language/apps.py (Language, WordCard, GrammarSheet)
  Task T005: Create music/apps.py (Song)
  Task T006: Create people/apps.py (Person, Relationship)
Sequential:
  Task T007: Run pytest — all tests pass
  Task T008: Run ruff — zero issues
```

## Parallel Example: User Story 2 Frontend

```
Parallel block:
  Task T015: Add types + getPublishPreview() to sync.ts
  Task T016: Add en-US i18n keys to locales/en-US/pages.ts
  Task T017: Add zh-TW i18n keys to locales/zh-TW/pages.ts
Sequential:
  Task T018: Update SyncTab/index.tsx publish flow
  Task T019: Run pnpm lint + typecheck + test
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001–T002)
2. Complete Phase 2: User Story 1 (T003–T008)
3. **STOP and VALIDATE**: Check IO Export tab includes 6 new tables; test publish round-trip
4. Deliver: all domains are now fully synced — this alone resolves the reported bug

### Incremental Delivery

1. Foundation → US1 (bug fix) → **validate and demo** — resolves the core bug report
2. US2 backend → US2 frontend → **validate** — adds publish preview safety net
3. Polish → final quality check

### Parallel Team Strategy (single developer context)

Since this is a single-user project, the recommended order is:
1. Phase 1 (baseline check)
2. US1 backend (T003–T008) — quick, focused bug fix
3. US2 backend (T009–T014) — new service + endpoint
4. US2 frontend (T015–T019) — can batch T015–T017 in one pass
5. Phase 4 (final validation)

---

## Notes

- All `apps.py` files follow the exact `finance/apps.py` pattern — use it as reference
- `default_auto_field = "django.db.models.BigAutoField"` should be set in each new AppConfig
- Integer PKs (auto-increment) work with the "full replace" sync strategy — no NanoID migration needed
- The `preview_publish_against_head()` function is read-only — no git staging side effects
- Publish flow change: "Publish" button now triggers preview first; confirmation triggers the existing `publishSync()` call unchanged
- All new UI strings must appear in BOTH locale files in the same commit (Constitution Principle VIII)
- [P] tasks = different files, safe to run in parallel
