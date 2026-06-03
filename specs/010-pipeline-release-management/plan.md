# Implementation Plan: Pipeline and Release Management

**Branch**: `010-pipeline-release-management` | **Date**: 2026-06-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-pipeline-release-management/spec.md`

## Summary

Adds automated CI/CD for the unihub monorepo: a GitHub Actions workflow runs code quality checks and the full test suite on every branch push, a second workflow auto-publishes a GitHub release when the version in `pyproject.toml` is bumped on main, and a new lightweight "System > Profile" frontend page displays the currently deployed version fetched from a new backend endpoint. Calendar versioning format `v{yyyy}.{mm}.{dd}.{n}` is adopted.

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 + React 18.3 (frontend)

**Primary Dependencies**: Django 5 + DRF 3, Ant Design 5 + Pro Components, GitHub Actions

**Storage**: N/A — no new database models; version is read from `pyproject.toml` at runtime

**Testing**: pytest-django (backend), Vitest (frontend)

**Target Platform**: Linux (GitHub-hosted runners), browser (frontend)

**Project Type**: Monorepo — web service (backend) + SPA (frontend) + CI/CD configuration

**Performance Goals**: CI completes within 10 minutes of push (per SC-001)

**Constraints**: PEP 440 version format in `pyproject.toml`; GitHub Actions YAML syntax

**Scale/Scope**: Single-repo CI; one version endpoint; one new frontend page

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Entity-Centric Domain Architecture | **N/A** | System version is not a life-domain entity; the `health/` app precedent shows lightweight non-entity apps are acceptable |
| II. Domain Independence | **PASS** | New `system` Django app is isolated from all domain apps |
| III. Reference Implementation Alignment | **PASS** | Backend: Django/DRF/uv/ruff/pytest-django. Frontend: React/AntD5/pnpm/ESLint/Vitest |
| IV. API Contract-Driven Frontend | **MUST FOLLOW** | Version endpoint must appear in OpenAPI schema; frontend types must be generated from `openapi.yaml` |
| V. Quality Loop Enforcement | **MUST FOLLOW** | CI workflow must run the exact quality loop commands defined in the constitution |
| VI. UI/UX Reference: ov-fleet | **MUST FOLLOW** | System > Profile page layout follows ov-fleet patterns |
| VII. PageTable Layout | **N/A** | No tabular data on the Profile page |
| VIII. Internationalisation | **MUST FOLLOW** | All strings on System > Profile must use `formatMessage`; both `en-US` and `zh-TW` locale files must be updated |
| IX–XII. Finance/Chart principles | **N/A** | Finance/chart-specific; not applicable |

**Post-Phase 1 re-check**: No violations introduced in design. Confirmed N/A for entity principles; IV and VIII require enforcement during implementation.

## Project Structure

### Documentation (this feature)

```text
specs/010-pipeline-release-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── system-version.yaml
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code

```text
.github/
└── workflows/
    ├── ci.yml           # Quality checks + full test suite on every branch push
    └── release.yml      # Auto-release on main when pyproject.toml version bumps

apps/unihub/backend/
└── system/              # New Django app (follows health/ pattern — no models)
    ├── __init__.py
    ├── apps.py
    ├── views.py         # VersionView — reads version from pyproject.toml via Django settings
    └── urls.py          # GET /api/v1/system/version/

apps/unihub/frontend/src/
├── pages/
│   └── system/
│       └── ProfilePage.tsx   # Displays version; follows ov-fleet page layout
├── services/
│   └── unihub-backend/
│       └── system.ts         # getSystemVersion() service call
└── locales/
    ├── en-US/pages.ts         # + system.profile.* keys
    └── zh-TW/pages.ts         # + system.profile.* keys
```

**Files updated** (not new):
- `apps/unihub/backend/unihub/settings.py` — read version from `pyproject.toml` into `VERSION` setting
- `apps/unihub/backend/unihub/urls.py` — register `system.urls`
- `apps/unihub/frontend/src/AppShell.tsx` — add "System" nav section with "Profile" item
- `apps/unihub/frontend/src/locales/en-US/menu.ts` — `menu.system`, `menu.system.profile`
- `apps/unihub/frontend/src/locales/zh-TW/menu.ts` — same

## Complexity Tracking

No constitution violations — table omitted.
