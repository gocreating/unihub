---
description: "Task list for pipeline and release management feature"
---

# Tasks: Pipeline and Release Management

**Input**: Design documents from `specs/010-pipeline-release-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks grouped by user story. US1 and US2 are pure CI/CD (no app code). US3 is the full-stack version display.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[Story]**: User story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Create infrastructure directories and skeleton.

- [x] T001 Create `.github/workflows/` directory at repository root
- [x] T002 Create `apps/unihub/backend/system/` Django app skeleton: `__init__.py`, `apps.py` (AppConfig name `"system"`), placeholder `views.py`, placeholder `urls.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Version baseline that CI release detection and the version endpoint both depend on.

**⚠️ CRITICAL**: Must complete before Phase 3 (version in `pyproject.toml` must be valid before CI can detect bumps; `settings.VERSION` must exist before the view can read it).

- [x] T003 Update `apps/unihub/backend/pyproject.toml` version from `"0.1.0"` to current calendar version `"2026.6.3.1"` (format: `YYYY.M.D.N`, unpadded, PEP 440 valid)
- [x] T004 Update `apps/unihub/backend/unihub/settings.py` to read the version from `pyproject.toml` using `tomllib` at startup and format it as `settings.VERSION = "vYYYY.MM.DD.N"` (zero-padded month/day, `v` prefix)

**Checkpoint**: `settings.VERSION` is readable. `pyproject.toml` has a calendar-format version.

---

## Phase 3: User Story 1 — CI on Every Branch Push (Priority: P1) 🎯 MVP

**Goal**: Every push to any branch triggers frontend and backend quality checks + full test suite automatically, with results visible on the commit/PR.

**Independent Test**: Push a commit to a non-main branch; confirm two jobs (`frontend-ci`, `backend-ci`) appear in GitHub Actions and both report pass/fail.

### Implementation for User Story 1

- [x] T005 [US1] Create `.github/workflows/ci.yml` with `frontend-ci` job: triggers on `push` and `pull_request` for all branches; working directory `apps/unihub/frontend/`; steps: checkout, setup Node (LTS) + pnpm, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test --run`
- [x] T006 [US1] Add `backend-ci` job to `.github/workflows/ci.yml` (parallel job, same trigger): working directory `apps/unihub/backend/`; steps: checkout, setup Python 3.12 + `uv`, start PostgreSQL 16 service (env: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`), `uv sync`, `uv run ruff check .`, `uv run pytest`; set `DATABASE_URL` env var pointing to the service

**Checkpoint**: CI workflow created. Push to a feature branch to verify both jobs run.

---

## Phase 4: User Story 2 — Auto-Release on Version Bump (Priority: P2)

**Goal**: Merging a version-bumped commit to `main` automatically creates a GitHub release tagged `vYYYY.MM.DD.N` with auto-generated release notes. Zero manual steps.

**Independent Test**: Bump the version in `pyproject.toml`, merge to `main`; verify a new GitHub release appears tagged with the new version and populated with release notes.

### Implementation for User Story 2

- [x] T007 [US2] Create `.github/workflows/release.yml` with trigger on `push` to `main` only; add steps to detect version bump: fetch current `pyproject.toml` version using `grep`, fetch the same field from `HEAD~1` using `git show HEAD~1:apps/unihub/backend/pyproject.toml` (with `fetch-depth: 2` in checkout), compare and set `bumped=true/false` output
- [x] T008 [US2] Add conditional release step to `.github/workflows/release.yml`: runs only when `bumped=true`; formats the display tag (`vYYYY.MM.DD.N` with zero-padded month/day from the raw `YYYY.M.D.N` stored in `pyproject.toml`); creates the release with `gh release create <tag> --generate-notes --title "<tag>"`; requires `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`

**Checkpoint**: Release workflow created. After merging a version-bumped commit to `main`, a GitHub release appears automatically.

---

## Phase 5: User Story 3 — System > Profile Page (Priority: P3)

**Goal**: Authenticated users can navigate to System → Profile and see the currently deployed application version.

**Independent Test**: Navigate to `/system/profile` in the running app; confirm the version string (e.g., `v2026.06.03.1`) is displayed on the page and matches the value in `pyproject.toml`.

### Backend — Version Endpoint (TDD: test before implementation)

- [x] T009 [US3] Write failing pytest test for `GET /api/v1/system/version/` in `apps/unihub/backend/tests/test_system.py`: assert HTTP 200, JSON body has `version` key, value starts with `"v"` and matches `settings.VERSION`; run `uv run pytest tests/test_system.py` to confirm it fails before implementation
- [x] T010 [US3] Implement `VersionView` in `apps/unihub/backend/system/views.py`: DRF `APIView` subclass, `permission_classes = []` (public, same as health), `get()` returns `Response({"version": settings.VERSION})`
- [x] T011 [US3] Define URL in `apps/unihub/backend/system/urls.py`: `path("version/", VersionView.as_view())`; register `system` in `INSTALLED_APPS` in `apps/unihub/backend/unihub/settings.py`; include `system.urls` under `api/v1/system/` in `apps/unihub/backend/unihub/urls.py`; run `uv run pytest tests/test_system.py` to confirm the test now passes

### Frontend — Service, i18n, Page, Navigation

- [x] T012 [P] [US3] Create `apps/unihub/frontend/src/services/unihub-backend/system.ts`: export `interface SystemVersion { version: string }` and `async function getSystemVersion(): Promise<SystemVersion>` calling `GET /api/v1/system/version/`; add `export * from './system'` to `apps/unihub/frontend/src/services/unihub-backend/index.ts`
- [x] T013 [P] [US3] Add `'menu.system.profile': 'Profile'` to `apps/unihub/frontend/src/locales/en-US/menu.ts` and `'menu.system.profile': '概覽'` to `apps/unihub/frontend/src/locales/zh-TW/menu.ts`
- [x] T014 [P] [US3] Add `'pages.system.profile.title': 'System Profile'` and `'pages.system.profile.version': 'Version'` to `apps/unihub/frontend/src/locales/en-US/pages.ts`; add corresponding Traditional Chinese values (`'系統概覽'`, `'版本'`) to `apps/unihub/frontend/src/locales/zh-TW/pages.ts`
- [x] T015 [US3] Create `apps/unihub/frontend/src/pages/system/ProfilePage.tsx`: use `useQuery` to call `getSystemVersion()`; render a `Descriptions` component (1 column) with a single item — label from `formatMessage({ id: 'pages.system.profile.version' })`, value from `data?.version`; use the empty-cell placeholder `<Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>` while loading or on error; wrap the page in a `Card` with `title` from `formatMessage({ id: 'pages.system.profile.title' })`
- [x] T016 [US3] Add `{ path: '/system/profile', name: t({ id: 'menu.system.profile' }) }` to the System section routes in `apps/unihub/frontend/src/components/AppShell/AppShell.tsx`; add `<Route path="/system/profile" element={<ProfilePage />} />` in `apps/unihub/frontend/src/App.tsx` (alongside the existing `/system/io` route); add the import for `ProfilePage`

**Checkpoint**: Navigate to `/system/profile` — version is displayed. Both locale switches show translated labels.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality loop validation across all changes.

- [x] T017 Run the full quality loop: backend (`cd apps/unihub/backend && uv run ruff check . && uv run pytest`) then frontend (`cd apps/unihub/frontend && pnpm lint && pnpm typecheck && pnpm test --run`); fix any issues before closing the feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (system app directory must exist before `settings.py` can register it)
- **Phase 3 (US1)**: Depends on Phase 1 only — CI YAML is independent of the version baseline
- **Phase 4 (US2)**: Depends on Phase 2 (needs valid calendar-format version in `pyproject.toml`)
- **Phase 5 (US3)**: Depends on Phase 2 (needs `settings.VERSION`); T010–T011 depend on T009; T015 depends on T012 and T014; T016 depends on T015
- **Phase 6 (Polish)**: Depends on all phases complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 1 only — can start after T001/T002
- **US2 (P2)**: Depends on Phase 2 (T003) — needs valid calendar version for detection logic
- **US3 (P3)**: Depends on Phase 2 (T003, T004) — needs `settings.VERSION`

### Within User Story 3

```
T004 (settings.VERSION) → T009 (failing test) → T010 (view) → T011 (wire + pass)
T012, T013, T014 can run in parallel after T011 (backend done)
T015 depends on T012, T014
T016 depends on T015
```

### Parallel Opportunities

- T005 and T006 are in the same file (ci.yml) — write sequentially, but the CI jobs they define run in parallel on GitHub
- T012, T013, T014 (frontend service and i18n) are in different files — implement in parallel

---

## Parallel Example: User Story 3 Frontend

```bash
# After T011 (backend wired and test passing):

# These three tasks touch different files — start together:
Task T012: Create system.ts service and update index.ts
Task T013: Add menu.system.profile to both locale menu.ts files
Task T014: Add pages.system.profile.* to both locale pages.ts files

# Then, once T012 + T014 are done:
Task T015: Create ProfilePage.tsx

# Then:
Task T016: Wire route and nav entry
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Create `.github/workflows/ci.yml` (T005, T006)
3. **STOP and VALIDATE**: Push a branch commit — both CI jobs must run
4. Ship US1 independently

### Incremental Delivery

1. Phase 1 + T003 → Phase 2 foundation ready
2. Add US1 (T005–T006) → CI runs on all branches (MVP)
3. Add US2 (T007–T008) → Auto-release on main
4. Add US3 (T009–T016) → Version page in UI
5. Phase 6 polish → full quality sign-off

---

## Notes

- **TDD enforcement (T009–T011)**: The backend test MUST be written first and MUST fail before `VersionView` is implemented. This is required by the project constitution.
- **Calendar version format**: `pyproject.toml` stores unpadded `YYYY.M.D.N`; the tag and UI display `vYYYY.MM.DD.N` (zero-padded). The formatting happens in `settings.py` (T004) and in the release workflow tag step (T008).
- **`menu.system` already exists**: Both locale `menu.ts` files already have `menu.system`. Only `menu.system.profile` needs to be added (T013).
- **Empty-cell placeholder**: The loading/error state in ProfilePage (T015) must use `<Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>` per constitution Principle VI.
- Commit after each logical checkpoint.
