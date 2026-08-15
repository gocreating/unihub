# Tasks: Finance Portfolio Management — Iteration 4 (constitution v1.25.0 sweep + portfolio UX)

**Input**: spec.md Clarifications 2026-08-15 (FR-018…FR-022, SC-007…SC-009), research.md I4-1…I4-4, plan.md iteration-4 section, constitution v1.25.0.

**Tests**: TDD red-first. Frontend-only iteration — no backend, model, or API change.

**Paths**: relative to `apps/unihub/frontend/`.

> Iterations 1–3 are complete; a summary is archived at the end of this file.

## Phase 1: Foundational — the shared helper (blocks everything)

- [X] T101 Write failing tests `src/components/PageTable/useRowLink.test.tsx`: plain click navigates; **Ctrl/Cmd/Shift+click calls `window.open(url,'_blank','noopener,noreferrer')` and does NOT navigate**; **middle click (`auxclick`, `button: 1`) opens a new tab and calls `preventDefault()`**; a click inside `[data-actions-col]`, a `<button>`, an `<a>`, an `<input>`, or `[data-row-link-ignore]` does nothing; a click while `window.getSelection()` holds non-empty text does nothing; a null/empty url yields `{}` (no cursor, no handlers) (FR-018, SC-007, SC-008)
- [X] T102 Implement `src/components/PageTable/useRowLink.ts` per research I4-1 and export it from `src/components/PageTable/index.tsx`; T101 passes
- [X] T103 Verify-the-verifier: temporarily strip the modifier branch and the selection guard, confirm T101 fails on both, restore (the round-9 lesson — a net that cannot fail proves nothing)

## Phase 2: System-wide sweep (FR-019) — independent per page

- [X] T104 [P] Update `src/pages/finance/portfolios/PortfoliosPage.test.tsx`: no View button anywhere; **no Actions column at all**; no Close/Reopen button; row click navigates to the detail page; Ctrl+click opens a new tab instead; the existing Name-hyperlink assertions stay green
- [X] T105 [P] Amend `src/pages/finance/portfolios/index.tsx`: delete the actions column def (and its `useActionsColWidth`, `EyeOutlined`, `toggleState`/`updateMutation` if now unused), drop `actions` from `columnDefs`, wire `onRow={rowLink(...)}` (FR-013, FR-020)
- [X] T106 [P] Update `src/pages/finance/balance-sheets/` tests: View button gone; row click navigates to the sheet detail; Edit still a real hyperlink to `/edit`; clicking Delete does NOT navigate (SC-008)
- [X] T107 [P] Amend `src/pages/finance/balance-sheets/index.tsx`: remove the View button, wire `onRow`, keep Edit/Delete
- [X] T108 [P] Update inventory scenarios tests + `src/pages/inventory/scenarios/index.tsx`: row click navigates; the name `<Link>` stays
- [X] T109 [P] Add `data-row-link-ignore` to the catalog caret in `src/pages/inventory/catalog/index.tsx` and add a catalog test asserting its rows are NOT clickable (the exemption is deliberate, so it gets a lock)
- [X] T110 Remove the now-dead `common.view` key from both locale files **only if** a repo-wide grep shows no remaining reference (constitution VIII: both locales, same commit)

## Phase 3: Portfolio panel — Descriptions + Close/Reopen (FR-020, FR-021)

- [X] T111 Update `src/pages/finance/portfolios/PortfolioDetailPage.test.tsx`: the panel renders an AntD `Descriptions` containing Name, Base Currency, State, Description, First/Last Transaction (no separate page title); a visible **Close** button sits beside Edit and toggles to **Reopen** for a closed portfolio; Delete stays in the kebab; clicking Close calls `updatePortfolio` with the flipped state
- [X] T112 Amend `src/pages/finance/portfolios/detail.tsx`: replace the ad-hoc `Space`/`Typography`/div block with `<Descriptions>` whose `column` derives from the existing `useContainerWidth()` `width` (`<560 → 1`, `<900 → 2`, else 3 — research I4-2); add Close/Reopen to `PanelHeaderActions.visible` beside Edit
- [X] T113 Add a narrow-panel test asserting the Descriptions column count collapses from measured **content** width (mock `ResizeObserver`/width as the existing container-width tests do), not viewport breakpoints

## Phase 4: Transactions tree table (FR-022)

- [X] T114 Update the transactions-panel tests in `PortfolioDetailPage.test.tsx`: expanding a transaction adds its transfers as rows **of the same table** sharing the parent's columns, with **no nested table header** in the DOM; a collapsed parent shows `N transfers` in the Asset column and the **net** value change; the caret toggles; child rows show asset/change/value/remark; the Actions column renders only on parents (SC-009)
- [X] T115 Amend `src/pages/finance/portfolios/detail.tsx`: build the `TxnRow` union with `children`, add the `__caret` column (width 44, `data-row-link-ignore`, participates in column config), set `indentSize={0}` + `expandable={{ showExpandColumn: false, expandedRowKeys }}`, switch renderers on `rowType`, and use the composite `rowKey` `` `${rowType}:${id}` `` (research I4-3); delete the nested `expandedRowRender` ProTable and the now-unused `transferCols`
- [X] T116 Reflect the merged column set in `columnDefs` and both locale files (the Asset column header now serves both row types; the old transfer-count column is absorbed into the parent summary)

## Phase 5: Polish & verification

- [X] T117 Full quality loops: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — run it before committing). Backend untouched; run `uv run pytest` once to confirm no collateral damage
- [X] T118 Grep gates: zero `EyeOutlined`/`common.view` under `src/pages`; every table with a detail route passes `onRow`; no `expandedRowRender` left in the portfolio detail page
- [ ] T119 Read-only browser probe against the running stack (real data): portfolio row click opens the detail page, Ctrl+click opens a tab, Delete on balance-sheets does not navigate, the Portfolio panel Descriptions reflows at a narrow width, and a real transaction expands into child rows sharing columns. Rebuild the docker images first — the served app is a built image, so source edits are invisible until then

## Dependencies

- T101–T103 block every later phase (all pages consume the helper).
- Phase 2 tasks are mutually independent (different files): T104/T105 portfolios, T106/T107 balance-sheets, T108 scenarios, T109 catalog.
- Phase 3 and Phase 4 both edit `detail.tsx` — run Phase 3 first, then Phase 4, to avoid edit collisions.
- T110 after Phase 2 (needs the greps to be clean).
- Phase 5 last.

**Total: 19 tasks** (Foundational 3, Sweep 7, Panel 3, Tree 3, Polish 3)

---

# Archive — Iterations 1–3 (complete)

Iteration 3 (2026-08-13/14, 26 tasks, all complete) shipped the legacy CSV import
(38 assets / 55 portfolios / 359 transactions / 837 transfers, executed against
real data on 2026-08-14), the transactions-list 500 fix (filter contract), model
amendments (migration 0012 — 18-decimal transfer amounts, `Portfolio.description`,
`Transaction.chain_id`/`tx_hash`, `Transfer.remark`, `Asset.category` dropped), and
the entity-views / quick-search / shared-confirm-dialog policy adoption.
Task-level detail is preserved in git history at commits `39478fa` and `a09ef48`.
