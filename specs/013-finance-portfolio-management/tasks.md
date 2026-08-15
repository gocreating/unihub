# Tasks: Finance Portfolio Management — Iteration 5 (constitution v1.26.0 + data model + charts)

**Input**: spec.md Clarifications 2026-08-16 (FR-023…FR-029, SC-010…SC-013), research.md I5-1…I5-4, plan.md iteration-5 section, constitution v1.26.0.

**Tests**: TDD red-first.

**Paths**: `apps/unihub/frontend/` unless prefixed `backend/`.

> Iterations 1–4 are complete; a summary is archived at the end of this file.

## Phase 1: PageTable owns column sizing (FR-023) — blocks the page conversions

- [X] T201 Write failing tests `src/components/PageTable/autoWidth.test.tsx`: a column with `autoWidth: { header }` is sized to the widest of its header and its rendered values; `measure` overrides the `dataIndex` read; `min`/`max` clamp; a `max` narrower than the content still yields exactly `max` (no overflow); columns with an explicit `width` are left untouched; `scroll.x` totals the resolved widths; an empty `dataSource` falls back to the header width (SC-010)
- [X] T202 Implement `autoWidth` resolution inside `src/components/PageTable/index.tsx` per research I5-1 (resolve widths + `scroll.x` in a `useMemo` over `columns` × `dataSource`); T201 passes
- [X] T203 Verify-the-verifier: break the clamp (drop `max`) and the header floor in turn, confirm T201 fails on each, restore

## Phase 2: Two-line clamp (FR-024)

- [X] T204 Write failing tests `src/components/ClampedText/ClampedText.test.tsx`: renders its text; applies a 2-line clamp style; attaches a tooltip ONLY when `scrollHeight > clientHeight`; no tooltip when the text fits; the full text is the tooltip title
- [X] T205 Implement `src/components/ClampedText/index.tsx` per research I5-2 and export it; T204 passes. Do NOT modify `OverflowTooltip` — it stays the single-line primitive

## Phase 3: Convert the eleven pages (FR-023/FR-024)

Each task: replace the page's `dataWidths` memo + `widthForHeader(...)` spreads with `autoWidth`, keep every existing test green, and wrap overflow-prone text columns in `ClampedText`.

- [X] T206 [P] `src/pages/finance/portfolios/index.tsx` — includes the **reproduced description defect**: assert the fix with a test (≤2 lines, no overflow, tooltip present)
- [X] T207 [P] `src/pages/finance/currencies/index.tsx`
- [X] T208 [P] `src/pages/finance/accounts/index.tsx`
- [X] T209 [P] `src/pages/finance/exchange-rates/index.tsx`
- [X] T210 [P] `src/pages/finance/assets/index.tsx`
- [X] T211 [P] `src/pages/finance/balance-sheets/index.tsx` + `detail.tsx` + `edit.tsx` + `new.tsx`
- [X] T212 [P] `src/pages/inventory/catalog/index.tsx` — the largest; keep the `url` 320px cap behaviour and the measure-what-you-render note intact
- [X] T213 `src/pages/finance/portfolios/detail.tsx` — convert after Phase 5/6 touch the same file, to avoid edit collisions
- [X] T214 Grep gate: zero `measureTextWidth` / `dataWidths` occurrences under `src/pages/` (SC-010); `widthForHeader` remains only where a genuinely fixed width is intended

## Phase 4: Backend — multi-line description + closed-portfolio freeze (FR-025, FR-026)

- [X] T215 Write failing tests `backend/tests/finance/test_portfolios.py`: a closed portfolio rejects portfolio field edits (400), and `backend/tests/finance/test_transactions.py`: creating (already covered), **editing**, and **deleting** a transaction of a closed portfolio all fail; **reopening a closed portfolio succeeds** (the case a naive validator bricks); an active portfolio is unaffected; deleting the portfolio itself is still allowed (SC-012)
- [X] T216 Widen `Portfolio.description` to `TextField` in `backend/finance/models.py` and `makemigrations finance` → 0013 (FR-025)
- [X] T217 Implement the freeze per research I5-3 in `backend/finance/serializers.py` + `views.py`; T215 passes
- [X] T218 Regenerate `openapi.yaml` (spectacular) and `src/generated/api-types.ts`; verify the finance `data_io` TableDescriptors still match the model (Principle I)

## Phase 5: Portfolio list + detail UI (FR-025, FR-026, FR-027, FR-028)

- [X] T219 Portfolios list: description column `visible: false` by default (FR-027); test asserts it is absent initially and appears via the Columns control, and that the default saved-view baseline reflects it
- [X] T220 `PortfolioFormModal`: description uses a multi-line text area with no maxLength (FR-025); detail panel renders the description clamped
- [X] T221 Closed-portfolio UI: disable New/Edit/Delete transaction controls and the panel Edit action when `state === 'closed'`; Reopen stays enabled; tests assert disabled state (the backend is the real guard — SC-012)
- [X] T222 Transactions footer: "X transactions, Y transfers" on the footer's information side (FR-028); count transfers across the loaded transactions; test asserts both numbers

## Phase 6: Charts (FR-029)

- [X] T223 Write failing tests for the chart card: renders an AntD Card with `tabList` (Waterfall / Breakdown); mocks `echarts-for-react` and asserts the ECharts **option** — waterfall has a transparent base series plus a delta series in chronological order with cumulative values; breakdown has one bar per asset summing that asset's Value Change; transfers with null value_change are excluded; an empty state renders when nothing is valued
- [X] T224 Implement `src/pages/finance/portfolios/PortfolioCharts.tsx` per research I5-4 (ECharts, `renderer: 'svg'`, `notMerge`, `overflowX: auto` wrapper, `minWidth: 600`, `Decimal` sums) and mount it on the detail page above the Transactions panel; T223 passes
- [X] T225 Locale keys for both charts, the tab labels, the exclusion note, and the empty state — both locale files, same commit (Principle VIII)

## Phase 7: Polish & verification

- [X] T226 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; backend `uv run ruff check . && uv run pytest`
- [X] T227 Real-data probe after rebuilding the frontend image (compare container image id vs built image id and `--force-recreate` — the iteration-4 gotcha): Portfolios description ≤2 lines with no overflow and a working tooltip (SC-011), description hidden until revealed, a closed portfolio's controls disabled, footer counts correct on the 49-transaction portfolio (SC-013), both charts render with real values
- [X] T228 Backend probe: closed-portfolio mutations rejected at the API and reopen accepted, against a scratch DB — never the real one

## Dependencies

- T201–T203 block Phase 3. T204–T205 block the `ClampedText` adoptions in Phase 3.
- Phase 3 tasks are per-file and parallel, except T213 which waits for Phases 5–6.
- T215–T217 (backend) are independent of the frontend phases; T218 gates any frontend use of the new types.
- Phase 6 depends on nothing but the detail page existing; run after Phase 5 to avoid `detail.tsx` collisions.
- Phase 7 last.

**Total: 28 tasks** (Sizing 3, Clamp 2, Conversions 9, Backend 4, UI 4, Charts 3, Polish 3)

---

# Archive — Iterations 1–4 (complete)

- **Iteration 3** (2026-08-13/14, 26 tasks): legacy CSV import (38 assets / 55 portfolios / 359 transactions / 837 transfers, run against real data 2026-08-14), the transactions-list 500 fix, migration 0012 (18-decimal amounts, `Portfolio.description`, `Transaction.chain_id`/`tx_hash`, `Transfer.remark`, `Asset.category` dropped), and entity-views / quick-search / shared-confirm-dialog adoption. Commits `39478fa`, `a09ef48`.
- **Iteration 4** (2026-08-15, 19 tasks): constitution v1.25.0 whole-row navigation with the shared `useRowLink` helper, View buttons removed system-wide, portfolio panel converted to responsive `Descriptions`, Close/Reopen moved to the panel header, and the Transactions panel rebuilt as a catalog-style tree table with Decimal-summed parent summaries. Verified 14/14 against real data. Commits `c6db24b`, `e26758b`, `9e714ee`, `c8916e2`.
