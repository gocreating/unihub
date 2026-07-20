# Implementation Plan: Entity Views

**Branch**: `016-entity-views` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-entity-views/spec.md`

## Summary

Users can save an entity table's full configuration — filter groups, sort rules, column visibility/ordering/pins, and page size — as named, per-account, per-table **views**, presented as a tab row above the existing `EntityToolbar` (`[+] tabs… [View]`). Views are fully serializable: inline in the URL (`view[<tableKey>]=type=inline&…`) or stored server-side and referenced by id with optional overrides (`type=saved&id=…&…`). Technical approach: a new `EntityView` model + owner-scoped DRF ViewSet in the backend `core/` app; on the frontend, a `useEntityViews` hook layered on `useEntityTable` (whose already-threaded-but-unused `key` param becomes the table namespace), a `ViewTabs` component slotted into `PageTable` above the toolbar, URL sync via React Router `useSearchParams`, and session tabs in `sessionStorage`. The existing serializers (`rulesToOrdering`/`orderingToRules`, `groupsToPayload`/`payloadToGroups`) are reused for the wire format.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend), Python 3.12 (backend)

**Primary Dependencies**: React 18.3, Ant Design 5.24 + Pro Components 2.8, TanStack React Query 5, React Router 7 (library mode, `BrowserRouter`), react-intl; Django 5.x, DRF 3.x, drf-spectacular

**Storage**: PostgreSQL 16 (`EntityView` table in `core/` app); `sessionStorage` for session-scoped open tabs; URL query string for the active view's serialized state

**Testing**: Vitest + React Testing Library (hooks/components/pages), Playwright e2e (`frontend/e2e/`), pytest-django (backend, TDD red-green)

**Target Platform**: Desktop/tablet web browsers (mobile out of scope per constitution)

**Project Type**: Web application — Django backend + React SPA frontend under `apps/unihub/`

**Performance Goals**: Tab switch applies a config with no extra server round-trip beyond the (already React-Query-cached) list refetch; saved-view list fetch ≤ 1 query per table per page load (React Query cache); no regression to existing table interactions

**Constraints**: Inline URL serialization must stay compact and hand-readable (mini query-string per issue #19 format, not base64 blobs); URL must remain the single source of truth for the active view state; all staged mutations (manage modal) hit the API only on Save (user feedback rule); `strict: true` TS, zero ESLint warnings

**Scale/Scope**: Single-user personal hub; ~5 entity list pages adopt the feature (finance currencies/accounts/exchange-rates, inventory catalog/scenarios); tens of saved views per table at most

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Entity-centric + data_io | ✅ PASS (deferral recorded) | `EntityView` is cross-domain *infrastructure* (like `AttributeDefinition`/`AttributeValue`, which already live in `core/` with concrete models) — not a domain entity, so it does not itself use the attribute mechanism. **data_io registration is EXPLICITLY DEFERRED** (recorded in `core/apps.py ready()` per Principle I): the registry's `use_natural_key` path is contenttypes-specific and cannot represent the `owner` FK to `auth.User` (export writes `app_label.model`; import special-cases `contenttypes.contenttype` only). Registering without the owner column would break import (NOT NULL). Revisit when the registry supports user natural keys; saved views are per-user UI preferences, not primary domain data. |
| II | Domain independence | ✅ PASS | All new backend code lives in `core/`; domains opt in from the frontend via `useEntityTable`. No domain imports another domain. |
| III | Reference alignment | ✅ PASS | Standard DRF ViewSet + serializer + router; React Query for fetching; AntD components for tabs/dropdown/modal. |
| IV | API contract-driven | ✅ PASS (with pre-existing deviation) | Backend schema regenerates automatically (drf-spectacular, live at `/api/schema/`); `pnpm generate-types` refreshes `src/generated/api-types.ts`. Service-layer interfaces are hand-written per the existing repo-wide practice (every current service file hand-writes its types; the generated file is not imported anywhere). This deviation predates this feature and is not widened by it. |
| V | Quality loop + TDD | ✅ PASS | Backend: pytest tests written first (`test_entity_views.py`) covering happy + error paths. Frontend: Vitest/RTL for serialization module, `useEntityViews`, `ViewTabs`, page integration; full lint/typecheck/test/build loop. |
| VI | UI/UX (ov-fleet) | ✅ PASS | View dropdown constrains height (`maxHeight: 60vh`, internal scroll). Manage modal keeps Cancel (left) + primary Save (right), dirty-guarded against outside-click close. Long tab names use `OverflowTooltip` (truncation-gated). Deleting saved views gets `Modal.confirm` with `okType: 'danger'` before the staged deletion is committed on Save. All strings via `formatMessage`. |
| VII | PageTable layout | ✅ PASS | The view tab row renders INSIDE the white `pageCard`, above the toolbar. `PageTable` gains an optional `viewBar` slot rendered between the title row and the toolbar row — the structure stays owned by `PageTable`, never re-implemented per page. |
| VIII | i18n | ✅ PASS | New keys under `common.entityViews.*` added to BOTH `en-US` and `zh-TW` in the same commits; ICU plurals for any count-bearing strings (e.g. delete confirmation "{n, plural, one {# view} other {# views}}"). |
| IX | Base currency | N/A | No monetary display added. |
| X/XI | Charts | N/A | No charts. |
| XII | Entity toolbar patterns | ✅ PASS | Apply-gate untouched: loading a view sets BOTH `active` and `pending` states of each hook (a view-level load, not a bypass of panel Apply). `panelApplyCount`/remount-key patterns preserved; the remount key additionally incorporates the active tab identity. New `load*()` setters are additive to the hooks. |
| — | Dev constraints | ✅ PASS | pnpm/uv only; session auth; single user owns data (views owner-scoped); desktop-first; `Modal.confirm` delete gate honored. |

**Initial gate result**: PASS — no violations to justify. Re-checked after Phase 1 design: still PASS (design artifacts below conform).

## Project Structure

### Documentation (this feature)

```text
specs/016-entity-views/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── entity-views-api.md      # REST contract for saved views
│   └── view-url-serialization.md# URL wire-format contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── core/
│   ├── models.py            # + EntityView model (nanoid PK, owner FK, table_key, name, config JSON, pinned, position)
│   ├── serializers.py       # + EntityViewSerializer
│   ├── views.py             # + EntityViewViewSet (owner-scoped, ?table_key= filter, reorder action)
│   ├── urls.py              # + router registration entity-views
│   ├── apps.py              # + data_io TableDescriptor registration for core.entityview
│   └── migrations/          # + 0005_entityview
└── tests/
    └── test_entity_views.py # NEW — TDD suite (CRUD, owner scoping, unique name, reorder, table_key filter)

apps/unihub/frontend/src/
├── components/
│   ├── EntityToolbar/
│   │   ├── types.ts                 # + ViewConfig type
│   │   └── hooks/
│   │       ├── useEntityFilter.ts   # + loadGroups() (set active+pending)
│   │       ├── useEntitySort.ts     # + loadRules()
│   │       └── useColumnConfig.ts   # + loadState() (with drift reconciliation)
│   ├── EntityViews/                 # NEW
│   │   ├── ViewTabs.tsx             # [+] tabs… [View] row (overflow scroll, dirty dots)
│   │   ├── ViewDropdown.tsx         # open/Save/Duplicate/Edit menu
│   │   ├── ManageViewsModal.tsx     # staged rename/pin/reorder/delete (Save commits)
│   │   ├── SaveViewModal.tsx        # name prompt for save-as
│   │   ├── serialization.ts         # ViewConfig <-> URL mini-format + <-> JSON
│   │   ├── useEntityViews.ts        # tabs state, URL sync, sessionStorage, dirty calc
│   │   └── *.test.ts(x)             # RTL/unit suites
│   ├── PageTable/index.tsx          # + optional viewBar slot above toolbar row
│   └── EntityToolbar/hooks/useEntityTable.ts  # + views integration (snapshot/load, tableKey)
├── services/unihub-backend/core.ts  # + EntityView CRUD service functions + types
├── locales/en-US/pages.ts           # + common.entityViews.* keys
├── locales/zh-TW/pages.ts           # + common.entityViews.* keys
└── pages/
    ├── inventory/catalog/index.tsx  # adopt views (tableKey 'inventory-catalog')
    ├── inventory/scenarios/index.tsx
    ├── finance/accounts/index.tsx
    ├── finance/currencies/index.tsx
    └── finance/exchange-rates/index.tsx

apps/unihub/frontend/e2e/
└── entity-views.spec.ts             # NEW — tab row layout, deep-link, narrow-screen scroll
```

**Structure Decision**: Web application structure (existing). Backend additions confined to `core/` (cross-domain infrastructure precedent: `AttributeDefinition`). Frontend additions form a new `components/EntityViews/` module composing with — not rewriting — the existing `EntityToolbar` hook family; pages adopt via small wiring diffs (`useEntityTable` already threads a `key`).

## Complexity Tracking

> No constitution violations — table intentionally empty.
