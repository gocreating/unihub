# Research: Finance Portfolio Management

**Phase 0 output** | Branch: `013-finance-portfolio-management`

---

## Decision 1: Portfolio Timestamp Auto-Update Strategy

**Decision**: Use Django `post_save` and `post_delete` signals on the `Transaction` model. Both signals call a shared `Portfolio.refresh_transaction_times()` method that runs a single aggregation query (`Transaction.objects.filter(portfolio=self).aggregate(Min('timestamp'), Max('timestamp'))`) and updates the portfolio's `first_transaction_time` and `last_transaction_time` in one `update()` call.

**Rationale**: Signals are the Django-idiomatic way to propagate side effects between related models without coupling Transaction's business logic to Portfolio. A single `aggregate()` query is accurate regardless of ordering and handles the edge case when the last transaction is deleted (both fields become null).

**Alternatives considered**:
- Override `Transaction.save()` / `delete()`: Simpler but misses bulk operations and is less decoupled.
- Compute on-the-fly in Portfolio serializer via annotation: Adds latency to every portfolio list query; complicates filtering and default sort on the backend.
- Database triggers: Portable enough for PostgreSQL but bypasses Django's ORM layer, complicating tests.

---

## Decision 2: Nested Transfer Write in Transaction

**Decision**: `TransactionSerializer` includes a writable nested `transfers` field (`TransferSerializer(many=True)`). Override `create()` and `update()` to wrap the full write — transaction record + all transfers — in `transaction.atomic()`. On `update()`, delete all existing transfers for the transaction and recreate them from the payload (full-replace strategy).

**Rationale**: Full-replace is simpler to reason about and test than a diff-and-patch strategy. Since transfers are line items of the parent transaction, the client always sends the complete current state. The `atomic()` block guarantees the portfolio's timestamps only update once the full transaction is persisted (signal fires after commit).

**Alternatives considered**:
- Two-step API (POST transaction, then POST each transfer): Requires client-side orchestration; partial failure leaves orphaned transaction records.
- Partial-update (PATCH individual transfers via their own endpoint): Adds URL complexity; no requirement for it in the spec.

---

## Decision 3: Expandable Transfer Rows in Transactions Table

**Decision**: Use ProTable's `expandable.expandedRowRender` prop on the Transactions table. Inside `expandedRowRender`, render a `ProTable` with `ghost={true}` (no card wrapper) showing the transfers for that transaction. Constitution Principle VII explicitly bans embedding PageTable inside another component; `ProTable ghost` is the correct inner table.

**Rationale**: The expanded row is conceptually a nested list — a standard AntD/ProTable pattern. `ghost={true}` strips the ProCard outer wrapper that would otherwise interfere with the parent card's `border-bottom`. Transfers are already included in the Transaction list response (nested), so no additional network request is needed when a row is expanded.

**Alternatives considered**:
- Lazy-load transfers on row expansion: Cleaner for large datasets but unnecessary here (personal tool, bounded data volume). Including transfers inline in the list response is simpler.
- Separate Transfers list page: Rejected per spec clarification.
- Custom accordion component: More code, no benefit over the native ProTable expandable.

---

## Decision 4: Immutable `base_currency` on Portfolio

**Decision**: In `PortfolioSerializer`, set `base_currency` as `read_only=True` on update paths by overriding `update()` to pop `base_currency` from `validated_data` before saving (or by using separate `PortfolioCreateSerializer` and `PortfolioUpdateSerializer`). Use the two-serializer approach — cleaner intent, no runtime branching.

**Rationale**: The spec requires `base_currency` to be permanently fixed at creation. Two serializers make the constraint explicit in code rather than relying on a runtime check in `update()`.

**Alternatives considered**:
- Single serializer with `read_only=True`: DRF ignores read-only fields on input, but this silently drops the field rather than returning an error if a client sends it. The two-serializer approach is more explicit.
- Validate in `update()` and raise `ValidationError`: Works but adds branching to serializer logic.

---

## Decision 5: Active Portfolio Validation on Transaction Create

**Decision**: In `TransactionSerializer.validate()`, check `attrs['portfolio'].state == 'active'` and raise `serializers.ValidationError({'portfolio': 'Cannot add a transaction to a closed portfolio.'})` if closed.

**Rationale**: Business rule enforcement at the serializer level is the DRF standard: it runs before DB write, produces a structured 400 response, and is easy to unit-test.

**Alternatives considered**:
- Validate in the viewset's `perform_create()`: Works but bypasses the serializer contract and is harder to test in isolation.
- Database-level constraint: Not expressible as a standard Django constraint; would require a trigger.

---

## Decision 6: Asset Deletion Guard (referenced by Transfers)

**Decision**: Use `on_delete=models.PROTECT` on `Transfer.asset` FK. Django raises `ProtectedError` when a DELETE is attempted on an Asset referenced by any Transfer. Catch `ProtectedError` in the `AssetViewSet.destroy()` method and return a `409 Conflict` with a descriptive message.

**Rationale**: `PROTECT` is the semantically correct choice — asset data would be orphaned without it. Catching at the viewset level allows a human-readable error response instead of a 500.

**Alternatives considered**:
- `on_delete=RESTRICT`: Same effective behaviour as `PROTECT` in modern Django; `PROTECT` is more widely understood.
- Application-level pre-check (query for references before delete): Susceptible to race conditions; `PROTECT` is atomic.

---

## Decision 7: Portfolio Deletion Guard (has Transactions)

**Decision**: Use `on_delete=models.PROTECT` on `Transaction.portfolio` FK. Same catch-and-409 pattern in `PortfolioViewSet.destroy()`.

**Rationale**: Consistent with Decision 6. Prevents orphaned transactions.

---

## Decision 8: Decimal Precision for Amounts

**Decision**:
- `asset_change_amount`: `DecimalField(max_digits=28, decimal_places=8)` — supports crypto-scale precision (e.g., 0.00000001 BTC).
- `value_change`: `DecimalField(max_digits=28, decimal_places=8, null=True, blank=True)` — same precision, optional.
- All decimal fields serialized as strings (`COERCE_DECIMAL_TO_STRING = True` in DRF settings, already set in existing codebase).

**Rationale**: 8 decimal places matches the satoshi precision of Bitcoin (finest-grained asset expected). 28 total digits accommodates large fiat amounts. Consistent with existing `Balance.amount` (20 digits, 4 decimals) but wider to support asset-native amounts.

**Alternatives considered**:
- 4 decimal places: Insufficient for crypto assets.
- Float: Loses precision in JSON serialisation; rejected.

---

# Iteration 2 (2026-07-20): Portfolio Navigation & Detail Panel

## Decision I2-1: Row hyperlink implementation

**Decision**: Follow the inventory catalog iteration-19 pattern exactly — AntD `Button`
(View action) and the Name anchor carry a real `href` to `/finance/portfolios/:id` plus a
guarded `onClick`: `if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(...)`.

**Rationale**: Real `href` restores middle-click / Ctrl+Click / copy-link (constitution
v1.24.0); the guard keeps plain clicks as SPA navigation. Proven in
`pages/inventory/catalog/index.tsx` (~line 675).

**Alternatives considered**: React Router `<Link>` styled as button — equivalent semantics
but diverges from the established repo pattern for AntD buttons; rejected for consistency.

## Decision I2-2: Panel header actions

**Decision**: Reuse the shared `PanelHeaderActions` component
(`components/PanelHeaderActions/`) in the new "Portfolio" Card's `extra`, with
`visible=[Edit]`, `advanced=[Delete]`, `narrow` from `useContainerWidth(720)` — mirroring
`pages/inventory/scenarios/detail.tsx` (~line 574).

**Rationale**: The component already implements the constitution's panel-header kebab rule
(destructive always folded; visible actions fold when narrow; leftward-opening dropdown).

**Alternatives considered**: Ad-hoc `Space` of buttons in `Card extra` — re-implements the
kebab rule; violates the shared-component intent.

## Decision I2-3: Breadcrumb

**Decision**: Follow `pages/finance/balance-sheets/detail.tsx` (~line 462): AntD
`Breadcrumb` with items `[{ title: Portfolios, href, onClick: preventDefault + navigate },
{ title: portfolio name }]`, replacing the `ArrowLeftOutlined` ad-hoc back-link.

**Rationale**: Established finance-domain breadcrumb pattern; satisfies the constitution's
standalone-page navigation rule (breadcrumb, no Back/Cancel control).

**Alternatives considered**: none — pattern is prescribed by constitution + precedent.

## Decision I2-4: Delete flow from detail page

**Decision**: Kebab → `Modal.confirm` (`okType: 'danger'`, locale keys) → existing delete
mutation → `message.success` → `navigate('/finance/portfolios')`. FR-010 block (portfolio
has transactions) surfaces the backend error via the standard `message.error` path and does
NOT navigate.

**Rationale**: Moves the existing list-row delete behavior without weakening the
delete-confirmation constraint; navigation-on-success is required because the deleted
entity's page can no longer render.

---

# Iteration 3 (2026-08-13): Legacy Migration, Policy Compliance, Model Amendments

## Decision I3-1: Transactions 500 — filter contract repair

**Decision**: Fix `filterable_fields` on `AssetViewSet`, `PortfolioViewSet`, `TransactionViewSet` to the current core contract: `lookup` = ORM field path (e.g. `"portfolio": {"lookup": "portfolio", "type": "single_select"}`), operators come from each condition's `op` via `_OP_SUFFIX` in `core/filters.py`.

**Rationale**: Root-caused from the running backend's traceback: `FieldError: Cannot resolve keyword 'exact' into field` raised from `EntityFilterBackend.filter_queryset → queryset.filter(combined)`. The 013 viewsets were written against the pre-016 contract where `lookup` held the operator; main's evolved `core/filters.py` (which this branch now sits on after the rebase) treats it as the field path — `CurrencyViewSet`/`AccountViewSet` show the compliant shape. The 553-test suite stayed green because no existing test drives the `filters` query param through these three viewsets — the regression tests added this iteration do exactly that (portfolio eq, name contains, timestamp date ops).

**Alternatives considered**: Making `EntityFilterBackend` tolerate operator-shaped lookups — rejected: it would freeze a bug as API and diverge the shared machinery for one consumer.

## Decision I3-2: Decimal precision (28,8) → (38,18)

**Decision**: `Transfer.asset_change_amount` and `Transfer.value_change` become `DecimalField(max_digits=38, decimal_places=18)`; `TransferSerializer` mirrors. Conversion at import: `Decimal(raw) / Decimal(10) ** decimals` (exact, no float anywhere).

**Rationale**: Iteration-1's Decision 8 assumed satoshi (8dp) as the finest grain; the legacy CSVs contain 18-decimals ERC-20 amounts down to wei (e.g. `-67305900768` raw = −0.000000067305900768 ETH) that 8dp would corrupt — violating SC-003 "no data corrupted". Data audit: converted values need ≤7 integer digits; (38,18) leaves 20, ample for future manual entries. Postgres `numeric` and DRF string coercion carry it losslessly.

**Alternatives considered**: (28,18) — fits today's data but only 10 integer digits of headroom; string column — loses ordering/aggregation; per-asset decimals stored in unihub — user explicitly removed the concept.

## Decision I3-3: New optional fields

**Decision**: `Portfolio.description` CharField(500), `Transaction.chain_id` CharField(32), `Transaction.tx_hash` CharField(128), `Transfer.remark` CharField(255) — all `blank=True, default=""`, writable in serializers, empty renders as `<EmptyValue />`.

**Rationale**: Clarified 2026-08-13 — user chose lossless first-class fields over folding into description text; 136 transactions carry chain/tx metadata, 36 transfers carry remarks, 8 portfolios carry descriptions.

## Decision I3-4: Importer architecture

**Decision**: `finance/management/commands/import_legacy_finance.py` taking a CSV directory. Python stdlib `csv` (quoted fields with embedded commas exist). Whole run in one `transaction.atomic()`. Legacy `reference` (8-char) reused verbatim as primary key (fits `CharField(max_length=12)` nanoid PKs) — idempotency = "pk exists → skip, never update". Order: assets → currencies-ensure → portfolios → transactions → transfers. Legacy `created_time`/`updated_time` preserved via per-model post-insert `QuerySet.update()` (bypasses `auto_now*`). `refresh_transaction_times()` once per imported portfolio at the end (post_save signals fire during insert but the final recompute is authoritative after timestamp preservation). ORM writes bypass serializer rules by design — historical data lands verbatim (a closed portfolio's history imports fine; the closed-portfolio block is an API-level rule for new activity). Prints per-entity created/skipped counts; any unknown reference or malformed row aborts the whole run.

**Rationale**: A management command is operator-run, repeatable, testable with pytest fixtures, and keeps the CSVs out of the image and out of git (FR-012h) — unlike a data migration (runs implicitly at deploy, needs the files present) or the data_io pipeline (its registry format doesn't match these CSVs, and its natural-key machinery adds nothing when legacy references are already stable ids).

**Alternatives considered**: data_io import (shape mismatch, heavier); Django data migration (couples deploy to personal data files); UPSERT semantics (rejected — "never touch existing data" is stronger and simpler to reason about).

## Decision I3-5: Value Change mapping

**Decision**: `UPDATE_POSITION` → `value_change = None`; `COST`/`EXPENSE`/`REVENUE` → `value_change = Decimal(settlement_raw) / 10**settlement_decimals` where `settlement_decimals` comes from the portfolio's `settlement_asset_reference` row in the asset CSV. `flow_type` itself is not stored (spec removed transfer types, Session 2026-06-08).

**Rationale**: Verified against all 837 rows: settlement `0` occurs exactly on `UPDATE_POSITION` rows, so the mapping is bijective on this data set; signs already encode direction (COST/EXPENSE negative, REVENUE positive).

## Decision I3-6: Currency ensure (TWD/USD)

**Decision**: For each distinct `settlement_asset_reference`, resolve the legacy asset row and require `Currency.objects.get_or_create(code=symbol, defaults={name: legacy name, symbol: symbol})`. Existing Currency rows are left untouched. `Portfolio.base_currency` stores the code (existing CharField contract — `PortfolioCreateSerializer` already validates codes against Currency).

**Rationale**: Clarified 2026-08-13 ("we already have currency model"); only TWD and USD appear as settlement assets; `Currency.code` is `max_length=3`, both fit.

## Decision I3-7: Entity views + quick search adoption wiring

**Decision**: Adopt on `pages/finance/assets/index.tsx` (tableKey `finance-assets`) and `pages/finance/portfolios/index.tsx` (tableKey `finance-portfolios`) exactly per the compliant `pages/finance/currencies/index.tsx` pattern:
- `useEntityTable({ key, filterableAttrs, columnDefs })`; baseline = `viewConfigFromColumns(columnDefs)`; `useEntityViews({ tableKey: table.tableKey, table, defaultConfig })`.
- `PageTable` gets `key={`${table.cols.pinFingerprint}-${views.activeTabId}`}`, `viewBar={<ViewTabs views={views} />}`, and `headerTitle={<EntityToolbar filterProps sortProps columnProps searchProps={{ value: table.searchQuery, onChange: table.setSearchQuery }} />}`.
- Page wrapped in `SearchHighlightProvider value={table.activeSearch}`; text cells render through `<SearchMark />`; column widths via `widthForHeader`/`measureTextWidth`/`computeScrollX`; footer `EntityOffsetFooter {...table.paginationProps(count)}`; sorting via `makeSortProps`.
- The portfolio-detail Transactions panel gets **quick search only** (searchProps + SearchHighlightProvider + SearchMark on its own table) — NO ViewTabs: view tabs exist solely on top-level entity list pages hub-wide (tableKeys in use: finance-currencies/accounts/exchange-rates, inventory-catalog/scenarios; none on a detail page).
- All three delete confirmations move from `Modal.confirm` to `confirmDialog` (`@/components/ConfirmDialog`), which supersedes research decision I2-4's `Modal.confirm` prescription.

**Rationale**: 016 FR-039 mandates ONE pattern with no per-page variation and one baseline definition (`viewConfigFromColumns`); 019 put search on every entity table. Reusing the currencies page verbatim keeps the five+2 pages mechanically identical, and the per-page vitest locks from 016 round 12 define the assertions the new pages' tests must replicate (first request carries no filter/ordering + default page size; stored default view applied on arrival with no indicator).

**Alternatives considered**: View tabs on the detail-page transactions table — rejected: no precedent in the hub, sessionless per-visit tabs make little sense scoped under a parent record, and the panel's filter context (portfolio id) must stay outside user-editable view state.

---

# Iteration 4 research (2026-08-15) — constitution v1.25.0 sweep + portfolio UX

## I4-1: One shared row-link helper (`rowLinkProps`)

**Decision**: New `useRowLink()` hook in `components/PageTable/useRowLink.ts`, exported from the PageTable barrel (it feeds `PageTable`'s `onRow`, so it belongs beside the table, not in generic `hooks/`). Usage is one line per page:

```tsx
const rowLink = useRowLink();
<PageTable onRow={(record) => rowLink(`/finance/portfolios/${record.id}`)} … />
```

It returns `{ style: { cursor: 'pointer' }, onClick, onAuxClick }`:
- `onClick`: modifier (Ctrl/Cmd/Shift) → `window.open(url, '_blank', 'noopener,noreferrer')`; otherwise `navigate(url)`.
- `onAuxClick`: `button === 1` (middle) → `preventDefault()` + `window.open(...)`. React's `onAuxClick` is the only way to catch middle-click; `onClick` never fires for button 1 in Chrome.
- Both bail via a shared `shouldIgnore(e)` guard: `e.target.closest(INTERACTIVE)` where INTERACTIVE covers `a, button, input, select, textarea, label, [role="button"], [role="checkbox"], .ant-checkbox, .ant-switch, [data-actions-col], [data-row-link-ignore]`, plus a non-collapsed `window.getSelection()` whose trimmed text is non-empty.

**Rationale**: constitution v1.25.0 mandates ONE helper so semantics cannot drift (the FR-039 "one pattern" lesson). `[data-actions-col]` already wraps every actions cell in this codebase, so the Delete-button guard works on every existing table for free; `[data-row-link-ignore]` is the opt-out for bespoke controls such as an expand caret.

**Alternatives considered**: (a) an invisible absolutely-positioned `<a>` overlaying the row — defeated by AntD's sticky/fixed columns which repaint cells into separate DOM subtrees; (b) wrapping every cell's content in an anchor — destroys cell layout and nests anchors inside the existing name link; (c) plain `onClick` with no modifier handling — explicitly the failure mode the constitution rule names.

## I4-2: Responsive `Descriptions` driven by CONTENT width

**Decision**: The Portfolio panel uses AntD `Descriptions` with a numeric `column` derived from the existing `useContainerWidth()` measurement (`width < 560 → 1`, `< 900 → 2`, else `3`), NOT AntD's `column={{ xs, sm, md … }}` breakpoint object.

**Rationale**: AntD's Descriptions breakpoints follow the **viewport**, and the constitution's form-layout rule already establishes that narrowness MUST be judged by the actual content width, because a collapsed-sidebar-narrow content area must also stack. The detail page already measures its panel with `useContainerWidth(720)` for `PanelHeaderActions`; the same `width` now also drives the column count — one measurement, two consumers, no new observer.

## I4-3: Transactions as a single tree table (catalog pattern)

**Decision**: Replace the nested `<ProTable>` inside `expandedRowRender` with real child rows:
- Row union `TxnRow = (Transaction & { rowType: 'transaction'; children: TxnRow[] }) | (Transfer & { rowType: 'transfer' })`.
- Shared columns: `__caret | timestamp | description | asset | asset_change | value_change | remark | actions`; every renderer switches on `rowType`.
- `indentSize={0}`, `expandable={{ showExpandColumn: false, expandedRowKeys }}`, caret column keyed `__caret` (width 44) that participates in column config exactly as the catalog's does, and carries `data-row-link-ignore`.
- **Parent summary (clarified 2026-08-15)**: a transaction row renders `N transfers` in the Asset column and the **sum of its transfers' `value_change`** in the Value Change column; child rows render their own asset/amount/value/remark; the Actions column renders only on the parent.
- **`rowKey` is composite** — `` `${rowType}:${id}` `` — because transaction and transfer PKs come from two different legacy tables whose references were reused verbatim as primary keys, so a bare `id` is not guaranteed unique across the union. `expandedRowKeys` uses the same composite form.

**Rationale**: matches the inventory catalog, the most-current table in the hub, and removes a nested header row that duplicated column labels inside every expanded transaction. Summarising on the parent mirrors the catalog's own behaviour (a collapsed acquisition merges its single item's data rather than rendering blanks).

## I4-4: System-wide violation sweep

| Page | Violation | Fix |
| --- | --- | --- |
| `pages/finance/portfolios/index.tsx` | View button; no row nav | Row link; **whole Actions column removed** (View gone per constitution, Close/Reopen moved to the detail panel, Edit/Delete already gone in iteration 2) |
| `pages/finance/balance-sheets/index.tsx` | View button; no row nav | Remove View; row link; Edit (→ `/edit`, a *different* target) and Delete stay |
| `pages/inventory/scenarios/index.tsx` | Name links but row does not navigate | Add row link (name `<Link>` stays) |
| Currencies, Accounts, Exchange Rates, Assets | — | Exempt: no detail page |
| `pages/inventory/catalog/index.tsx` | — | Exempt: rows have no detail page and parents only expand; the constitution explicitly excludes expand-only rows. Its caret gains `data-row-link-ignore` defensively |

`common.view` and `EyeOutlined` become dead in `pages/` — the locale key is retained only if still referenced elsewhere, otherwise removed from both locale files.

---

# Iteration 5 research (2026-08-16) — constitution v1.26.0 + data model + charts

## I5-1: The `autoWidth` column contract (PageTable owns sizing)

**Decision**: `PageTable` gains per-column `autoWidth`:

```ts
autoWidth?: {
  header: string;                                  // text to measure for the header
  measure?: (record: T) => string | null | undefined;  // text the CELL renders
  min?: number;
  max?: number;
}
```

`PageTable` computes `width = clamp(max(widthForHeader(header), max_rows(measureTextWidth(text))), min, max)` for every such column and derives `scroll.x` itself. `measure` defaults to reading `dataIndex` off the record.

**Why `header` is explicit rather than read from `title`**: `makeSortProps` sets `title` to a ReactNode (label + sort carets), so the string is not recoverable from the column. The page already holds that label when it calls `makeSortProps(field, label, sort)`, so passing it once more is a declaration, not a new duplication.

**Why `measure` exists**: columns that render something other than the raw field (formatted amounts, tags, composed cells) must still declare the text they draw. That is intent, not a measurement loop — the constitution permits "optionally how to read the value" and forbids the per-row `dataWidths` accumulation.

**Rationale**: eleven pages carried eleven copies of the same recipe across 81 call sites, and the copies drifted exactly where it mattered (the clamp, and the truncation that must accompany it). One implementation inside the component makes correct sizing the default.

**Alternatives considered**: (a) measuring the DOM after render with a ResizeObserver — accurate but reflow-heavy and racy against AntD's own sizing; (b) keeping helpers and adding a lint rule — leaves the orchestration duplicated, so the next page still gets it wrong; (c) deriving header text from `columnDefs` — PageTable does not receive them and threading them adds a second source of truth.

## I5-2: Two-line clamp (`ClampedText`)

**Decision**: new shared `components/ClampedText/` rendering `-webkit-line-clamp: 2` + `overflow: hidden`, wrapped in a `Tooltip` whose title is populated ONLY when truncated. Truncation is detected by **`scrollHeight > clientHeight`** — the existing `OverflowTooltip` compares `scrollWidth`/`clientWidth`, which cannot see a clamped second line. `OverflowTooltip` stays as-is for genuinely single-line cells.

**Rationale**: measured failure — the Portfolios description column capped at 280px with untruncated text rendered 69px three-line rows whose content still overflowed to 356px. A max-width without truncation is not a narrower column, it is a taller row.

## I5-3: Closed-portfolio freeze — enforced in the backend

**Decision**: a `closed` portfolio rejects every mutation but reopening. Enforcement lives in the **serializers/viewsets**, not the UI:
- `TransactionSerializer.validate()` already blocks *creating* against a closed portfolio; extend to **update and delete** (`TransactionViewSet.update/partial_update/destroy` → 400 when `instance.portfolio.state == 'closed'`).
- `PortfolioUpdateSerializer.validate()` rejects any field change while `state == 'closed'` **except** a change that sets `state` back to `active` (otherwise a closed portfolio could never be reopened).
- Portfolio DELETE is unaffected (removal is not an update; FR-010 still guards it).
The UI disables New/Edit/Delete transaction controls and the panel's Edit action so the block is visible before it is attempted.

**Gotcha to encode in tests**: the reopen path must be permitted by the same validator that blocks everything else — the natural "reject all writes when closed" one-liner also bricks the portfolio, which is why FR-026 names Reopen explicitly.

## I5-4: Charts — waterfall + breakdown (Principle X/XI compliant)

**Decision**: an AntD `Card` with `tabList` (Principle XI mandates the tabbed Card when a page has both a chart and a table section), `ReactECharts` with `opts={{ renderer: 'svg' }}` and `notMerge`, wrapped in `<div style={{ overflowX: 'auto' }}>` with `minWidth: 600` (Principle X).

- **Waterfall**: cumulative Value Change over the portfolio's transactions in chronological order. ECharts idiom = a transparent "base" bar series stacked under the visible delta series; rising and falling steps get distinct colors.
- **Breakdown**: bar of summed Value Change per asset (≤5 assets per portfolio in the real data).
- Both plot **Value Change only**. Asset amounts are unit-incomparable (419 shares vs 6.7e-8 ETH) and MUST never share an axis.
- Transfers with `value_change = null` (223 of 837 — the position-only legs) are excluded, and the card states so.
- Sums use `Decimal`, matching the iteration-4 net-value fix.

**Data shape measured before designing**: ≤53 transactions per portfolio (median **2**), ≤5 distinct assets. So the charts must degrade gracefully — a median portfolio yields a two-step waterfall — and an empty state is the common case, not an edge case.

**Scale caveat**: the charts summarise the transactions currently loaded by the panel's query (which is paginated and filter/search-scoped), so what they show always matches the table beneath them. That is stated in the card rather than silently implied.

---

# Iteration 6 research (2026-08-16) — PnL, holdings, header defect

## I6-1: Aggregates are computed in the BACKEND, over all transfers

**Decision**: `PortfolioViewSet.get_queryset()` annotates three sums and the serializer exposes them read-only:

```python
value_invested  = Sum("transactions__transfers__value_change", filter=Q(...__lt=0))
value_returned  = Sum("transactions__transfers__value_change", filter=Q(...__gt=0))
net_value_change = Sum("transactions__transfers__value_change")
```

`net_value_change` joins `ordering_fields` so the list column sorts.

**Rationale — this is a correctness requirement, not an optimisation.** The transactions panel is paginated at 25 rows and the largest portfolio has 49 transactions, so any frontend sum would silently report roughly half the truth. The iteration-5 charts already carry this caveat (they summarise the loaded page by design, stated in the card); PnL must NOT, because a wrong PnL looks exactly like a right one. It also keeps the list column O(1) queries instead of fetching every transfer for 55 portfolios.

**Gotcha**: a portfolio with no transfers annotates `NULL`, not `0` — the difference between "no data" and "nets to zero" must survive to the UI, which renders `<EmptyValue />` for the former.

**Second gotcha**: summing a `Sum` across the join multiplies rows if another multi-valued join is present. Only one relation is traversed here, so no `distinct` is needed — but the tests assert the aggregate against a direct DB sum so any future join bug shows up immediately.

## I6-2: Realized vs open — vocabulary, not just formatting

**Decision**: the figure `net_value_change` is presented as:
- **closed** → "Realized PnL", one number;
- **open** → "Invested / Returned / Net invested" plus held positions and an explicit note that unrealized PnL needs market prices.

The word "PnL" never appears on an open portfolio.

**Rationale**: measured against the real data, `[Active] 永豐 DCA TW.00918` nets −474,391 TWD from 49 purchases and **zero sales** — that figure is deployed capital. Labelling it "unrealized PnL" would state a 474k loss that did not happen. The 50 closed portfolios total +2,737, where the same arithmetic genuinely is profit. (Note also that a cross-portfolio total is meaningless: base currencies differ, and an earlier −1,283,062 figure quoted in discussion was invalid precisely because it added TWD to USD.)

## I6-3: Holdings endpoint

**Decision**: `GET /api/v1/finance/portfolios/{id}/holdings/` → `[{ asset_id, asset_name, quantity }]`, grouping transfers by asset, summing `asset_change_amount`, and omitting assets whose net is exactly zero.

**Rationale**: the "still holding" line needs all transfers, same pagination argument as I6-1. A dedicated action keeps it off the list endpoint (55 portfolios × their assets) while giving the detail panel one cheap call. Zero-net assets are omitted because a fully exited position is not a holding.

**Splits fall out for free** (FR-035): a 2:1 split is `+N` units with no Value Change, so the holding doubles and every PnL figure is untouched. No split entity — the 223 imported `UPDATE_POSITION` legs already have exactly this shape.

## I6-4: The empty-header defect

**Cause**: in the iteration-4 merged column set, `title` was only ever set by `makeSortProps` (timestamp) or explicitly (actions). The five columns added for the tree — `description`, `asset`, `asset_change`, `value_change`, `remark` — declared `key`/`render` but no `title`, so AntD rendered empty `<th>`s. Verified live: `["", "Time", "", "", "", "", "", "Actions"]`.

**Fix**: give every column an explicit `title`; the caret stays deliberately blank. **Guard**: a test asserting that every header except the caret is non-empty, so the next merged column set cannot repeat this (FR-030/SC-014). The same guard is cheap to apply to any table and belongs with the panel's tests.

---

# Iteration 7 research (2026-08-16) — Transfer redesign, charts, modal

## I7-1: The corrected Transfer model (breaking)

**Decision** (user's design):

```python
class Transfer:
    transaction          FK Transaction
    pnl_change           Decimal(38,18) NULL   # optional; portfolio base currency
    currency             FK Currency    NULL   # a CASH leg …
    currency_amount      Decimal(38,18) NULL   # … and how much of it
    asset                FK Asset       NULL   # a POSITION leg …
    asset_change_amount  Decimal(38,18) NULL   # … and the signed quantity
    # CheckConstraint: exactly one of (currency, asset) is set
```

Cash and positions are now distinguished **structurally**, not by the convention
"value present, amount absent" that I invented in iteration 3. `value_change` is
renamed `pnl_change` to match the vocabulary the UI and charts already use.

**Why the old shape was wrong**: it forced 新台幣/美元 to exist as Asset rows so
cash could be recorded at all — which is exactly the currency/asset conflation
the user warned about before the migration started. The measured cost of that
mistake: 2 bogus Asset rows and 301 transfers carrying the same number twice
(for TWD, `asset_change_amount` and `value_change` are byte-identical).

**Three-way semantics fall out of the model** and drive the chart palette
(FR-041): a leg with negative PnL is **cost/fee** (red), positive PnL is
**income** (green), and an asset leg with no PnL is **position** (grey).

## I7-2: Migration of real data (301 transfers, 2 assets)

Order matters, and a snapshot is taken first:

1. Schema: add `currency`/`currency_amount`, rename `value_change` → `pnl_change`,
   make `asset`/`asset_change_amount` nullable, drop `remark`.
2. Data: for transfers whose asset is a legacy settleable currency (新台幣→TWD,
   美元→USD) set `currency`, move the quantity to `currency_amount`, clear
   `asset`/`asset_change_amount`, keep `pnl_change` untouched.
3. Delete the two currency Assets (now unreferenced).
4. Add the CheckConstraint **last** — it cannot hold mid-migration.

**Guard**: the data migration is written as a Django data migration so it runs
exactly once per database and is verifiable in isolation, with a test that
asserts `pnl_change` totals are identical before and after (SC-019).

**`remark` removal is verified lossless**: 29 of 36 values are 手續費 (conveyed by
the red cost/fee colour) and the remaining 7 are byte-identical to their own
transaction's `description`.

**Importer** must map `is_settleable` legacy assets to currency legs rather than
creating Asset rows, otherwise a re-run reintroduces exactly what this iteration
removes.

**Belt and braces** (FR-038): `AssetSerializer.validate_name` rejects a name or
symbol matching any Currency code or name, so the conflation cannot return by
hand either.

## I7-3: Charts

- **One panel, two tabs** (PnL, Trend) replacing the separate value and chart
  panels — AntD `Card` + `tabList`, as Principle XI already requires.
- **PnL tab**: a line chart mirroring the Balance Sheets equity curve; the last
  point equals the portfolio's realized (closed) or net-to-date (open) PnL, so
  the chart and the headline figure can never disagree.
- **Trend tab**: one x point per transaction, three y series — cost (red),
  income (green), position (grey). Negative values are plotted **as negatives**
  so bars grow downward; taking absolute values would hide direction, which is
  the whole point of the chart. A **Waterfall** toggle switches between
  cumulative (running total, transparent base bar) and plain per-transaction
  bars.
- Position is per asset (clarified): one grey series per asset.
- Currency symbols come from the existing `getCurrencySymbol` in
  `@/utils/finance` — the same helper the Balance Sheets list uses.

## I7-4: Transaction table and modal

- Column order **Time, PnL, Position, Description**; Remark gone.
- A **transaction** row shows accumulated balances (PnL as one figure with a
  symbol, e.g. `+ NT$ 666`; Position per asset); a **transfer** row shows only
  its own change (`+123 0050.TW`). Accumulation is chronological within the
  loaded page and stated as such.
- **Modal (FR-045)**: the current `Modal` uses AntD's default footer, which
  right-aligns `[Cancel][OK]` — a Principle VI violation (primary right, all
  others grouped LEFT, Cancel left-most). The fix reuses the same footer shape
  `confirmDialog` already implements. The body splits into **General** and
  **Transfers** tabs, transfer rows become a **table** (they currently overflow
  a 640px modal as a `Space` list), and "Add transfer" becomes a `type="link"`
  button.

---

# Iteration 9 research (2026-08-25) — chart polish, position badges, accumulated vs change columns

## I9-1: Blank Position header — fix the class, not the instance

**Decision**: `resolveAutoWidths` (PageTable) defaults a column's `title` to
its `autoWidth.header` when the column declares no `title`.

**Rationale**: the Portfolios list `holdings` column declares
`autoWidth: { header: 'Position' }` and nothing else, so the header text is
known to the table but never rendered — the third occurrence of the
iteration-6 defect (5 blank headers then, 1 now). Every previous fix added a
`title` to the offending column; the header text already lives on the column,
so the component can supply it and a page cannot forget again. `makeSortProps`
columns keep their ReactNode title (label + carets) because it is set
explicitly; the default only fills a missing one.

**Alternatives**: add `title` on the one column (fixes one instance; the
memory note "shared helpers need shared orchestration" says this is how the
drift happens) — rejected.

## I9-2: Holdings as badges, through the pricing component

**Decision**: a shared `HoldingTags` component (portfolios folder, used by the
list and the detail table) renders one default AntD `<Tag>` per asset holding
`<Price value={quantity} asset={name} plain mutedUnit />`; tags wrap in the
cell. `<Price>` gains `mutedUnit`, which renders the unit in the secondary
text tone in its own span.

**Rationale**: a comma-separated clamped string of `2145 00918.TW, 20 0050.TW`
puts numbers and tickers in one tone and one run, which is what the user could
not read. Foreign-key values render as tags (Principle VI); the quantity is a
balance (unsigned) whose colour carries no direction, so it takes the strong
tone and the asset name the muted one. Principle XIII forbids composing the
amount around the component, so the two-tone rendering is a component
variant, not a page-level template.

**Alternatives**: coloured tags per asset (rejected — colour would imply
meaning, and the FK-tag rule specifies the default appearance); `ClampedText`
over tag markup (rejected — a clamp cannot ellipsize a row of tags cleanly;
≤5 assets per portfolio in the real data wrap within two lines at the
column's 360px cap).

## I9-3: One chart tooltip builder, shared with Balance Sheets

**Decision**: `components/Price/chartTooltip.ts` (pure, React-free) exports
`chartTooltipHtml(title, rows)`, `seriesMarker(color)` and
`pinnedAxisTooltip(maxWidth)` — the bold date title, the two-column table with
a right-aligned tabular value cell, and the `appendToBody` + custom `position`
callback that pins the box to the active x value inside the chart container.
Balance-sheets list (both charts) and detail call it; every value passes
through `formatMoney` / `moneyFormatter`.

**Rationale**: the user asked for the portfolio tooltips to match the Balance
Sheets one; "match" is only guaranteed by one implementation. The builder
belongs beside the normalizers because the value cell is where Principle XIII
was broken three times (the hand-copied `sym + amount` closures). Moving the
balance-sheets charts onto it retires those closures, the 0dp axis formatter
and the `#ff4d4f`/`#52c41a` pair in the same edit — the chart half of
iteration 8's open T505.

**Alternatives**: copy the balance-sheets formatter into the portfolio module
(a fourth copy — rejected); ECharts' default tooltip with `valueFormatter`
(what ships today: no date title, cursor-following, and it cannot format the
waterfall's signed deltas — rejected).

## I9-4: Whole-portfolio accumulation via one unpaginated fetch

**Decision**: the detail page issues a second query for ALL of the
portfolio's transactions (`filters: portfolio eq id`, `ordering:
'timestamp,created_at'`, `limit: 500`) and derives the running totals and both
chart series from it, mapping the totals onto the table's rows by transaction
id. The table keeps its own paginated, user-sorted query.

**Rationale**: "Accumulated PnL" over the newest 25 of 53 transactions is not
partial, it is wrong — and the note that disclosed the page scope is being
removed at the user's request. Measured: 3 of 55 real portfolios exceed the
25-row page; the largest has 53; the backend cap is 500. The frontend already
owns the Decimal accumulation and the chart builders, so the smallest change
that makes the label true is to feed them the complete set. React Query
dedupes and the existing `['finance','transactions']` prefix invalidation
covers the new key.

**Known bound**: a portfolio beyond 500 transactions would lose its OLDEST
rows and the totals would drift. Recorded here rather than guarded, because
the real data is an order of magnitude below the cap and a server-side
window-function design (the alternative) is not justified by three
portfolios. If that ever changes, the backend annotates `accumulated_pnl` per
row and exposes a series action; the frontend contract (a chronological array
of transactions) stays the same.

**Alternatives**: backend window annotations + a `/series/` action (correct,
but a new endpoint, OpenAPI regen, per-asset JSON aggregation — deferred as
above); keep page scope and re-add the note (rejected — the user removed it).

## I9-5: Trend "Position" is money, not quantity

**Decision**: `trendPoints().position = −(cost + income)` per transaction, in
the portfolio's base currency; `trendOption` has ONE y-axis; the grey series
keeps the label "Position". In Waterfall mode its running total is the
capital currently deployed (net invested).

**Rationale**: the shipped series sums `asset_change_amount` across whichever
assets a transaction touches — units that cannot be added. Against the real
data 119 of 359 transactions plot a negative grey bar next to a red cost bar
(e.g. −1,579 PT-sUSDE +1,256 DAI nets −323; a 2,014 USDT cost plots −2,014),
which is the complaint "position bars should have positive values — opposite
to cost". The only definition that is *opposite to cost* for every
transaction and lives in one unit is the double-entry mirror of the cash
flow: what left as cost entered the position, what returned as income left
it. It also removes the second axis, whose existence was the symptom (shares
and dollars on one chart).

**Alternatives**: per-asset quantity series (Session 2026-08-16c's answer —
rejected for the chart: a USDT-for-ETH purchase still plots one large
negative bar, so it cannot satisfy the stated expectation); `−cost` only
(rejected — a sale would plot no position movement at all); absolute values
(rejected — FR-043 forbids hiding the sign).

## I9-6: Accumulated vs Tx change columns — a strict split

**Decision**: columns Time, Accumulated PnL, Accumulated Position, Tx PnL
Change, Tx Position Change, Description, Actions. Parent rows fill only the
two accumulated columns; transfer rows fill only the two change columns; a
cash leg leaves Tx Position Change empty. Locale keys
`col.accumulatedPnl` / `col.accumulatedPosition` / `col.txPnlChange` /
`col.txPositionChange` replace `col.pnl` / `col.position` in both locales.

**Rationale**: the user specified the split ("accumulation columns are for
transactions, change columns are for transfers"); with both kinds of figure
in one column, a reader had to know the row type to know what a number meant.
The pairing order (accumulated pair, then change pair) follows the order the
user listed them and keeps the parent row's figures nearest the timestamp.
FR-022's stale "collapsed row summarises its transfers" clause is retired in
the spec — a parent shows balances, never a summary.

**Alternatives**: parent rows also showing their own net change in the Tx
columns (rejected — contradicts the directive and the Tx column would then
mean two things); interleaving accumulated/change per metric (rejected —
cosmetic, and the strict row split makes the pairs read as blocks).
