# Implementation Plan: Entity Views — Round 2

**Branch**: `016-entity-views` | **Date**: 2026-07-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-entity-views/spec.md` — Clarifications Session 2026-07-23 (round 2 on top of the shipped round-1 implementation; round-1 plan is in git history at commit 467beff)

## Summary

Round 2 refines the shipped Entity Views feature along eight clarified directives: (1) the standard view is renamed "Tabular" → **"Table"**; (2) the **default view becomes a plain view** — renamable, modifiable, savable (never deletable), with a page-provided initial name (catalog: **"YTD"**), materializing as a stored `EntityView` row (`is_default=True`) on first save/rename; (3) the **"+" button moves to the right of the rightmost tab** and stays always visible under overflow; (4) **double-click on a tab starts the edit-name flow**; (5) the packed `view[<tableKey>]` URL mini-format is replaced by a **human-readable per-facet query grammar** (`<tableKey>.view/f/sort/cols/size/page`), which also switches pin capture to **per-column pins** (resolving the round-1 boolean-pair projection); (6) saved views join **data_io export/import and git sync** by generalizing the registry with an owner-stamping mechanism (owner column excluded from CSV; `request.user` stamped at import — resolving the recorded Principle-I deferral); (7) the view row **auto-hides** when only the default view exists, with a compact reveal affordance that carries the dirty indicator.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend), Python 3.12 (backend)

**Primary Dependencies**: React 18.3, Ant Design 5.24 + Pro Components 2.8, TanStack React Query 5, React Router 7 (library mode), react-intl; Django 5.x, DRF 3.x, drf-spectacular

**Storage**: PostgreSQL 16 — `core.EntityView` gains `is_default` (migration 0006, incl. config data-migration to per-column pins); `sessionStorage` (`unihub.views.<tableKey>`) gains the `revealed` flag; URL query string carries the new readable per-facet params

**Testing**: Vitest + RTL (serialization rewrite, useEntityViews default/rename/auto-hide behavior, ViewTabs layout), Playwright e2e (`entity-views.spec.ts` — "+" geometry, readable deep-links, reveal flow), pytest-django (is_default lifecycle, delete guard, data_io/sync round trip — TDD red-green)

**Target Platform**: Desktop/tablet web browsers (mobile out of scope per constitution)

**Project Type**: Web application — Django backend + React SPA frontend under `apps/unihub/`

**Performance Goals**: No change from round 1 — tab switch without extra round-trips; saved-view list ≤ 1 query per table per load; sync publish/checkout adds one small CSV table

**Constraints**: URL must stay the single source of truth for active view state; readable serialization must round-trip every facet (per-column pins included); data_io registration must produce ZERO phantom diffs across deployments (owner never serialized); staged mutations rule (manage modal commits on Save only); `strict: true` TS, zero ESLint warnings

**Scale/Scope**: Single-user hub; same 5 adopted pages (tableKeys unchanged); tens of views per table; round-1 stored configs must migrate losslessly

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Entity-centric + data_io | ✅ PASS — **deferral RESOLVED** | This round registers `core.entityview` with data_io via a new registry capability (`owner_field` stamping — R20): the owner column is excluded from CSV and stamped from the acting user on import, exactly matching FR-024. The deferral comment in `core/apps.py` is replaced by the registration in the same change. `is_default` field addition updates the descriptor in the same change (Principle I schema-sync rule). |
| II | Domain independence | ✅ PASS | All changes in `core/`, `data_io/`, `sync/` (shared infra) and the shared frontend `components/EntityViews/`. No domain-to-domain imports; the registry extension is generic (any future per-user model can use `owner_field`). |
| III | Reference alignment | ✅ PASS | Standard DRF patterns (partial unique constraint, serializer guards); AntD components throughout; no new libraries. |
| IV | API contract-driven | ✅ PASS (pre-existing deviation unchanged) | `is_default` lands in serializer → schema regenerated (spectacular file route, established in 018) → `pnpm generate-types`. Service types stay hand-written per repo-wide precedent (not widened). |
| V | Quality loop + TDD | ✅ PASS | Backend first: extend `test_entity_views.py` (is_default lifecycle, delete guard) + new data_io/sync round-trip tests on the `bare_repo` fixture — written red first. Frontend: serialization unit suite rewritten against the new grammar before the module; RTL for rename/auto-hide/default materialization. |
| VI | UI/UX (ov-fleet) | ✅ PASS | Double-click inline rename commits on Enter/blur, cancels on Esc; collision surfaces a translated error. Reveal affordance is truncation/tooltip-compliant and shows the dirty dot (SC-005 preserved while hidden). Delete confirmations unchanged (`Modal.confirm`, `okType: 'danger'`). All new strings in BOTH locales (ICU plurals where counted). |
| VII | PageTable layout | ✅ PASS | The `viewBar` slot is reused; collapsed (auto-hidden) mode renders the compact affordance inside the same slot — `PageTable` still owns the structure; no page re-implements the row. |
| VIII | i18n | ✅ PASS | "Table" default-tab key updated in en-US + zh-TW same commit; new keys for rename errors, reveal tooltip. Page-provided default names ("YTD") are view data, not UI chrome — stored verbatim once materialized. |
| IX–XI | Currency / charts | N/A | Not touched. |
| XII | Entity toolbar patterns | ✅ PASS | Apply-gate, remount keys (`panelApplyCount` + `pinFingerprint` + active tab id) unchanged. Per-column pins in `ViewConfig` now mirror `ColumnDef.pin` 1:1 — the round-1 projection (and its multi-pin loss) is removed, aligning views with constitution v1.23.0's per-column pin model. |
| — | Dev constraints | ✅ PASS | pnpm/uv only; session auth; delete gates honored; desktop-first. |

**Initial gate result**: PASS — no violations to justify. Re-checked after Phase 1 design: still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/016-entity-views/
├── spec.md              # + Clarifications Session 2026-07-23 (round 2)
├── plan.md              # This file (round 2; round-1 plan in git history)
├── research.md          # + R14–R21 (round-2 decisions)
├── data-model.md        # Updated: ViewConfig v2, is_default, revealed flag, URL grammar v2
├── quickstart.md        # + round-2 manual walk-through
├── contracts/
│   ├── entity-views-api.md       # Updated: is_default, delete guard, data_io/sync contract
│   └── view-url-serialization.md # REWRITTEN: readable per-facet grammar
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── core/
│   ├── models.py                # EntityView + is_default (partial unique constraint)
│   ├── serializers.py           # + is_default (create-only), guards
│   ├── views.py                 # + destroy guard for is_default
│   ├── apps.py                  # deferral comment REPLACED by data_io registration
│   └── migrations/0006_*.py     # is_default + config data-migration (sticky pair → per-column pins)
├── data_io/
│   ├── registry.py              # + TableDescriptor.owner_field
│   ├── services/csv_exporter.py # skip owner_field column on export
│   ├── services/csv_importer.py # owner_field column not expected/validated
│   └── services/change_preview.py # stamp acting_user into owner_field on materialize
├── sync/
│   ├── views.py                 # thread request.user into apply calls
│   └── services/apply_helper.py # import_from_clone/apply_selected accept acting_user
└── tests/
    ├── test_entity_views.py     # + is_default lifecycle, delete guard (TDD)
    └── test_entity_views_io.py  # NEW — data_io export shape + sync round-trip owner stamping

apps/unihub/frontend/src/
├── components/EntityViews/
│   ├── serialization.ts         # REWRITTEN — readable grammar (parse/serialize per facet)
│   ├── useEntityViews.ts        # default materialization, name-ref resolution, auto-hide state
│   ├── useViewTabsState.ts      # + revealed flag
│   ├── ViewTabs.tsx             # "+" right of last tab (always visible); collapsed affordance; dbl-click inline rename
│   ├── ManageViewsModal.tsx     # default row: rename/pin enabled, delete/drag disabled
│   ├── SaveViewModal.tsx        # reused for anonymous dbl-click name-and-save
│   └── *.test.ts(x)             # suites updated/rewritten
├── components/EntityToolbar/hooks/useEntityTable.ts  # + defaultViewName pass-through
├── services/unihub-backend/core.ts  # + is_default on EntityView type
├── locales/en-US/pages.ts       # "Table", rename/reveal keys
├── locales/zh-TW/pages.ts       # 「表格」+ same keys
└── pages/inventory/catalog/index.tsx # defaultViewName="YTD"

apps/unihub/frontend/e2e/
└── entity-views.spec.ts         # + "+"-placement geometry, readable deep-link, reveal flow
```

**Structure Decision**: Same layered structure as round 1 — backend `core/` owns the model, `data_io`/`sync` gain one generic capability each (no EntityView-specific code outside `core/`), frontend changes stay inside `components/EntityViews/` plus one-line page wiring (`defaultViewName`).

## Complexity Tracking

> No constitution violations — table intentionally empty.
