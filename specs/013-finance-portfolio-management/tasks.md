# Tasks: Finance Portfolio Management — Iteration 6 (PnL, holdings, header defect)

**Input**: spec.md Clarifications 2026-08-16b (FR-030…FR-036, SC-014…SC-017), research.md I6-1…I6-4, plan.md iteration-6 section, constitution v1.26.0.

**Tests**: TDD red-first. No migration — the new API fields are query annotations.

**Paths**: `apps/unihub/frontend/` unless prefixed `backend/`.

## Phase 1: The empty-header defect (FR-030) — smallest change, most visible

- [X] T301 Write a failing guard test in `src/pages/finance/portfolios/PortfolioDetailPage.test.tsx`: every Transactions-panel header is non-empty EXCEPT the caret control column (live page currently renders 6 of 8 blank)
- [X] T302 Give `description`, `asset`, `asset_change`, `value_change` and `remark` explicit `title`s in `src/pages/finance/portfolios/detail.tsx`; T301 passes

## Phase 2: Backend aggregates + holdings (FR-031, FR-034)

- [X] T303 Write failing tests in `backend/tests/finance/test_portfolios.py`: the portfolio API returns `value_invested`, `value_returned`, `net_value_change` summed over ALL transfers (build >25 transactions so a page-sized sum would be wrong); a portfolio with no transfers returns null for each, NOT zero; `ordering=net_value_change` sorts (SC-015)
- [X] T304 Annotate the three sums in `PortfolioViewSet.get_queryset()` and expose them read-only on both Portfolio serializers; add `net_value_change` to `ordering_fields` (research I6-1)
- [X] T305 Write failing tests for `GET /portfolios/{id}/holdings/`: per-asset net quantity across all transfers; assets whose net is zero are omitted; **a 2:1 split recorded as a position-only transfer doubles the holding and leaves the aggregates unchanged** (SC-017, FR-035)
- [X] T306 Implement the `holdings` action per research I6-3; T305 passes
- [X] T307 Regenerate `openapi.yaml` + `src/generated/api-types.ts`; extend the frontend `Portfolio` type and add a `getPortfolioHoldings` service call

## Phase 3: PnL presentation (FR-032, FR-033)

- [X] T308 Write failing tests: a CLOSED portfolio's panel shows one "Realized PnL" figure; an OPEN one shows Invested / Returned / Net invested + holdings and **contains no element whose text includes "PnL"** (the vocabulary is the requirement); a portfolio with no transfers shows `<EmptyValue />` rather than 0
- [X] T309 Implement the PnL panel on `detail.tsx` (Descriptions, per-state content, the no-price-feed note); locale keys in BOTH files
- [X] T310 Write failing tests then add the Portfolios list PnL column: shows the net figure with the row's own currency, marks open vs closed, sortable via `net_value_change`; never renders a cross-currency total (FR-033)

## Phase 4: Edit modal cleanup (FR-036)

- [X] T311 Update `PortfolioFormModal` tests: edit mode offers Name and Description only — no State select, no Base Currency input — while base currency remains VISIBLE read-only; a separate test keeps Close/Reopen working as the state path
- [X] T312 Remove the State and Base Currency form items from edit mode in `PortfolioFormModal.tsx`; keep them in create mode where base currency is chosen once

## Phase 5: Polish & verification

- [X] T313 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; backend `uv run ruff check . && uv run pytest`
- [X] T314 Real-data verification after rebuilding + force-recreating the containers: Transactions headers all populated; `永豐 DCA TW.00918` reports invested −474,391 / returned 0 / net −474,391 matching a direct SQL sum, with the word PnL absent from that page; a closed portfolio shows Realized PnL; holdings list non-empty

## Dependencies

- Phase 1 is independent — land it first.
- T303–T304 block T310 (the list column reads the annotation); T305–T307 block T309's holdings line.
- Phase 3 and Phase 4 both touch portfolio UI files; run Phase 3 then Phase 4.
- Phase 5 last.

**Total: 14 tasks** (Header 2, Backend 5, PnL 3, Modal 2, Polish 2)

---

# Archive — Iterations 1–5 (complete)

- **Iteration 3** (2026-08-13/14, 26 tasks): legacy CSV import (38 assets / 55 portfolios / 359 transactions / 837 transfers, run against real data 2026-08-14), the transactions-list 500 fix, migration 0012 (18-decimal amounts, `Portfolio.description`, `Transaction.chain_id`/`tx_hash`, `Transfer.remark`, `Asset.category` dropped), and entity-views / quick-search / shared-confirm-dialog adoption. Commits `39478fa`, `a09ef48`.
- **Iteration 5** (2026-08-16, 28 tasks): constitution v1.26.0 — PageTable took ownership of column sizing (`autoWidth`, eleven pages converted, 81 call sites removed), `ClampedText` two-line cells, `Portfolio.description` → TextField (migration 0013), closed-portfolio freeze enforced server-side, description hidden by default, footer counts, and the waterfall + breakdown charts. Verified 7/7 UI and 8/8 API. Commits `0ccca3d`, `f264092`, `16b2b0c`, `253c3d7`, `368e95f`.
- **Iteration 4** (2026-08-15, 19 tasks): constitution v1.25.0 whole-row navigation with the shared `useRowLink` helper, View buttons removed system-wide, portfolio panel converted to responsive `Descriptions`, Close/Reopen moved to the panel header, and the Transactions panel rebuilt as a catalog-style tree table with Decimal-summed parent summaries. Verified 14/14 against real data. Commits `c6db24b`, `e26758b`, `9e714ee`, `c8916e2`.
