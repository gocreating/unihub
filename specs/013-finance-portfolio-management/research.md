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
