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
