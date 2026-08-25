# Tasks: Finance Portfolio Management — Iteration 9 (chart polish, position badges, accumulated vs change columns)

**Input**: spec.md Clarifications 2026-08-25 (FR-052…FR-057, SC-023…SC-027), research.md I9-1…I9-6, plan.md iteration-9 section, constitution v1.27.0.

**Tests**: TDD red-first (repo practice). **Frontend-only** — no migration, no OpenAPI regeneration; the backend loop still runs.

**Paths**: `apps/unihub/frontend/` unless prefixed `backend/`. Stories: US2 = Portfolios (list), US3 = Transactions (detail page).

## Phase 1: PageTable header default (FR-052, SC-023) — foundational, closes the defect class

- [ ] T601 Write failing tests: in `src/components/PageTable/autoWidth.test.ts`, `resolveAutoWidths` returns `title === autoWidth.header` for a column that declares no `title`, and leaves an explicit `title` (including a ReactNode from `makeSortProps`) untouched; in `src/pages/finance/portfolios/PortfoliosPage.test.tsx`, the rendered header row has NO empty `th` (today the Position header is blank)
- [ ] T602 Implement the default in `src/components/PageTable/autoWidth.ts` (`resolveAutoWidths` — set `title` from `autoWidth.header` when absent, before the marker is stripped); T601 passes

## Phase 2: `<Price mutedUnit>` + `HoldingTags` (FR-052, SC-027) — foundational

- [ ] T603 [P] Write failing tests in `src/components/Price/Price.test.tsx`: with `mutedUnit`, the unit renders in its own `span` in the secondary tone while the magnitude keeps the strong tone; without it the output is byte-identical to today; `formatMoney` is unaffected
- [ ] T604 Implement `mutedUnit` in `src/components/Price/Price.tsx` (a prop, not a wrapper — Principle XIII); T603 passes
- [ ] T605 Write failing tests in `src/pages/finance/portfolios/HoldingTags.test.tsx`: one `.ant-tag` per holding; each tag contains the quantity and the asset name in different tones; zero holdings renders `<EmptyValue />`; tags are inside a wrapping `Space`
- [ ] T606 Implement `src/pages/finance/portfolios/HoldingTags.tsx` — `{ holdings: { asset_name: string; quantity: string }[] }` → `<Tag><Price value asset plain mutedUnit /></Tag>` per asset; T605 passes
- [ ] T607 [US2] Adopt on the Portfolios list Position column in `src/pages/finance/portfolios/index.tsx`: replace the comma-joined `ClampedText` with `<HoldingTags>`, keep `autoWidth.measure` (space-joined text, `max: 360`); rewrite the "carries a Position column" test in `PortfoliosPage.test.tsx` to assert one tag per holding

## Phase 3: Shared chart tooltip (FR-053, SC-026) — foundational

- [ ] T608 [P] Write failing tests in `src/components/Price/chartTooltip.test.ts`: `chartTooltipHtml(title, rows)` yields `<b>title</b>` followed by a table with one `<tr>` per row whose value cell is right-aligned with `tabular-nums`; `seriesMarker(color)` yields the 10px dot carrying that colour; `pinnedAxisTooltip(320)` sets `trigger: 'axis'`, `appendToBody: true`, `axisPointer.animation: false`, and its `position` callback places the box right of the x point when it fits and flips left (never past 5px) when it does not
- [ ] T609 Implement `src/components/Price/chartTooltip.ts` (pure, React-free — lifted from the balance-sheets closures) and export it from `src/components/Price/index.ts`; T608 passes
- [ ] T610 Migrate the Balance Sheets charts: in `src/pages/finance/balance-sheets/index.tsx` both tooltips call `pinnedAxisTooltip` + `chartTooltipHtml` with values from `moneyFormatter(baseCurrency)`, the y-axis label uses the same formatter (retiring `formatTick`), and `SHARP_BICOLOR`/the dot use `COST_COLOR`/`INCOME_COLOR`; delete the local `tooltipRow`/`fmtVal` closures; in `src/pages/finance/balance-sheets/detail.tsx` the pie tooltip's value goes through `formatMoney` inside `chartTooltipHtml`. Existing `BalanceSheetsPage.test.tsx`/`BalanceSheetDetailPage.test.tsx` stay green; add one assertion that the formatter output contains a normalizer-formatted value

## Phase 4: Whole-portfolio transaction set (FR-057, SC-025) — US3

- [ ] T611 [US3] Write failing tests in `src/pages/finance/portfolios/PortfolioDetailPage.test.tsx`: the page issues a second `listTransactions` call carrying the portfolio filter, `ordering: 'timestamp,created_at'` and `limit: 500`; when the PAGE query returns the newest 2 of 3 transactions and the FULL query returns all 3, the newest row's Accumulated PnL equals the three-transaction sum (not the two-row sum); re-sorting the page does not change any accumulated figure
- [ ] T612 [US3] Implement in `src/pages/finance/portfolios/detail.tsx`: `useQuery(['finance','transactions','all', id])` → `allTransactions`; `runningTotals` iterates that set (oldest first) and is looked up by transaction id; `<PortfolioValuePanel transactions={allTransactions}>`; T611 passes

## Phase 5: Chart data (FR-055 / FR-043, SC-024) — US3

- [ ] T613 [US3] Write failing tests in `src/pages/finance/portfolios/PortfolioValuePanel.test.tsx`: `trendPoints` gives `position === -(cost + income)` for every transaction (a 1,000 cost → +1,000; a 1,200 income → −1,200; a position-only transfer → 0); `trendOption` has exactly ONE `yAxis` and no series with `yAxisIndex: 1`; its tooltip formatter, fed ECharts-style params for index i, returns `<b>date</b>` plus Cost/Income/Position rows formatted `− NT$ 1,000` / `+ NT$ 1,000` — identical in `bar` and `waterfall` mode (signed deltas, never heights); `pnlLineOption`'s formatter returns the date title and one signed PnL row; both options carry `appendToBody` and a `position` function. Replace the now-wrong tests ("gives position its own axis", quantity-based position expectations)
- [ ] T614 [US3] Implement in `src/pages/finance/portfolios/portfolioChartData.ts`: money-valued position, single axis, tooltips via `pinnedAxisTooltip` + `chartTooltipHtml` reading the signed point set by `dataIndex`; T613 passes

## Phase 6: Chart-only panel (FR-054) — US3

- [ ] T615 [US3] Write failing tests in `PortfolioValuePanel.test.tsx` and `PortfolioDetailPage.test.tsx`: the PnL tab renders no `Descriptions`, no "PnL" figure line, no "Still holding" text and no "Charted from" note; while the PnL tab is active an info icon in the tab bar carries the realized note for a closed portfolio and the no-prices note for an open one; the icon is absent on the Trend tab (the Waterfall toggle is there); `getPortfolioHoldings` is never called. Rewrite the iteration-6 detail tests that asserted the figure/holdings lines
- [ ] T616 [US3] Implement in `src/pages/finance/portfolios/PortfolioValuePanel.tsx` (remove the Descriptions block, the holdings query and the page note; `tabBarExtraContent` = info icon on PnL / Segmented on Trend); delete `getPortfolioHoldings` from `src/services/unihub-backend/finance.ts` and its mocks in the two test files; remove `pages.finance.portfolios.charts.pageNote`, `.value.holdings`, `.value.pnl` from BOTH `src/locales/en-US/pages.ts` and `src/locales/zh-TW/pages.ts` (keep `.value.noPricesNote` / `.value.realizedNote`); T615 passes

## Phase 7: Accumulated vs Tx change columns (FR-056, SC-027) — US3

- [ ] T617 [US3] Write failing tests in `PortfolioDetailPage.test.tsx`: the header row reads exactly `["", "Time", "Accumulated PnL", "Accumulated Position", "Tx PnL Change", "Tx Position Change", "Description", "Actions"]`; a transaction row fills Accumulated PnL (`+ NT$ …`) and Accumulated Position (one tag per asset) and leaves both Tx cells empty; an expanded asset-leg transfer row fills Tx PnL Change and Tx Position Change (`+123 0050.TW`) and leaves both Accumulated cells empty; a cash-leg transfer row leaves Tx Position Change empty; the iteration-6 "no blank header except the caret" test still passes
- [ ] T618 [US3] Implement in `src/pages/finance/portfolios/detail.tsx` (six data columns in `columnDefs`/`colDefMap`, strict parent/child split, `<HoldingTags>` for Accumulated Position, right-aligned amounts); add `pages.finance.transactions.col.accumulatedPnl` / `.accumulatedPosition` / `.txPnlChange` / `.txPositionChange` and remove `.col.pnl` / `.col.position` in BOTH locale files (zh-TW: 累計損益 / 累計部位 / 交易損益變動 / 交易部位變動); T617 passes

## Phase 8: Polish & verification

- [ ] T619 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck); backend `uv run ruff check . && uv run pytest` — this also closes iteration 8's open T514
- [ ] T620 Rebuild AND force-recreate the frontend container (compare container image id vs image id first), then run the quickstart "Iteration 9 verification plan" against the real data read-only — SC-023…SC-027, FR-054, FR-056 — and record the results in `specs/013-finance-portfolio-management/quickstart.md`

## Dependencies

- Phase 1 and Phase 2 are independent of each other; Phase 3 is independent of both (T603/T608 can start in parallel).
- Phase 2 blocks T607 (list) and T618 (table). Phase 3 blocks T614.
- Phases 4 → 5 → 6 → 7 all edit `detail.tsx` / `PortfolioValuePanel.tsx` / `portfolioChartData.ts` — run them in order, not in parallel.
- Phase 8 last; T620 needs T619 green.

**Total: 20 tasks** (Header 2, Badges 5, Tooltip 3, Whole-portfolio 2, Chart data 2, Panel 2, Table 2, Polish 2). Parallel starts: T601, T603, T608.

---

# Archive — Iterations 1–8 (complete)

- **Iteration 8** (2026-08-18, 14 tasks): constitution v1.27.0 — the shared `<Price>` component over pure normalizers (`components/Price/`), row-click expansion from the shared `useRowProps` helper in all three expandable tables, Portfolios list default view Name/PnL/Position with server-side bulk holdings and last-transaction/state ordering. Migration 0014 verified on the real data (38 assets, 837 transfers: 301 currency legs + 536 asset legs). Commit `c5288c0`. **Carried forward**: T505 (balance-sheets + exchange-rates migration onto `<Price>`) — its CHART half (the tooltip closures, the 0dp axis, the hex palette) is done by iteration 9's T610; the balance-sheets cell render and the exchange-rates page remain open. T514 (quality loop + rebuild) is absorbed by T619/T620.
- **Iteration 7** (2026-08-16, 17 tasks): breaking Transfer redesign — `pnl_change` + exactly one of a currency leg or an asset leg (DB constraint + serializer), currencies barred from Assets, `remark` removed, migration 0014 converting the 301 legacy cash legs, the merged PnL/Trend panel with the Waterfall toggle, the Time/PnL/Position/Description table with accumulated parents, and the constitution-compliant transaction modal (General/Transfers tabs, table rows, link-style Add). Commits `cd5b36c`, `08f8b7f`, `c5288c0`.
- **Iteration 6** (2026-08-16, 14 tasks): fixed the empty Transactions headers (6 of 8 blank, introduced in iteration 4), backend value aggregates + holdings endpoint, the realized/net PnL panel and list column, and removal of State/Base Currency from the edit modal. Verified 13/13. Commits `6d25c61`, `513c61b`, `7032818`.
- **Iteration 3** (2026-08-13/14, 26 tasks): legacy CSV import (38 assets / 55 portfolios / 359 transactions / 837 transfers, run against real data 2026-08-14), the transactions-list 500 fix, migration 0012 (18-decimal amounts, `Portfolio.description`, `Transaction.chain_id`/`tx_hash`, `Transfer.remark`, `Asset.category` dropped), and entity-views / quick-search / shared-confirm-dialog adoption. Commits `39478fa`, `a09ef48`.
- **Iteration 5** (2026-08-16, 28 tasks): constitution v1.26.0 — PageTable took ownership of column sizing (`autoWidth`, eleven pages converted, 81 call sites removed), `ClampedText` two-line cells, `Portfolio.description` → TextField (migration 0013), closed-portfolio freeze enforced server-side, description hidden by default, footer counts, and the waterfall + breakdown charts. Verified 7/7 UI and 8/8 API. Commits `0ccca3d`, `f264092`, `16b2b0c`, `253c3d7`, `368e95f`.
- **Iteration 4** (2026-08-15, 19 tasks): constitution v1.25.0 whole-row navigation with the shared `useRowLink` helper, View buttons removed system-wide, portfolio panel converted to responsive `Descriptions`, Close/Reopen moved to the panel header, and the Transactions panel rebuilt as a catalog-style tree table with Decimal-summed parent summaries. Verified 14/14 against real data. Commits `c6db24b`, `e26758b`, `9e714ee`, `c8916e2`.
