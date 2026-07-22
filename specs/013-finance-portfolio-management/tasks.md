# Tasks: Finance Portfolio Management — Iteration 2 (Portfolio Navigation & Detail Panel)

**Input**: [plan.md](plan.md) (iteration 2), [spec.md](spec.md) Clarifications Session 2026-07-20
**Scope**: Frontend-only. All work maps to **User Story 2 (Manage Portfolios)** — scenarios 3, 7, 10–12 / FR-013–FR-015. TDD per Principle V: test tasks MUST be written and failing before their implementation tasks.

## Phase 1: Setup

*(none — no new dependencies, hooks, or shared components; `PanelHeaderActions`, `useContainerWidth`, breadcrumb pattern, and href-Button pattern already exist)*

## Phase 2: Foundational

- [X] T001 [P] Add `pages.finance.portfolios.detail.*` locale keys (panel title "Portfolio", kebab aria label, delete confirm title/body reused or added as needed) to apps/unihub/frontend/src/locales/en-US/pages.ts
- [X] T002 [P] Add the same keys with Traditional Chinese values to apps/unihub/frontend/src/locales/zh-TW/pages.ts (same commit as T001 — Principle VIII)

## Phase 3: User Story 2 — Manage Portfolios (P2)

**Goal**: Constitution-v1.24.0-compliant navigation from the Portfolios list, and a detail page that owns the entity's Edit/Delete via a "Portfolio" panel.

**Independent test**: From the Portfolios list, middle-click Name → detail opens in new tab; list rows show no Edit/Delete; on detail, breadcrumb reads Portfolios → name; panel header Edit opens the form modal; kebab → Delete → confirm returns to the list.

### Tests first (MUST fail before implementation)

- [X] T003 [P] [US2] Create apps/unihub/frontend/src/pages/finance/portfolios/PortfoliosPage.test.tsx: assert (a) Name cell renders an anchor with `href="/finance/portfolios/<id>"`; (b) View action renders as an anchor/`Button href` with the same href; (c) plain click SPA-navigates while ctrl/meta-click does NOT call preventDefault (guard pattern); (d) row contains NO Edit button and NO Delete button; (e) Create button and toolbar unaffected
- [X] T004 [P] [US2] Create apps/unihub/frontend/src/pages/finance/portfolios/PortfolioDetailPage.test.tsx: assert (a) breadcrumb shows Portfolios → portfolio name, Portfolios crumb has `href="/finance/portfolios"` and navigates on click; (b) NO ArrowLeft back-link remains; (c) a Card titled with the `pages.finance.portfolios.detail.panelTitle` message shows name, base currency (Tag), state, first/last transaction time fields; (d) header shows visible Edit button and kebab whose menu contains Delete (danger); (e) Edit opens the portfolio form modal prefilled; (f) kebab → Delete shows `Modal.confirm`, on confirm calls the delete service and navigates to `/finance/portfolios`; (g) delete-blocked (FR-010) error path shows `message.error` and does NOT navigate

### Implementation

- [X] T005 [US2] Update apps/unihub/frontend/src/pages/finance/portfolios/index.tsx: Name cell → real anchor (href + metaKey/ctrlKey guard + SPA navigate); View action Button gains `href` + guard (catalog iter-19 pattern); REMOVE row Edit/Delete actions, `openEdit`/`editingPortfolio` state, and delete confirm from the list (keep `PortfolioFormModal` solely for Create); remove now-unused imports/icons
- [X] T006 [US2] Update apps/unihub/frontend/src/pages/finance/portfolios/detail.tsx: replace arrow back-link with `Breadcrumb` (balance-sheets detail pattern); wrap portfolio info in `Card title={t('pages.finance.portfolios.detail.panelTitle')}` with `extra=<PanelHeaderActions narrow={isNarrow} visible=[Edit] advanced=[Delete] kebabLabel="portfolio-actions">`; `useContainerWidth(720)` for narrowness; Edit opens `PortfolioFormModal` (staged mutations — no API call before Save); Delete → `Modal.confirm` (`okType: 'danger'`, locale keys) → delete mutation → `message.success` + `navigate('/finance/portfolios')`; FR-010 error → `message.error`, stay on page

## Phase 4: Polish & Cross-Cutting

- [X] T007 Run the full frontend quality loop from apps/unihub/frontend/: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — zero warnings, all green (Principle V + build-in-quality-loop)
- [X] T008 Verify en-US/zh-TW key parity for all keys added in T001/T002 and that no now-orphaned `pages.finance.portfolios.*` keys remain referenced (grep both locale files vs usages)

## Dependencies

- T001/T002 (locale keys) → parallel; needed by T003–T006 assertions on message keys
- T003 ∥ T004 (different files) → each MUST be red before its implementation task
- T003 → T005; T004 → T006 (T005 ∥ T006 possible — different files — after both tests exist)
- T007, T008 last

## Implementation Strategy

Single-story iteration — MVP = the whole of Phase 3. Suggested order: T001+T002 together → T003+T004 in parallel (both failing) → T005+T006 → T007+T008. One commit at the end (docs commit for spec/plan/tasks happens separately before implementation per the session pipeline).
