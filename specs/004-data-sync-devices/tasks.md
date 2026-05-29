# Tasks: Data Sync Across Devices

**Input**: Design documents from `specs/004-data-sync-devices/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/sync-api.md ✅

**Tests**: Backend tests are **mandatory** per Constitution Principle V (TDD — write test first, verify it fails, then implement). Frontend tests are included for the service layer.

**Organization**: Tasks grouped by user story. Phase 2 (Foundational) must complete before any user story work begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no in-phase dependencies)
- **[Story]**: User story this task belongs to (US1, US2)
- Backend paths: `apps/unihub/backend/`
- Frontend paths: `apps/unihub/frontend/src/`

---

## Phase 1: Setup

**Purpose**: Create the `sync` Django app skeleton, register it, and add required dependencies.

- [ ] T001 Create `sync` app directory: `apps/unihub/backend/sync/` with `__init__.py`, `apps.py`, stub `models.py`, `serializers.py`, `views.py`, `urls.py`, `services/__init__.py`, `migrations/__init__.py`
- [ ] T002 Register `"sync"` in `INSTALLED_APPS`, add `SYNC_REPO_DIR = BASE_DIR.parent / "sync_repo"` to `apps/unihub/backend/unihub/settings.py`, and add `path("api/v1/sync/", include("sync.urls"))` to `apps/unihub/backend/unihub/urls.py`
- [ ] T003 Add `cryptography` dependency: run `uv add cryptography` from `apps/unihub/backend/` and verify it appears in `pyproject.toml`
- [ ] T004 Verify `git` is available in the Docker image: check `apps/unihub/backend/Dockerfile` and add `RUN apt-get install -y git` if absent; verify `docker compose exec backend git --version` works

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `SyncConfig` model, PAT crypto, `SyncConfigView` (config CRUD), `SyncStatusView` + `GitSyncService` status/clone — shared by both user stories. No user story work until this phase is complete.

**⚠️ CRITICAL**: TDD — each test task must be written and must fail before the paired implementation task runs.

- [ ] T005 Write `SyncConfig` model fields (`repo_url`, `pat_encrypted`, `device_name`, `last_published_at`, `last_published_commit`, `last_applied_at`, `last_applied_commit`, `created_at`, `updated_at`) in `apps/unihub/backend/sync/models.py`
- [ ] T006 Generate initial migration: run `uv run python manage.py makemigrations sync` to produce `apps/unihub/backend/sync/migrations/0001_initial.py`, then `uv run python manage.py migrate sync`
- [ ] T007 [P] Write crypto tests (TDD — must fail first) covering roundtrip, value-differs-from-plaintext, and wrong-key-raises in `apps/unihub/backend/tests/sync/test_crypto.py`
- [ ] T008 [P] Implement PAT crypto service: `encrypt_pat(pat: str) -> str` and `decrypt_pat(encrypted: str) -> str` (Fernet, key from `sha256(settings.SECRET_KEY)`) in `apps/unihub/backend/sync/services/crypto.py` — run T007 tests, confirm they pass
- [ ] T009 Write `SyncConfigView` tests (TDD — must fail first): `test_get_unconfigured`, `test_put_creates_singleton`, `test_put_updates_existing`, `test_delete_removes`, `test_pat_never_in_response`, `test_repo_url_validation` in `apps/unihub/backend/tests/sync/test_views_config.py`
- [ ] T010 Write `SyncConfigReadSerializer` (all fields except `pat_encrypted`; add `is_configured: bool`), `SyncConfigWriteSerializer` (validates `repo_url`, `pat` write-only, `device_name`; calls `encrypt_pat`) in `apps/unihub/backend/sync/serializers.py`
- [ ] T011 Implement `SyncConfigView(APIView)` with GET (singleton read → `is_configured: false` when absent), PUT (upsert), DELETE in `apps/unihub/backend/sync/views.py`; populate `sync/urls.py` with `path("config/", SyncConfigView.as_view())`; run T009 tests, confirm they pass
- [ ] T012 Write `SyncStatusView` tests (TDD — must fail first): `test_status_not_configured`, `test_status_in_sync`, `test_status_behind`, `test_status_diverged`, `test_status_git_error` in `apps/unihub/backend/tests/sync/test_views_status.py` (mock `GitSyncService.status`)
- [ ] T013 Write `tests/sync/conftest.py` with `bare_repo` pytest fixture: creates a temporary bare git repo + working clone using `tmp_path`, suitable for testing git operations without network access
- [ ] T014 Write `GitSyncService` tests for `ensure_clone()` and `status()` (TDD — must fail first): `test_ensure_clone_creates_dir`, `test_ensure_clone_reclones_on_missing`, `test_status_in_sync`, `test_status_behind`, `test_status_diverged`, `test_status_no_remote` in `apps/unihub/backend/tests/sync/test_git_service.py`
- [ ] T015 Implement `GitSyncService` with `_authenticated_url()`, `_sanitise_error()`, `ensure_clone()`, and `status()` using `subprocess.run(timeout=60, env={…GIT_TERMINAL_PROMPT:0…})` in `apps/unihub/backend/sync/services/git_service.py`; add `SyncStatusSerializer` to `serializers.py`; implement `SyncStatusView` in `views.py`; add `path("status/", SyncStatusView.as_view())` to `sync/urls.py`; run T012 and T014 tests, confirm they pass

**Checkpoint**: Config CRUD and status check are fully functional. Run `uv run pytest tests/sync/` — all green.

---

## Phase 3: User Story 1 — Publish Current Snapshot (Priority: P1) 🎯 MVP

**Goal**: User can save sync configuration and publish a full data snapshot to GitHub as a git commit.

**Independent Test**: Open the Sync tab, complete the setup form, click Publish, and verify a new commit with per-table CSV files appears in the GitHub repository. Works as a standalone backup even without a second device.

### Backend — Publish

- [ ] T016 Write publish view tests (TDD — must fail first): `test_publish_success`, `test_publish_up_to_date`, `test_publish_diverged_returns_409`, `test_force_publish_success`, `test_force_publish_not_configured` in `apps/unihub/backend/tests/sync/test_views_publish.py` (mock `GitSyncService`)
- [ ] T017 Write `GitSyncService` tests for `publish()` and `force_publish()` (TDD — must fail first): `test_publish_creates_csv_files_and_commit`, `test_publish_returns_up_to_date_when_no_changes`, `test_publish_raises_on_diverged`, `test_force_publish_pushes_with_force` in `apps/unihub/backend/tests/sync/test_git_service.py` (append to existing file, using `bare_repo` fixture)
- [ ] T018 Implement `GitSyncService.publish()`: export all registry tables via `data_io.services.csv_exporter.export_table()`, write `{app}_{model}.csv` files to clone dir, `git add -A`, check `git diff --cached --quiet` for no-op, `git commit -m "Sync from {device_name} at {iso_timestamp}"`, `git push origin HEAD` — update `last_published_at` + `last_published_commit` on `SyncConfig`; implement `force_publish()` same but `git push --force origin HEAD` in `apps/unihub/backend/sync/services/git_service.py`
- [ ] T019 Add `SyncPublishResponseSerializer`, `SyncUpToDateSerializer` to `apps/unihub/backend/sync/serializers.py`; implement `SyncPublishView` (POST, returns 409 on diverged) and `SyncForcePublishView` (POST) in `apps/unihub/backend/sync/views.py`; add `path("publish/", …)` and `path("force-publish/", …)` to `sync/urls.py`; run T016 and T017 tests, confirm they pass
- [ ] T020 Regenerate OpenAPI schema: run `uv run python manage.py spectacular --file openapi.yaml` from `apps/unihub/backend/`; verify all `/api/v1/sync/` endpoints (config, status, publish, force-publish) appear in the generated `openapi.yaml`

### Frontend — Config + Status + Publish UI

- [ ] T021 Regenerate frontend TypeScript types from `openapi.yaml` (run the openapi-ts/openapi-typescript command per project convention); verify sync types appear in the generated output under `apps/unihub/frontend/`
- [ ] T022 Create `apps/unihub/frontend/src/services/unihub-backend/sync.ts` with `getConfig()`, `putConfig()`, `deleteConfig()`, `getStatus()`, `publish()`, `forcePublish()` functions using generated types; export from `apps/unihub/frontend/src/services/unihub-backend/index.ts`
- [ ] T023 Add all `pages.io.sync.*` i18n keys (tab label, setup form labels, PAT guide text, status messages, button labels, success/error notifications) to **both** `apps/unihub/frontend/src/locales/en-US/pages.ts` and `apps/unihub/frontend/src/locales/zh-TW/pages.ts` in the same commit (see plan.md Step 9 for the full key list)
- [ ] T024 [P] Create `apps/unihub/frontend/src/pages/io/SyncTab/index.tsx`: implement `ConfigSection` — Ant Design Form with `repo_url` (URL input), `pat` (password input with eye toggle), `device_name` (text input), inline PAT guide link (opens `https://github.com/settings/tokens?type=beta` in new tab), and Save Configuration button wired to `putConfig()` mutation; all labels via `useIntl().formatMessage`
- [ ] T025 [P] Implement `StatusSection` in `apps/unihub/frontend/src/pages/io/SyncTab/index.tsx`: `useQuery(['sync-status'], getStatus)` auto-fetches on mount; render `StatusBadge` (Ant Design `Badge`/`Tag` showing in_sync/ahead/behind/diverged/no_remote/error); show `last_published_at` and `last_applied_at` with absolute + relative time (dayjs `YYYY-MM-DD HH:mm (X days ago)` per Constitution VI); show "Edit Configuration" button to toggle back to ConfigSection
- [ ] T026 Implement `PublishButton` + `DivergedWarning` in `apps/unihub/frontend/src/pages/io/SyncTab/index.tsx`: Publish button calls `publish()` mutation; on success shows `message.success` with commit SHA; on 409 diverged shows `DivergedWarning` component with two buttons — "Apply Latest First" (scrolls/switches to apply flow) and "Force Publish" (calls `forcePublish()` mutation); on other errors shows `message.error`; invalidates `['sync-status']` query on success
- [ ] T027 Add the Sync tab item to `apps/unihub/frontend/src/pages/io/index.tsx`: append `{ key: 'sync', label: <FormattedMessage id="pages.io.sync.tabLabel" />, children: <SyncTab /> }` to the `tabs` array; import `SyncTab`

**Checkpoint**: User Story 1 fully functional. Configure sync repo → Publish → verify commit on GitHub. Run `uv run pytest tests/sync/` and `pnpm typecheck`.

---

## Phase 4: User Story 2 — Apply Latest Snapshot (Priority: P2)

**Goal**: User can preview and apply the latest remote snapshot to the local database.

**Independent Test**: With an existing commit in the GitHub repo, open the Sync tab on a second device, click Apply Latest, confirm the preview, and verify all tables match the remote state.

### Backend — Apply

- [ ] T028 Write apply view tests (TDD — must fail first): `test_apply_preview_returns_per_table_diffs`, `test_apply_preview_up_to_date`, `test_apply_confirm_imports_all_tables`, `test_apply_not_configured` in `apps/unihub/backend/tests/sync/test_views_apply.py` (mock `GitSyncService`)
- [ ] T029 Write `GitSyncService` tests for `apply_preview()` and `apply_confirm()` (TDD — must fail first): `test_apply_preview_fetches_and_returns_diffs`, `test_apply_preview_up_to_date`, `test_apply_confirm_imports_in_topo_order`, `test_apply_confirm_updates_last_applied_fields` in `apps/unihub/backend/tests/sync/test_git_service.py` (append, using `bare_repo` fixture with pre-seeded CSVs)
- [ ] T030 Implement `GitSyncService.apply_preview()`: `git fetch origin`, check behind_count, if 0 return up-to-date, else read CSV files from `origin/HEAD` tree, call `data_io.services.change_preview.compute_diff()` per table, return per-table diffs; implement `apply_confirm()`: `git pull origin HEAD` (fast-forward), read CSV files from working tree, call `data_io` import pipeline in `transaction.atomic()` with topological order, update `last_applied_at` + `last_applied_commit` on `SyncConfig` in `apps/unihub/backend/sync/services/git_service.py`
- [ ] T031 Implement `SyncApplyPreviewView` (POST) and `SyncApplyConfirmView` (POST) in `apps/unihub/backend/sync/views.py`; add `path("apply/preview/", …)` and `path("apply/confirm/", …)` to `sync/urls.py`; run T028 and T029 tests, confirm they pass
- [ ] T032 Regenerate OpenAPI schema: run `uv run python manage.py spectacular --file openapi.yaml`; verify apply endpoints appear; regenerate frontend TypeScript types

### Frontend — Apply UI

- [ ] T033 Add `applyPreview()` and `applyConfirm()` functions to `apps/unihub/frontend/src/services/unihub-backend/sync.ts` using newly generated types
- [ ] T034 Implement `ApplyLatestButton` + `ApplyPreviewModal` in `apps/unihub/frontend/src/pages/io/SyncTab/index.tsx`: Apply Latest button calls `applyPreview()` mutation; on up-to-date shows `message.info`; otherwise opens Ant Design `Modal` containing `ChangePreviewTable` (reused from existing `@/components/ImportExport/ChangePreviewTable`) with per-table diffs; modal footer has Cancel and "Confirm Apply" button that calls `applyConfirm()` mutation, shows `message.success` on completion, closes modal, and invalidates `['sync-status']` query; all error cases show `message.error`

**Checkpoint**: User Story 2 fully functional. Apply Latest → preview → confirm → verify local DB matches remote. Run `uv run pytest tests/sync/` and `pnpm typecheck`.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Run backend quality loop from `apps/unihub/backend/`: `uv run ruff format .`, `uv run ruff check . --fix`, `uv run pytest` — fix any issues; confirm zero warnings/errors
- [ ] T036 [P] Run frontend quality loop from `apps/unihub/frontend/`: `pnpm lint`, `pnpm typecheck`, `pnpm test` — fix any issues; confirm zero warnings/errors
- [ ] T037 End-to-end validation per `specs/004-data-sync-devices/quickstart.md`: configure sync, publish, open a second browser profile (or modify data), apply latest, confirm data matches

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **blocks both user stories**
- **Phase 3 (US1 — Publish)**: Depends on Phase 2
- **Phase 4 (US2 — Apply)**: Depends on Phase 3 (shares git service + OpenAPI types)
- **Phase 5 (Polish)**: Depends on Phase 4

### User Story Dependencies

- **US1 (Publish)**: Can start once Phase 2 is complete
- **US2 (Apply)**: Can start once US1 backend is complete (shares `GitSyncService`, needs OpenAPI regen from T020/T021)

### Within Each Phase

1. TDD: write test → verify it fails → implement → verify it passes
2. Backend models before services, services before views, views before URLs
3. OpenAPI regen after all backend for that story, before frontend types
4. Frontend service before component; i18n keys before component strings

---

## Parallel Opportunities

```bash
# Phase 2 — can run T007 (crypto tests) and T009 (config view tests) in parallel
# (different files, no in-phase dependencies)

# Phase 3 frontend — T024 (ConfigSection) and T025 (StatusSection) can run in parallel
# (same file but distinct functions/components — coordinate merge carefully)
```

---

## Implementation Strategy

### MVP (User Story 1 Only — Phases 1–3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — config CRUD + status check working
3. Complete Phase 3: Publish backend + frontend
4. **STOP and VALIDATE**: configure sync repo, click Publish, verify GitHub commit
5. Ship MVP — data backup works from one device

### Incremental Delivery

1. Phases 1–2 → Foundation ready (config + status API)
2. Phase 3 → US1 complete → **MVP: single-device backup**
3. Phase 4 → US2 complete → **Full sync: two-device round-trip**
4. Phase 5 → Polish, quality gate passed

---

## Notes

- [P] tasks touch different files and can run in parallel within their phase
- [US1]/[US2] labels map each task to its user story for traceability
- Backend: TDD is **mandatory** (Constitution Principle V) — every implementation task has a paired test task
- i18n: en-US and zh-TW locale keys **must** be added in the same commit (Constitution Principle VIII)
- OpenAPI: regen after each backend milestone (T020 after US1 backend, T032 after US2 backend) before writing frontend service functions
- PAT must never appear in logs or error output — `_sanitise_error()` in git_service enforces this
