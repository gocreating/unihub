# Implementation Plan: Data Sync Migration Fix & Publish Preview

**Branch**: `007-data-sync-migration-fix` | **Date**: 2026-05-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-data-sync-migration-fix/spec.md`

## Summary

Two related improvements to the data sync feature. (1) **Bug fix**: `language`, `music`, and `people` Django apps have no `apps.py`, so their models are never registered in the `data_io` registry. Every sync, export, diff, and import silently omits these three domains. Fix: add `apps.py` to each with `TableDescriptor` registrations. (2) **Publish preview**: add a `GET /api/v1/sync/publish/preview/` endpoint that computes a per-table change summary (added/modified/deleted record counts) by comparing the current DB state against the last published HEAD commit in the clone, without staging or committing anything. The frontend Publish flow is updated to call the preview first and require explicit confirmation before triggering the actual publish.

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 / React 18.3 (frontend)

**Primary Dependencies**: Django 5 + DRF 3, drf-spectacular, pytest-django (backend); Ant Design 5, TanStack React Query 5, react-intl (frontend)

**Storage**: PostgreSQL 16 (shared single database)

**Testing**: pytest-django (backend), Vitest (frontend)

**Target Platform**: Linux server (backend), desktop/tablet browser (frontend)

**Project Type**: Web application — single Django backend with React SPA frontend

**Performance Goals**: Publish preview computed in under 5 seconds for typical data volumes (hundreds of records per table)

**Constraints**: No new database migrations required. No changes to existing sync/apply flow. No changes to the CSV format or registry API contract.

**Scale/Scope**: Single-user, single-installation. Registry has ~6 existing tables; adding ~6 new tables from language/music/people.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Entity-Centric Domain Architecture | ⚠️ PRE-EXISTING VIOLATION | `language`, `music`, `people` models bypass the AttributeDefinition/AttributeValue system — they use hardcoded Django fields. This violation is pre-existing and out of scope for this feature. This plan adds sync support for the existing non-compliant models without introducing new violations. Documented in Complexity Tracking. |
| II. Domain Independence | ✅ Pass | New `apps.py` files register tables without cross-domain imports. |
| III. Reference Implementation Alignment | ✅ Pass | Follows existing `finance/apps.py` pattern for table registration. New endpoint follows existing `SyncApplyPreviewView` pattern. |
| IV. API Contract-Driven Frontend | ⚠️ EXISTING PATTERN CONTINUED | The `sync.ts` service file already hand-writes types (not from `generated/`). The new `SyncPublishPreviewResult` type will follow the same hand-written pattern as existing sync types. |
| V. Quality Loop Enforcement | ✅ Pass | Tests required for the new endpoint. Backend tests written before implementation (red-green-refactor). |
| VI. UI/UX Reference: ov-fleet | ✅ Pass | Inline preview pattern follows existing apply preview approach. |
| VII. PageTable Layout | ✅ Pass | Publish preview uses a compact summary table (counts only) rendered inline in the Sync actions section. The same approach as the existing apply preview (Collapse + summary). Not a standalone page table. |
| VIII. Internationalisation | ✅ MUST comply | All new UI strings added to both `en-US/pages.ts` and `zh-TW/pages.ts` in the same commit. |
| IX. Base Currency Net Worth | N/A | No monetary data involved. |
| X. Chart Rendering | N/A | No charts involved. |
| XI. Chart Library & Visualization Standards | N/A | No charts involved. |

## Project Structure

### Documentation (this feature)

```text
specs/007-data-sync-migration-fix/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

**Backend** — `apps/unihub/backend/`:

```text
language/
└── apps.py              # NEW — register Language, WordCard, GrammarSheet

music/
└── apps.py              # NEW — register Song

people/
└── apps.py              # NEW — register Person, Relationship

sync/
├── services/
│   └── publish_helper.py  # MODIFIED — add preview_publish_against_head()
├── views.py               # MODIFIED — add SyncPublishPreviewView
└── urls.py                # MODIFIED — add publish/preview/ route

tests/sync/
└── test_views_publish.py  # MODIFIED — add publish preview endpoint tests
```

**Frontend** — `apps/unihub/frontend/src/`:

```text
services/unihub-backend/
└── sync.ts              # MODIFIED — add getPublishPreview(), SyncPublishPreviewResult

pages/io/SyncTab/
└── index.tsx            # MODIFIED — publish flow: preview → confirm → publish

locales/en-US/
└── pages.ts             # MODIFIED — add publish preview i18n keys

locales/zh-TW/
└── pages.ts             # MODIFIED — add publish preview i18n keys
```

**Structure Decision**: Existing web-application structure (separate backend/ and frontend/). No new apps, no new directories — only additions to existing apps and files.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Principle I: `language`, `music`, `people` models bypass AttributeDefinition/AttributeValue system | These models predate the entity/attribute infrastructure and are actively used. The sync bug fix must work with them as-is. | Refactoring these models to use the shared entity system is a separate multi-feature effort that could break existing data and UI. Out of scope here. |
| Principle IV: Hand-written sync types in `sync.ts` | The sync service already uses hand-written types; adding a new type to match the new endpoint continues the existing pattern without introducing a new deviation. | Generating types from OpenAPI is the right long-term fix but requires generating openapi.yaml and updating the full sync service — out of scope for this targeted bug fix. |
