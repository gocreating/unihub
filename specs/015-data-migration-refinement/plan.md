# Implementation Plan: Data Migration Refinement

**Branch**: `015-data-migration-refinement` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-data-migration-refinement/spec.md`

## Summary

Fix the P1 sync-preview trust bug (mass phantom `inventory.item` deletions) by making
the server-side git clone a disposable cache — every sync operation fetches and
hard-resets to the remote head before diffing the **complete, unfiltered** DB export —
and by pinning every confirm to its preview via `base_commit` + `diff_digest`
(reproduction-first TDD on the existing `bare_repo` fixture). Bring the change-preview
tables into constitution footer compliance (size selector left of pagination, controls
right). Then rebuild the Sync tab's interaction model: a `GET /sync/history/` commit
graph (custom React commit-rail; force-push/rewritten-history detection via a stored
`last_known_remote_commit`), row-level staging on all previews (transient `excluded[]`
+ digest; partial publish = base rows + staged ops; selective topo-ordered apply with
registry-FK dependency auto-include), and commit-node interactions (checkout preview/
confirm of any compatible commit — header-validation compatibility gating) replacing
the four legacy action buttons. Full decisions in [research.md](research.md).

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 / React 18.3 (frontend)

**Primary Dependencies**: Django 5 + DRF 3 + drf-spectacular; git via `subprocess`
(existing `GitSyncService` pattern); Ant Design 5.24 + TanStack React Query 5 + react-intl.
**No new dependencies** — the commit graph is a custom lightweight component (R3).

**Storage**: PostgreSQL 16 (one additive `sync` migration: `SyncConfig.local_state_commit`,
`SyncConfig.last_known_remote_commit`); git repository snapshots as per-table CSVs
(existing format, unchanged).

**Testing**: pytest-django with the existing `tests/sync/conftest.py` `bare_repo`
fixture (local bare repo, `file://` transport, no network); Vitest + RTL frontend.

**Target Platform**: Linux server (Docker) + desktop browser SPA (mobile out of scope v1).

**Project Type**: web application (single Django backend + single React SPA).

**Performance Goals**: Sync tab interactive < 10 s including history fetch (SC-004);
history paged at 50 commits/page; previews over the full dataset (~20 tables, ~5k rows)
complete in seconds as today — the fetch+reset adds one network round-trip only.

**Constraints**: Sync path MUST remain filter-free (FR-001) and domain-generic
(no inventory special-casing — constitution Principle II); PAT never logged/serialized;
remote history never rewritten except by explicit force-publish (FR-020); all UI
strings en-US + zh-TW with ICU plurals.

**Scale/Scope**: single-user personal hub; ~20 registered tables, low-thousands of
rows, hundreds of sync commits.

## Constitution Check

*GATE evaluated pre-Phase 0 and re-evaluated post-Phase 1 design — PASS (no violations).*

| Principle | Assessment |
|---|---|
| I — Entity-centric + data_io consistency | No new domain models/attributes. `SyncConfig` gains two fields; `sync.syncconfig` stays deliberately unregistered in data_io (credentials must not round-trip through CSV) — existing, explicitly recorded precedent ([data-model.md](data-model.md)). Selective apply reuses the shared `AttributeValue` upsert path. |
| II — Domain independence | Bug fix, staging, dependency closure, and compatibility checks operate on registry metadata (`TableDescriptor`, `fk_content_type_label`, topo order) only — zero domain-specific logic. |
| III — Reference alignment | DRF `APIView`s in the existing `sync` app; subprocess-git per existing service pattern; AntD + React Query frontend. No deviations introduced. |
| IV — Contract-driven frontend | All endpoint changes land with drf-spectacular annotations → `openapi.yaml` regenerated → frontend types regenerated before UI work. |
| V — Quality loop + TDD | Reproduction test written and failing before the P1 fix; every new endpoint gets happy+error pytest coverage; both quality loops (plus `pnpm build`) green per phase. |
| VI/VIII — UI reference, layout & i18n | Preview footers brought INTO compliance (US2). `ChangePreviewTable`'s documented antd-Table (non-PageTable) deviation is pre-existing and retained. New strings in both locales, ICU plurals for counts. Graph is an interactive control surface, not a chart — ECharts principle (finance visualizations) not triggered. |
| Filtering/pagination in `core/` | Untouched — sync deliberately bypasses entity filtering (that is the point of FR-001). |

## Project Structure

### Documentation (this feature)

```text
specs/015-data-migration-refinement/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R8
├── data-model.md        # Phase 1 — SyncConfig fields + API shapes
├── quickstart.md        # Phase 1 — dev loop + manual verification
├── contracts/
│   └── sync-api.md      # Phase 1 — endpoint contracts
└── tasks.md             # Phase 2 (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── sync/
│   ├── models.py                  # + local_state_commit, last_known_remote_commit
│   ├── migrations/                # + 000X additive migration
│   ├── serializers.py             # history/preview/confirm serializers (spectacular-annotated)
│   ├── views.py                   # + HistoryView, CheckoutPreviewView, CheckoutConfirmView;
│   │                              #   publish/preview/force gain pinning+staging; apply views removed
│   ├── urls.py                    # route changes
│   └── services/
│       ├── git_service.py         # fetch+hard-reset base, history log, ancestor checks
│       ├── publish_helper.py      # remote-head-based preview, digest, hybrid-CSV partial publish
│       └── apply_helper.py        # sha-parameterized preview, selective apply + dependency closure
├── data_io/services/
│   ├── change_preview.py          # selective apply entry (staged ChangeRecords, topo order)
│   └── csv_importer.py            # header-validation reused for commit compatibility
└── tests/sync/                    # reproduction trio, pinning, history, compatibility,
                                   # partial publish, selective apply, checkout round-trip

apps/unihub/frontend/src/
├── pages/io/SyncTab/
│   ├── index.tsx                  # graph-driven layout; legacy buttons removed
│   ├── CommitGraph.tsx            # NEW — commit rail (nodes, badges, disabled+tooltip, banner)
│   └── __tests__/                 # RTL suites
├── components/ImportExport/
│   ├── ChangePreviewTable.tsx     # rowSelection staging + ClientPaginationFooter
│   └── ClientPaginationFooter.tsx # NEW — constitution-layout client-side footer
├── services/unihub-backend/sync.ts# history/checkout calls; apply calls removed; regenerated types
└── locales/                       # en-US + zh-TW additions (ICU plurals)
```

**Structure Decision**: web-app split as above — all backend work inside the existing
`sync` app plus shared `data_io` services; all frontend work inside the existing
`pages/io/SyncTab` and shared `components/ImportExport`, matching the monorepo layout.

## Phase 0 — Research

Complete — [research.md](research.md): R1 bug hypotheses (stale-clone base leading) +
fix architecture (fetch+reset, digest pinning, reproduction-first), R2 footer approach,
R3 history endpoint + custom graph component, R4 local-state/force-push markers,
R5 staging model + partial publish/selective apply + dependency closure, R6 checkout +
compatibility gating, R7 API surface, R8 test strategy. No NEEDS CLARIFICATION remain.

## Phase 1 — Design

Complete — [data-model.md](data-model.md) (SyncConfig extension, API shapes, state
transitions, validation rules), [contracts/sync-api.md](contracts/sync-api.md) (full
endpoint contracts incl. removals), [quickstart.md](quickstart.md) (dev loop, manual
verification script, definition of done). Agent context (CLAUDE.md SPECKIT block)
updated to point at this plan.

## Phase 2 — Tasks

Produced by `/speckit-tasks` into [tasks.md](tasks.md). Suggested story order follows
spec priorities: US1 (P1 bug + pinning) → US2 (footer) → US3 (history + graph) →
US4 (staging) → US5 (node interactions + checkout + legacy-button removal), each story
landing test-first and leaving the app releasable.
