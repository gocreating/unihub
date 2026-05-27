# Implementation Plan: Data Sync Across Devices

**Branch**: `004-data-sync-across-devices` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-data-sync-devices/spec.md`

---

## Summary

Add a **Sync tab** to the existing data migration page (`/system/io`) that allows the user to publish a full snapshot of all domain tables to a private GitHub repository and apply the latest remote snapshot to the local database. Authentication uses a user-provided Personal Access Token (PAT) stored encrypted server-side; no developer OAuth app registration is required. The sync transport is git over HTTPS. Sync data is per-table CSV files identical in format to the existing manual export.

---

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 (frontend)

**Primary Dependencies**:
- Backend: Django 5.x, Django REST Framework 3.x, drf-spectacular, `cryptography` (add via `uv add cryptography`)
- Frontend: React 18.3, Ant Design 5.24, TanStack React Query 5, react-intl

**Storage**: PostgreSQL 16 (SyncConfig model) + local filesystem (git clone at `SYNC_REPO_DIR`)

**Testing**: pytest-django (backend TDD), Vitest + React Testing Library (frontend)

**Target Platform**: Linux server (Docker), web browser

**Performance Goals**: Full publish/apply cycle under 5 minutes (SC-001); status check under 10 seconds

**Constraints**: Single-user; no OAuth app; PAT Fernet-encrypted at rest; git operations with 60 s timeout

**Scale/Scope**: 1 user, ~10 domain tables, CSV files in the low-MB range

---

## Constitution Check

*GATE: Must pass before implementation. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Entity-Centric Domain Architecture | ✅ N/A | `SyncConfig` is system infrastructure (like `data_io`), not a user-managed life domain. No AttributeDefinition/AttributeValue involvement is correct. |
| II. Domain Independence | ✅ Pass | The new `sync` app imports from `data_io` services (CSV export/import). This is infrastructure-to-infrastructure; not a domain-to-domain dependency. No life domain imports another. |
| III. Reference Implementation Alignment | ✅ Pass | Django+DRF backend, React+Ant Design frontend, session auth, drf-spectacular OpenAPI — all consistent with ov-fleet. |
| IV. API Contract-Driven Frontend | ✅ Pass | New `sync` endpoints will be added to the backend first, `openapi.yaml` regenerated, then frontend types generated. No hand-written API response types. |
| V. Quality Loop Enforcement | ✅ Pass | TDD for all backend views and services. Frontend: lint + typecheck + test before each PR. |
| VI. UI/UX Reference | ✅ Pass | Sync tab follows Ant Design form + feedback patterns from ov-fleet. `useIntl` for all strings. Relative timestamps on `last_published_at`. |
| VII. PageTable Layout | ✅ N/A | Sync tab is a configuration/action panel, not a tabular data page. No `PageTable` needed. |
| VIII. Internationalisation (i18n) | ✅ Pass | All strings in `pages.io.sync.*` namespace, added to both `en-US` and `zh-TW` locale files in the same commit. |

**Post-design re-check**: All principles remain satisfied. No violations to justify.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-data-sync-devices/
├── plan.md              ← this file
├── research.md          ← Phase 0 decisions
├── data-model.md        ← SyncConfig model + API data shapes
├── quickstart.md        ← developer setup guide
├── contracts/
│   └── sync-api.md      ← REST API contract for all sync endpoints
└── tasks.md             ← Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code

```text
apps/unihub/backend/
└── sync/                          ← NEW Django app
    ├── __init__.py
    ├── apps.py                    # SyncConfig (verbose_name = "Sync")
    ├── models.py                  # SyncConfig model
    ├── serializers.py             # Config, status, publish, apply serializers
    ├── views.py                   # SyncConfigView, SyncStatusView,
    │                              #   SyncPublishView, SyncForcePublishView,
    │                              #   SyncApplyPreviewView, SyncApplyConfirmView
    ├── urls.py                    # /api/v1/sync/ routes
    ├── services/
    │   ├── __init__.py
    │   ├── git_service.py         # GitSyncService — clone, push, pull, status
    │   └── crypto.py              # encrypt_pat() / decrypt_pat() via Fernet
    └── migrations/
        └── 0001_initial.py

apps/unihub/backend/unihub/
├── settings.py                    # Add SYNC_REPO_DIR setting
└── urls.py                        # Add path("api/v1/sync/", include("sync.urls"))

apps/unihub/backend/
└── tests/sync/                    # pytest-django tests
    ├── conftest.py
    ├── test_crypto.py
    ├── test_git_service.py        # Uses tmp_path + bare git repo fixture
    ├── test_views_config.py
    ├── test_views_status.py
    ├── test_views_publish.py
    └── test_views_apply.py

apps/unihub/frontend/src/
├── pages/io/
│   ├── index.tsx                  # MODIFY — add Sync tab item to tabs array
│   └── SyncTab/
│       └── index.tsx              # NEW — SyncTab component
├── services/unihub-backend/
│   └── sync.ts                    # NEW — sync API service functions
└── locales/
    ├── en-US/pages.ts             # MODIFY — add pages.io.sync.* keys
    └── zh-TW/pages.ts             # MODIFY — add pages.io.sync.* keys
```

**Structure Decision**: Web application (backend + frontend). The `sync` backend app is a new standalone Django app following the same layout as `data_io`. The frontend Sync tab is a new component within the existing IO page directory — no new route or nav entry needed.

---

## Implementation Sequence

### Step 1 — Backend: `sync` app skeleton

1. Create `apps/unihub/backend/sync/` directory structure.
2. Write `apps.py` (`SyncConfig`, label `"sync"`).
3. Register `"sync"` in `INSTALLED_APPS` in `settings.py`.
4. Add `SYNC_REPO_DIR = BASE_DIR.parent / "sync_repo"` to `settings.py`.
5. Add `uv add cryptography` to backend dependencies.

### Step 2 — Backend: `SyncConfig` model + migration

1. Write `models.py` with `SyncConfig` (fields: `repo_url`, `pat_encrypted`, `device_name`, `last_published_at`, `last_published_commit`, `last_applied_at`, `last_applied_commit`, `created_at`, `updated_at`).
2. Run `uv run python manage.py makemigrations sync`.
3. Write `test_views_config.py` first (TDD):
   - `test_get_config_when_unconfigured` → `{ is_configured: false }`
   - `test_put_config_creates_singleton`
   - `test_put_config_updates_existing`
   - `test_delete_config_removes_row`
   - `test_pat_never_returned_in_response`

### Step 3 — Backend: PAT crypto service

1. Write `sync/services/crypto.py`:
   - `encrypt_pat(pat: str) -> str` — Fernet encrypt using `sha256(settings.SECRET_KEY)` derived key.
   - `decrypt_pat(encrypted: str) -> str` — Fernet decrypt.
2. Write `test_crypto.py`:
   - `test_encrypt_decrypt_roundtrip`
   - `test_encrypted_value_differs_from_plaintext`

### Step 4 — Backend: `GitSyncService`

Write `sync/services/git_service.py` with a `GitSyncService` class. All git commands use `subprocess.run()` with `env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "/bin/true"}` and `timeout=60`.

Key methods:
- `_authenticated_url(repo_url: str, pat: str) -> str` — embeds PAT into URL; never logged.
- `_sanitise_error(msg: str, pat: str) -> str` — strips PAT from error output before surfacing.
- `ensure_clone(repo_url: str, pat: str) -> None` — clones if clone dir absent; re-clones if corrupt.
- `status(repo_url: str, pat: str) -> SyncStatusData` — `git fetch` then `git rev-list --left-right --count HEAD...origin/HEAD`.
- `publish(repo_url: str, pat: str, device_name: str) -> SyncPublishData` — export all tables, write CSVs, `git add -A`, check diff, `git commit`, `git push`.
- `force_publish(repo_url: str, pat: str, device_name: str) -> SyncPublishData` — same but `git push --force`.
- `apply_preview(repo_url: str, pat: str) -> list[TablePreviewData]` — `git fetch`, read CSVs from `origin/HEAD`, run change_preview for each table.
- `apply_confirm(repo_url: str, pat: str) -> list[TableConfirmData]` — `git pull`, import all CSVs via `data_io` import pipeline in a single `transaction.atomic()`.

Write `test_git_service.py` using `tmp_path` and a `bare_repo` pytest fixture (creates a local bare git repo to avoid hitting GitHub):
- `test_ensure_clone_creates_directory`
- `test_status_in_sync`
- `test_status_behind`
- `test_status_diverged`
- `test_publish_creates_commit_with_csvs`
- `test_publish_no_op_when_nothing_changed`
- `test_force_publish_overwrites_remote`
- `test_apply_preview_returns_table_diffs`
- `test_apply_confirm_imports_all_tables`

### Step 5 — Backend: Serializers

Write `sync/serializers.py`:
- `SyncConfigReadSerializer` — output; includes all fields except `pat_encrypted`; adds `is_configured: bool`.
- `SyncConfigWriteSerializer` — input; validates `repo_url`, `pat` (write-only), `device_name`; calls `encrypt_pat()` on save.
- `SyncStatusSerializer` — output for status endpoint.
- `SyncPublishResponseSerializer` — output for publish endpoints.
- `SyncUpToDateSerializer` — shared `{ status, message }` shape for no-op responses.

### Step 6 — Backend: Views + URLs

Write `sync/views.py`:
- `SyncConfigView(APIView)` — GET (singleton read), PUT (upsert), DELETE.
- `SyncStatusView(APIView)` — GET; calls `GitSyncService.status()`.
- `SyncPublishView(APIView)` — POST; calls `GitSyncService.publish()`; returns 409 on diverged.
- `SyncForcePublishView(APIView)` — POST; calls `GitSyncService.force_publish()`.
- `SyncApplyPreviewView(APIView)` — POST; calls `GitSyncService.apply_preview()`.
- `SyncApplyConfirmView(APIView)` — POST; calls `GitSyncService.apply_confirm()`.

Write `sync/urls.py`:
```python
urlpatterns = [
    path("config/",          SyncConfigView.as_view()),
    path("status/",          SyncStatusView.as_view()),
    path("publish/",         SyncPublishView.as_view()),
    path("force-publish/",   SyncForcePublishView.as_view()),
    path("apply/preview/",   SyncApplyPreviewView.as_view()),
    path("apply/confirm/",   SyncApplyConfirmView.as_view()),
]
```

Register in `unihub/urls.py`: `path("api/v1/sync/", include("sync.urls"))`.

Write `test_views_status.py`, `test_views_publish.py`, `test_views_apply.py` (TDD, mock `GitSyncService`).

### Step 7 — Backend: OpenAPI schema regeneration

```bash
uv run python manage.py spectacular --file openapi.yaml
```

Verify all `/api/v1/sync/` endpoints appear in the schema.

### Step 8 — Frontend: Generate types + sync service

1. Run `pnpm openapi-ts` (or equivalent) to regenerate types from `openapi.yaml`.
2. Write `src/services/unihub-backend/sync.ts`:
   - `getConfig()` → `SyncConfigResponse`
   - `putConfig(data)` → `SyncConfigResponse`
   - `deleteConfig()` → `void`
   - `getStatus()` → `SyncStatusResponse`
   - `publish()` → `SyncPublishResponse`
   - `forcePublish()` → `SyncPublishResponse`
   - `applyPreview()` → `SyncApplyPreviewResponse`
   - `applyConfirm()` → `SyncApplyConfirmResponse`
3. Export from `src/services/unihub-backend/index.ts`.

### Step 9 — Frontend: i18n keys

Add `pages.io.sync.*` keys to both `src/locales/en-US/pages.ts` and `src/locales/zh-TW/pages.ts` in the **same commit**. Minimum required keys:

```typescript
// en-US
'pages.io.sync.tabLabel': 'Sync',
'pages.io.sync.setup.title': 'Configure Sync Repository',
'pages.io.sync.setup.repoUrl': 'GitHub Repository URL',
'pages.io.sync.setup.repoUrlHelp': 'HTTPS URL of your private repository (e.g. https://github.com/you/repo)',
'pages.io.sync.setup.pat': 'Personal Access Token',
'pages.io.sync.setup.patHelp': 'Fine-grained token with Contents: Read and Write permission.',
'pages.io.sync.setup.patGuide': 'How to create a token →',
'pages.io.sync.setup.deviceName': 'Device Name',
'pages.io.sync.setup.deviceNameHelp': 'Label recorded in git commit messages (e.g. home-desktop)',
'pages.io.sync.setup.save': 'Save Configuration',
'pages.io.sync.status.checking': 'Checking remote status…',
'pages.io.sync.status.inSync': 'Up to date',
'pages.io.sync.status.ahead': 'Ahead by {count} commit(s) — ready to publish',
'pages.io.sync.status.behind': 'Behind by {count} commit(s) — apply latest to get up to date',
'pages.io.sync.status.diverged': 'Diverged — remote has {behind} new commit(s)',
'pages.io.sync.status.noRemote': 'No remote commits yet',
'pages.io.sync.status.error': 'Could not reach remote: {message}',
'pages.io.sync.publish': 'Publish',
'pages.io.sync.forcePublish': 'Force Publish',
'pages.io.sync.applyLatest': 'Apply Latest',
'pages.io.sync.publishSuccess': 'Published successfully — commit {sha}',
'pages.io.sync.upToDate': 'Nothing to publish — already up to date',
'pages.io.sync.divergedWarning': 'Remote is ahead. Choose an action:',
'pages.io.sync.applyFirst': 'Apply Latest First',
'pages.io.sync.applyPreviewTitle': 'Preview Changes',
'pages.io.sync.applyConfirm': 'Confirm Apply',
'pages.io.sync.applySuccess': 'Applied successfully',
'pages.io.sync.lastPublished': 'Last published: {time}',
'pages.io.sync.lastApplied': 'Last applied: {time}',
'pages.io.sync.editConfig': 'Edit Configuration',
'pages.io.sync.removeConfig': 'Remove Configuration',
// zh-TW equivalents required in same commit
```

### Step 10 — Frontend: `SyncTab` component

Create `src/pages/io/SyncTab/index.tsx`. Component structure:

```
SyncTab
├── ConfigSection          — shown when is_configured=false
│   └── Ant Design Form (repo_url, pat, device_name) + Guide link
├── StatusSection          — shown when is_configured=true
│   ├── StatusBadge        — auto-fetched via useQuery(['sync-status'])
│   ├── LastSyncInfo       — last_published_at, last_applied_at (relative time)
│   ├── PublishButton      — triggers POST /publish/; handles 409 diverged
│   ├── DivergedWarning    — shown on 409; offers ApplyFirst + ForcePublish
│   ├── ApplyLatestButton  — opens ApplyPreviewModal
│   └── EditConfigButton   — switches back to ConfigSection
└── ApplyPreviewModal
    ├── ChangePreviewTable  — reuses existing component from data_io
    └── ConfirmButton       — calls POST /apply/confirm/
```

React Query keys:
- `['sync-config']` — loaded on mount; invalidated on save/delete.
- `['sync-status']` — loaded on mount (auto-check per FR-004); refetched after publish/apply.

**Mutation behaviour**:
- Save config → `putConfig()` → invalidate `sync-config` + trigger `sync-status` fetch.
- Publish → `publish()` → on 409, show `DivergedWarning`; on success, invalidate `sync-status`.
- Force publish → `forcePublish()` → invalidate `sync-status`.
- Apply preview → `applyPreview()` → open modal with preview data.
- Apply confirm → `applyConfirm()` → close modal, invalidate `sync-status`.

**Error handling**: All mutation errors shown via `message.error()` (Ant Design transient notification) consistent with Principle VII.

### Step 11 — Frontend: Add Sync tab to IO page

In `src/pages/io/index.tsx`, add to the `tabs` array:

```typescript
{
  key: 'sync',
  label: <FormattedMessage id="pages.io.sync.tabLabel" />,
  children: <SyncTab />,
}
```

### Step 12 — Quality loop + verification

```bash
# Backend
cd apps/unihub/backend
uv run ruff format .
uv run ruff check . --fix
uv run pytest

# Frontend
cd apps/unihub/frontend
pnpm lint
pnpm typecheck
pnpm test
```

Run the dev stack and verify end-to-end: configure → publish → apply on a second device (or simulated).

---

## Complexity Tracking

No constitution violations. This section is intentionally empty.
