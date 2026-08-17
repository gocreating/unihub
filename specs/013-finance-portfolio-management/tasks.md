# Tasks: Finance Portfolio Management — Iteration 7 (Transfer redesign, charts, modal)

**Input**: spec.md Clarifications 2026-08-16c (FR-037…FR-045, SC-018…SC-022), research.md I7-1…I7-4, plan.md iteration-7 section, constitution v1.26.0.

**Tests**: TDD red-first. **This iteration rewrites real financial rows — snapshot before migrating.**

**Paths**: `apps/unihub/frontend/` unless prefixed `backend/`.

## Phase 1: Transfer model redesign (FR-037, FR-039) — foundation

- [ ] T401 Write failing model/API tests in `backend/tests/finance/test_transactions.py`: a transfer accepts `pnl_change` + `currency`/`currency_amount` (cash leg) OR `pnl_change` + `asset`/`asset_change_amount` (position leg); BOTH set → rejected; NEITHER set → rejected; `pnl_change` alone → rejected; `remark` no longer exists in the payload (FR-037, SC-019, SC-020)
- [ ] T402 Redesign `Transfer` in `backend/finance/models.py`: add `currency` FK + `currency_amount`, rename `value_change` → `pnl_change`, make `asset`/`asset_change_amount` nullable, drop `remark`; add the exactly-one `CheckConstraint`
- [ ] T403 Write the data migration (0014): convert transfers whose asset is a settleable legacy currency into currency legs (currency set, quantity moved to `currency_amount`, asset cleared, `pnl_change` untouched), then delete the now-unreferenced currency Assets, then add the constraint. Test asserts the total `pnl_change` is identical before and after (SC-019)
- [ ] T404 Update `TransferSerializer` (fields, validation) and every `value_change` reference: `PortfolioViewSet` annotations, `searchable_fields`, holdings action; update the `data_io` TableDescriptor for `finance.transfer` (Principle I)

## Phase 2: Keep currencies out of Assets (FR-038)

- [ ] T405 Write failing tests: creating or renaming an Asset whose name or symbol matches a Currency code or name is rejected (`新台幣`, `TWD`, `美元`, `USD`); an unrelated name is accepted
- [ ] T406 Implement the validation in `AssetSerializer`; T405 passes
- [ ] T407 Update `import_legacy_finance` so `is_settleable` legacy assets become **currency legs** and are never created as Assets; extend the synthetic-fixture suite to prove a re-run cannot reintroduce them
- [ ] T408 Regenerate `openapi.yaml` + `src/generated/api-types.ts`; update the frontend `Transfer`/`TransferInput` types (`pnl_change`, `currency`, `currency_amount`, no `remark`)

## Phase 3: Transaction table (FR-044)

- [ ] T409 Write failing tests: column order is Time, PnL, Position, Description; no Remark column; a transaction row shows an accumulated PnL with a currency symbol and per-asset accumulated Position; a transfer row shows only its own signed change (`+123 0050.TW`) (SC-022)
- [ ] T410 Rework the columns in `src/pages/finance/portfolios/detail.tsx` accordingly, using `getCurrencySymbol` for symbols and `Decimal` for the running totals

## Phase 4: Merged PnL / Trend panel (FR-040…FR-043)

- [ ] T411 Write failing tests for the merged panel: ONE Card with `PnL` and `Trend` tabs (the separate value and chart panels are gone); the PnL tab is a line series whose last point equals the portfolio's realized/net PnL; the Trend tab has cost/income/position series in red/green/grey with negative values plotted as negatives; the Waterfall toggle changes the series shape (SC-021)
- [ ] T412 Rewrite `portfolioChartData.ts`: `pnlLineSeries()`, `trendSeries(mode)` with the three categories per transaction, and the semantic palette constants
- [ ] T413 Replace `PortfolioCharts.tsx` + `PortfolioPnlPanel.tsx` with the single merged panel; keep the realized/net vocabulary from FR-032 and the no-price-feed note; locale keys in BOTH files

## Phase 5: Transaction modal (FR-045)

- [ ] T414 Write failing tests: the modal footer places the primary action right with others grouped left (Cancel left-most); the body has General and Transfers tabs; transfer rows render as a table (no horizontal overflow); "Add transfer" is a link/text-style button
- [ ] T415 Rework the modal in `detail.tsx`: custom footer matching the shared dialog's shape, `Tabs` for General/Transfers, transfer rows as a `Table`/`ProTable` with the currency-or-asset choice per row, and `type="link"` for Add transfer

## Phase 6: Polish & verification

- [ ] T416 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; backend `uv run ruff check . && uv run pytest`
- [ ] T417 **Snapshot the real database** (`pg_dump`), rebuild + force-recreate the containers so migration 0014 runs, then verify: assets 40 → 38 with no 新台幣/美元; every transfer satisfies exactly-one; total `pnl_change` unchanged versus the snapshot; the table, merged panel and modal all render (SC-018, SC-019)

## Dependencies

- Phase 1 blocks everything (all reads change).
- T405–T407 are independent of the UI phases; T408 gates Phases 3–5.
- Phase 3, 4 and 5 all edit `detail.tsx` — run them in order, not in parallel.
- Phase 6 last; T417 needs the snapshot taken first.

**Total: 17 tasks** (Model 4, Guards 4, Table 2, Panel 3, Modal 2, Polish 2)

---

# Archive — Iterations 1–6 (complete)

- **Iteration 6** (2026-08-16, 14 tasks): fixed the empty Transactions headers (6 of 8 blank, introduced in iteration 4), backend value aggregates + holdings endpoint, the realized/net PnL panel and list column, and removal of State/Base Currency from the edit modal. Verified 13/13. Commits `6d25c61`, `513c61b`, `7032818`.
- **Iteration 3** (2026-08-13/14, 26 tasks): legacy CSV import (38 assets / 55 portfolios / 359 transactions / 837 transfers, run against real data 2026-08-14), the transactions-list 500 fix, migration 0012 (18-decimal amounts, `Portfolio.description`, `Transaction.chain_id`/`tx_hash`, `Transfer.remark`, `Asset.category` dropped), and entity-views / quick-search / shared-confirm-dialog adoption. Commits `39478fa`, `a09ef48`.
- **Iteration 5** (2026-08-16, 28 tasks): constitution v1.26.0 — PageTable took ownership of column sizing (`autoWidth`, eleven pages converted, 81 call sites removed), `ClampedText` two-line cells, `Portfolio.description` → TextField (migration 0013), closed-portfolio freeze enforced server-side, description hidden by default, footer counts, and the waterfall + breakdown charts. Verified 7/7 UI and 8/8 API. Commits `0ccca3d`, `f264092`, `16b2b0c`, `253c3d7`, `368e95f`.
- **Iteration 4** (2026-08-15, 19 tasks): constitution v1.25.0 whole-row navigation with the shared `useRowLink` helper, View buttons removed system-wide, portfolio panel converted to responsive `Descriptions`, Close/Reopen moved to the panel header, and the Transactions panel rebuilt as a catalog-style tree table with Decimal-summed parent summaries. Verified 14/14 against real data. Commits `c6db24b`, `e26758b`, `9e714ee`, `c8916e2`.
