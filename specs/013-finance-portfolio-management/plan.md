# Implementation Plan: Finance Portfolio Management — Iteration 2 (Portfolio Navigation & Detail Panel)

**Branch**: `013-finance-portfolio-management` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-finance-portfolio-management/spec.md`, Clarifications Session 2026-07-20

> Iteration 2 builds on the accepted base implementation (Asset/Portfolio/Transaction/Transfer
> CRUD + portfolio detail page hosting the Transactions table). The base plan is preserved in
> git history (`1f61a2c`). This iteration is **frontend-only**.

## Summary

Bring the Portfolios list and portfolio detail page into compliance with constitution
v1.24.0 and the 2026-07-20 clarifications:

1. **Portfolios list** — the Name cell and the row's View action become real hyperlinks to
   `/finance/portfolios/:id` (middle-click / Ctrl+Click opens a tab); the row-level Edit and
   Delete buttons are removed.
2. **Portfolio detail page** — the ad-hoc arrow back-link is replaced by a constitution
   breadcrumb (Portfolios → portfolio name); the untitled info ProCard becomes a Card titled
   "Portfolio" whose header carries the entity actions via the shared `PanelHeaderActions`
   (Edit visible, Delete in the kebab). Delete confirms, then navigates back to the list.

No backend, schema, or API contract changes.

## Technical Context

**Language/Version**: TypeScript 5.7 / React 18.3 (frontend only — no backend changes)

**Primary Dependencies**: Ant Design 5.24, @ant-design/pro-components 2.8, TanStack React
Query 5, React Router 7, Vitest + React Testing Library

**Storage**: N/A (no data-model change)

**Testing**: Vitest + React Testing Library; TDD per Principle V — component tests first

**Target Platform**: Desktop/tablet browser

**Project Type**: Web application (React SPA)

**Performance Goals / Constraints / Scale**: unchanged from base plan

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I / II / III / IV | ✅ N/A–PASS | Frontend-only UI iteration; no entity, domain, or API contract changes. |
| V — Quality Loop | ✅ PASS | Tests first (list link rendering, actions removal, breadcrumb, panel actions, delete-navigate flow); full frontend loop + `pnpm build` before commit. |
| VI — UX Reference | ✅ PASS | **This iteration exists to enforce VI**: "Hyperlinked row identifiers & actions" (v1.24.0) on the list; "Standalone-page navigation (no Cancel)" breadcrumb and "Panel-header actions (responsive kebab)" on the detail page. |
| VII — PageTable | ✅ PASS | List keeps PageTable; only column/action content changes. |
| VIII — i18n | ✅ PASS | New keys (panel title, kebab aria label) added to both en-US and zh-TW in the same commit; breadcrumb reuses existing title keys; ICU plurals unaffected. |
| IX–XI | ✅ N/A | No charts; no valuation changes. |
| XII — Entity Toolbar | ✅ PASS | Toolbar/sort/filter untouched. |
| Delete Confirmation | ✅ PASS | Detail-page Delete uses `Modal.confirm` with `okType: 'danger'` + locale keys (moved, not weakened). |

**Post-design re-check**: PASS — no violations introduced; no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/013-finance-portfolio-management/
├── plan.md              # This file (iteration 2)
├── research.md          # Iteration 2 decisions (pattern reuse)
├── data-model.md        # UNCHANGED (base) — no schema changes this iteration
├── contracts/api.md     # UNCHANGED (base) — no API changes this iteration
├── quickstart.md        # UNCHANGED (base)
└── tasks.md             # /speckit-tasks output (iteration 2)
```

### Source Code (files touched this iteration)

```text
apps/unihub/frontend/src/
├── pages/finance/portfolios/
│   ├── index.tsx        # Name + View as real links; REMOVE row Edit/Delete + modal-edit state
│   └── detail.tsx       # Breadcrumb; "Portfolio" Card + PanelHeaderActions; Edit modal; Delete→navigate
├── locales/en-US/pages.ts   # ADD pages.finance.portfolios.detail.* keys
└── locales/zh-TW/pages.ts   # ADD same keys
```

## Phase 0: Research → [research.md](research.md)

All three interaction patterns already exist in the codebase; decisions are documented in
research.md (row-link Button pattern from inventory catalog iter-19, `PanelHeaderActions`
shared component, balance-sheets breadcrumb pattern, `useContainerWidth` narrowness hook).
No NEEDS CLARIFICATION remain.

## Phase 1: Design

- **data-model.md / contracts**: unchanged — no entities or endpoints touched.
- **UI contract** (from spec US2 scenarios 3, 7, 10–12):
  - List Name cell: anchor (`href=/finance/portfolios/:id`) with modifier-click guard;
    plain click = SPA navigate.
  - List View action: AntD `Button` with `href` + same guard (catalog iter-19 pattern).
  - List rows: no Edit, no Delete, no modal-edit state left behind (`PortfolioFormModal`
    stays only for Create on the list page).
  - Detail breadcrumb: `Breadcrumb` items `[Portfolios (href + navigate guard), <name>]`
    (balance-sheets detail pattern); the `ArrowLeftOutlined` back-link is removed.
  - Detail "Portfolio" panel: AntD `Card title=t(pages.finance.portfolios.detail.panelTitle)`
    with `extra=<PanelHeaderActions narrow={isNarrow} visible=[Edit] advanced=[Delete]>`;
    `useContainerWidth(720)` supplies `isNarrow`; Edit opens the existing portfolio form
    modal (staged mutations — no API call before Save); Delete = `Modal.confirm`
    (`okType: 'danger'`), on success `message.success` + `navigate('/finance/portfolios')`;
    FR-010 dependency errors surface via the standard error path.
- **Agent context**: CLAUDE.md Active Feature section updated to describe iteration 2.
