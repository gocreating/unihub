# Implementation Plan: Quick Search

**Branch**: `019-quick-search` | **Date**: 2026-08-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-quick-search/spec.md` (GitHub issue #42)

## Summary

Add a free-text quick-search to all five entity tables: a toolbar input (next to the Columns button, stretched to fill the row) that live-narrows the table to rows where the query is a case-insensitive substring of ANY attribute — including dynamic parameters — always scoped INSIDE the active view's filter, with per-view-tab query context, `<mark>` highlighting in visible columns, and debounced requests.

Technical approach (full decisions in [research.md](research.md)): one `search` query param on the existing list endpoints, applied by a new declarative `EntitySearchFilter` in `core/` that ORs `__icontains` legs across declared fields (`Cast(..., TextField())` for numeric/date; an `Exists` subquery over `AttributeValue` for dynamic parameters) and therefore ANDs with the existing `filters` payload by backend ordering. Frontend: `useEntityTable` owns the live query (300 ms debounced into `queryParams` → React Query key isolation kills stale responses), `InternalTab.search` carries per-tab context (never `ViewConfig` — search stays invisible to URL serialization, dirty compare, and saved views by construction), a `SearchHighlightContext` + `SearchMark` leaf marks matches without touching `colDefMap` dependency arrays, and the catalog's existing flatten-on-item-interaction rule extends to "search active".

## Technical Context

**Language/Version**: TypeScript 5.7 / React 18.3 (frontend); Python 3.12 / Django 5.x + DRF 3.x (backend)

**Primary Dependencies**: Ant Design 5.24 + Pro Components 2.8, TanStack React Query 5, React Router 7, Vite 6; drf-spectacular; PostgreSQL driver (existing — no new dependencies on either side)

**Storage**: PostgreSQL 16 — **no schema change, no migrations, no `data_io` changes** (search is a read-time queryset narrowing)

**Testing**: pytest-django (`tests/test_entity_search.py`, TDD-first), Vitest + RTL (hook/page suites), Playwright e2e (`quick-search.spec.ts`, human-run per standing rule)

**Target Platform**: Existing web app (`apps/unihub/` frontend SPA + Django backend), desktop/tablet widths

**Project Type**: Web application (monorepo: `apps/unihub/frontend` + `apps/unihub/backend`)

**Performance Goals**: results ≤ 1 s after the typing pause at current scale (~1,000 items — SC-002); ≤ 1–2 requests per 10-keystroke burst (SC-003, 300 ms debounce)

**Constraints**: search must NEVER enter `ViewConfig`/URL/dirty-compare/saved views (016 rounds 6–10 invariants, FR-033); literal-text matching only (FR-013); no ProTable built-in `search` prop (constitution VII); i18n both locales in the same change (VIII)

**Scale/Scope**: 5 entity pages, 6 list endpoints, ~1,000 rows max per table today; single authenticated user

## Constitution Check

*GATE — evaluated pre-Phase-0 and re-checked post-Phase-1 design. Constitution v1.23.0.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Entity-centric / data_io consistency | ✅ PASS | No new models, no field changes → no `TableDescriptor` edits. Dynamic attributes searched through the shared `AttributeValue` path (R4) — no parallel attribute machinery. |
| II. Domain independence | ✅ PASS | `EntitySearchFilter` lives in `core/`; each domain viewset opts in via declared attributes only. No cross-domain imports. |
| III. Reference alignment | ✅ PASS | DRF filter-backend pattern, declarative opt-in — same shape as `EntityFilterBackend`/`NullsOrderingFilter`. |
| IV. API contract-driven frontend | ✅ PASS (existing deviation noted) | Schema gains `search` via `get_schema_operation_parameters`; `api-types.ts` regenerated (R12). Runtime param type goes on the hand-written `EntityListParams` — the services layer's hand-written types are a pre-existing recorded state, not widened by this feature. |
| V. Quality loop + backend TDD | ✅ PASS | `test_entity_search.py` written first (R13); full frontend loop incl. `pnpm build` (memory: stricter than typecheck). |
| VI. UI/UX reference | ✅ PASS | Standard AntD `Input` with `allowClear`; no same-content tooltips; no new empty-state surfaces. |
| VII. PageTable layout | ✅ PASS | Search is a custom control in `headerTitle` — exactly the rule's prescription; ProTable's built-in `search` prop stays unused. Toolbar-left CSS relaxed to allow stretch (R10) inside PageTable itself, not per-page. |
| VIII. i18n | ✅ PASS | New key(s) (`common.entityOps.searchPlaceholder`) land in `en-US` and `zh-TW` in the same change. |
| IX–XI (base currency, charts) | N/A | No monetary valuation or chart surfaces touched. |
| XII. Entity toolbar & sort | ✅ PASS | Apply-gate governs panels; the live search input is in the sanctioned direct-action class (R11) and stays outside panel mutual-exclusion. No `sorter` props, remount keys unchanged (search does NOT join remount keys — the input must keep focus while results update). Backend capability in `core/` via declared fields. |
| Delete confirmation | N/A | No destructive actions. |

**Post-Phase-1 re-check (2026-08-12)**: design artifacts introduce no violations; the `ViewConfig` exclusion (data-model §3) actively protects the 016-era invariants. **GATE PASSED.**

## Project Structure

### Documentation (this feature)

```text
specs/019-quick-search/
├── spec.md              # Feature specification (done)
├── plan.md              # This file
├── research.md          # Phase 0 — R1..R14
├── data-model.md        # Phase 1 — searchable-field matrix, transient state, invariants
├── quickstart.md        # Phase 1 — manual verification walkthrough
├── contracts/
│   └── search-api.md    # Phase 1 — the `search` param contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (done)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── core/
│   └── filters.py                      # + EntitySearchFilter (opt-in: searchable_fields, search_attribute_values)
├── finance/views.py                    # + searchable_fields on Currency/Account/ExchangeRate viewsets
├── inventory/views.py                  # + searchable_fields on Item/Acquisition/Scenario viewsets; Item: search_attribute_values
└── tests/
    └── test_entity_search.py           # NEW — TDD suite (unit + per-viewset integration)

apps/unihub/frontend/
├── src/hooks/
│   └── useDebouncedValue.ts            # NEW shared debounce hook (+ test)
├── src/components/
│   ├── HighlightText/                  # existing — gains SearchHighlightContext + SearchMark (+ tests)
│   ├── EntityToolbar/
│   │   ├── EntityToolbar.tsx           # + searchProps input after Columns; full-width row layout
│   │   ├── useEntityTable.ts           # + searchQuery/setSearchQuery/debounce → queryParams.search; offset reset
│   │   └── types.ts                    # EntityListParams + search?: string
│   ├── EntityViews/
│   │   ├── useViewTabsState.ts         # InternalTab + search?: string
│   │   └── useEntityViews.ts           # switchTab snapshot/restore; tab-creation init
│   ├── ItemDisplay/index.tsx           # ParameterTag gains highlight prop
│   └── PageTable/index.tsx             # toolbar-left CSS: flex none → 1 1 auto (R10)
├── src/pages/
│   ├── finance/currencies/index.tsx    # searchProps + provider + SearchMark renders   (+ page test)
│   ├── finance/accounts/index.tsx      # same                                          (+ page test)
│   ├── finance/exchange-rates/index.tsx# same                                          (+ page test)
│   ├── inventory/catalog/index.tsx     # same + flatMode |= searchActive + ItemDisplay highlight (+ page test)
│   └── inventory/scenarios/index.tsx   # same                                          (+ page test)
├── src/locales/{en-US,zh-TW}/pages.ts  # searchPlaceholder key, both locales
├── src/generated/api-types.ts          # regenerated (R12)
└── e2e/quick-search.spec.ts            # NEW — human-run
```

**Structure Decision**: Existing web-application layout (`apps/unihub/frontend` + `apps/unihub/backend`); the feature is additive inside the shared `core/` + `EntityToolbar`/`EntityViews` infrastructure with per-page adoption on the five entity list pages — the same shape as features 016/017.

## Complexity Tracking

No constitution violations to justify — table intentionally empty.

## Phase 2 planning input (for /speckit-tasks)

Suggested story mapping: US1 (P1) = backend `EntitySearchFilter` + viewset opt-ins + `useEntityTable`/toolbar/service wiring on all five pages (independently shippable: search works, view-scoped by construction); US2 (P2) = per-tab context (`InternalTab.search`, switchTab) + no-dirty/no-URL locks; US3 (P3) = `SearchHighlightContext`/`SearchMark` + ParameterTag highlight + per-page cell adoption; US4 (P3) = debounce hook + request-consolidation/stale-response tests (note: US1's wiring already routes through the debounced value — US4's tasks are the hook's own suite + SC-003 locks). Cross-cutting: i18n keys, schema regen, quickstart run, e2e spec.
