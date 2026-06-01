# Implementation Plan: Fix Finance Data Sync — Systematic Full-Field Coverage

**Branch**: `009-fix-finance-sync` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-fix-finance-sync/spec.md`

## Summary

The data sync export/import mechanism silently omits model fields that were added after the initial sync registration was written. Root cause: manually maintained field lists in `finance/apps.py` not updated when `Currency.is_base_currency` and `Account.color` were added. Same omission affects `Account.created_at`/`updated_at` and `BalanceSheet.created_at`/`updated_at`.

Two-layer fix: (1) immediate patch to add confirmed missing fields; (2) systemic `auto_system_fields()` utility in `data_io/registry.py` that derives `FieldDescriptor` objects from Django model metadata, ensuring any future field addition is automatically included without manual sync updates.

## Technical Context

**Language/Version**: Python 3.12, Django 5.x

**Primary Dependencies**: Django REST Framework, pytest-django — no new dependencies

**Storage**: PostgreSQL 16 — no new tables or migrations

**Testing**: pytest-django (backend only — no frontend component)

**Target Platform**: Backend server (Django)

**Project Type**: Backend-only bug fix + infrastructure improvement

**Performance Goals**: No performance impact; `model._meta.concrete_fields` enumeration is instantaneous at app startup

**Constraints**: Must preserve backward compatibility — importing older CSVs with missing columns must not fail

**Scale/Scope**: All 5 registered Finance tables (Currency, Account, BalanceSheet, ExchangeRate, Balance)

## Constitution Check

*Gate: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Entity-Centric Domain Architecture | ✅ Pass | No change to entity/attribute infrastructure; fix is in sync layer only |
| II — Domain Independence | ✅ Pass | `auto_system_fields()` lives in `data_io/` (shared infra); Finance `apps.py` uses it independently |
| III — Reference Implementation Alignment | ✅ Pass | Uses existing Django patterns (`_meta.concrete_fields`); no new libraries |
| IV — API Contract-Driven Frontend | ✅ Pass | No API contract changes; sync export format is internal CSV, not exposed via OpenAPI |
| V — Quality Loop Enforcement | ✅ Pass | Test-first required; regression tests must cover field coverage for each registered table |
| VI–XI | ✅ Pass | No frontend changes; no chart/i18n/UI impact |

**No violations. No Complexity Tracking required.**

## Project Structure

### Documentation (this feature)

```text
specs/009-fix-finance-sync/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── field-coverage-contract.md
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code

```text
apps/unihub/backend/
  data_io/
    registry.py          ← MODIFIED: add auto_system_fields() + _field_to_data_type() helpers
  finance/
    apps.py              ← MODIFIED: migrate from manual field lists to auto_system_fields()
  tests/
    test_sync_field_coverage.py  ← NEW: regression tests asserting all model fields are registered
```

**Structure Decision**: Backend-only. Changes in `data_io/registry.py` (new utility) and `finance/apps.py` (consumer). New test file ensures this class of omission cannot silently recur.

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
