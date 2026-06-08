# Tasks: Finance Portfolio Management

**Input**: Design documents from `specs/013-finance-portfolio-management/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/api.md ✅

**TDD**: Backend tests MUST be written first and MUST fail before implementation (Constitution Principle V).

**Organization**: Grouped by user story — US1 (Assets), US2 (Portfolios), US3 (Transactions + Transfers). US4 (migration) is deferred.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable — different files, no dependency on incomplete tasks
- **[Story]**: User story label (US1/US2/US3)

---

## Phase 1: Setup

**Purpose**: Test infrastructure and signal plumbing that all stories depend on.

- [ ] T001 Create test directory `apps/unihub/backend/tests/finance/` with `__init__.py` (create if not already present)
- [ ] T002 Ensure `apps/unihub/backend/finance/apps.py` has a `FinanceConfig` class with a `ready()` method stub (for signal registration in US3)

---

## Phase 2: Foundational

**Purpose**: No shared blockers beyond Phase 1. Each user story below is independently startable after Phase 1.

**⚠️ NOTE**: Because Transfer has foreign keys to both Asset and Transaction, the migration for US3 depends on migrations from US1 and US2. Implement in strict story order: US1 → US2 → US3.

---

## Phase 3: User Story 1 — Manage Assets (Priority: P1) 🎯 MVP

**Goal**: Users can create, view, edit, and delete assets. Assets are the foundational entity referenced by transfers.

**Independent Test**: Navigate to `/finance/assets` — create an asset, edit it, attempt to delete it (unblocked deletion succeeds; deletion of an asset referenced by a transfer returns a 409 with a clear message).

### Backend — US1

- [ ] T003 [US1] Write failing pytest-django tests for the Asset API (happy path CRUD + 409 on protected delete) in `apps/unihub/backend/tests/finance/test_assets.py`
- [ ] T004 [US1] Add `Asset` model (`id`, `name`, `category`, `created_at`, `updated_at`) to `apps/unihub/backend/finance/models.py` following existing nanoid + timestamp conventions
- [ ] T005 [US1] Generate and apply Django migration for the Asset model: `uv run python manage.py makemigrations finance` → `uv run python manage.py migrate`
- [ ] T006 [US1] Add `AssetSerializer` to `apps/unihub/backend/finance/serializers.py` (writable: `name`, `category`; read-only: `id`, `created_at`, `updated_at`)
- [ ] T007 [US1] Add `AssetViewSet` to `apps/unihub/backend/finance/views.py` — include `EntityFilterBackend`, `NullsOrderingFilter`, `EntityOffsetPagination`, `filterable_fields`, and catch `ProtectedError` in `destroy()` returning `HTTP 409`
- [ ] T008 [US1] Register `assets/` route in `apps/unihub/backend/finance/urls.py` and verify it appears in `unihub/urls.py` include
- [ ] T009 [US1] Verify all backend tests for US1 pass: `uv run ruff check . && uv run pytest tests/finance/test_assets.py`

### Frontend — US1

- [ ] T010 [P] [US1] Add `pages.finance.assets.*` i18n keys (title, create button, name column, category column, delete confirm) to `apps/unihub/frontend/src/locales/en-US/pages.ts` AND `apps/unihub/frontend/src/locales/zh-TW/pages.ts` in the same edit
- [ ] T011 [P] [US1] Add `Asset` interface and `listAssets`, `createAsset`, `updateAsset`, `deleteAsset` service functions to `apps/unihub/frontend/src/services/unihub-backend/finance.ts`
- [ ] T012 [US1] Implement `AssetsPage` in `apps/unihub/frontend/src/pages/finance/assets/index.tsx` — PageTable with toolbar (EntityToolbar / useEntityFilter / useEntitySort / useColumnConfig), create/edit Modal with Form, `Modal.confirm` with `okType: 'danger'` before delete, empty-cell placeholder `<Typography.Text type="secondary">—</Typography.Text>`, `useQuery` + `useMutation` from TanStack React Query
- [ ] T013 [US1] Add `/finance/assets` route to the app router and add the Assets nav item to `apps/unihub/frontend/src/components/AppShell.tsx` under the Finance section using a `menu.finance.assets` i18n key

**Checkpoint ✅ US1**: Assets page is fully functional and independently testable. Run: `pnpm lint && pnpm typecheck && pnpm test`

---

## Phase 4: User Story 2 — Manage Portfolios (Priority: P2)

**Goal**: Users can create portfolios (with an immutable base currency and initial active state), toggle them between active and closed, view them sorted by most-recently-active first, and delete them when empty.

**Independent Test**: Navigate to `/finance/portfolios` — create a portfolio, verify `base_currency` field is read-only on edit, mark it as closed then reopen it, attempt to delete a portfolio that has transactions (409 expected), verify list sorts by `last_transaction_time` descending.

### Backend — US2

- [ ] T014 [US2] Write failing pytest-django tests for the Portfolio API (CRUD, immutable base_currency, state toggle, 409 on protected delete) in `apps/unihub/backend/tests/finance/test_portfolios.py`
- [ ] T015 [US2] Add `Portfolio` model (`id`, `name`, `base_currency`, `state`, `first_transaction_time`, `last_transaction_time`, `created_at`, `updated_at`) and `refresh_transaction_times()` aggregation method to `apps/unihub/backend/finance/models.py`; define `PORTFOLIO_STATE_CHOICES`
- [ ] T016 [US2] Generate and apply Django migration for the Portfolio model: `uv run python manage.py makemigrations finance` → `uv run python manage.py migrate`
- [ ] T017 [US2] Add `PortfolioCreateSerializer` (writable: `name`, `base_currency`, `state`) and `PortfolioUpdateSerializer` (writable: `name`, `state`; read-only: `base_currency`) to `apps/unihub/backend/finance/serializers.py`; validate `base_currency` exists in Currency table on create
- [ ] T018 [US2] Add `PortfolioViewSet` to `apps/unihub/backend/finance/views.py` — `get_serializer_class()` returns create vs update serializer by `self.action`; default ordering `[F('last_transaction_time').desc(nulls_last=True), '-created_at']`; catch `ProtectedError` in `destroy()` returning HTTP 409
- [ ] T019 [US2] Register `portfolios/` route in `apps/unihub/backend/finance/urls.py`
- [ ] T020 [US2] Verify all backend tests for US2 pass: `uv run ruff check . && uv run pytest tests/finance/test_portfolios.py`

### Frontend — US2

- [ ] T021 [P] [US2] Add `pages.finance.portfolios.*` i18n keys (title, create button, name, base currency, state, first/last transaction time columns, state toggle labels, delete confirm) to both locale files in the same edit
- [ ] T022 [P] [US2] Add `Portfolio` interface and `listPortfolios`, `createPortfolio`, `updatePortfolio`, `deletePortfolio` service functions to `apps/unihub/frontend/src/services/unihub-backend/finance.ts`
- [ ] T023 [US2] Implement `PortfoliosPage` in `apps/unihub/frontend/src/pages/finance/portfolios/index.tsx` — PageTable with `initialActiveRules = [{ field: 'last_transaction_time', direction: 'desc' }]`; create modal includes `base_currency` select; edit modal excludes `base_currency` (read-only display); state toggle action in table row; `first_transaction_time` and `last_transaction_time` columns display both absolute and relative time (dayjs `YYYY-MM-DD HH:mm` + `fromNow()`); `Modal.confirm` with `okType: 'danger'` before delete; FK values (`base_currency`, `state`) wrapped in `<Tag>`
- [ ] T024 [US2] Add `/finance/portfolios` route to the app router and add the Portfolios nav item to `apps/unihub/frontend/src/components/AppShell.tsx` under Finance using a `menu.finance.portfolios` i18n key

**Checkpoint ✅ US2**: Portfolios page is fully functional. Run: `pnpm lint && pnpm typecheck && pnpm test`

---

## Phase 5: User Story 3 — Record Transactions with Transfers (Priority: P3)

**Goal**: Users can create transactions (each with one or more transfers) against an active portfolio. Transfers appear as inline expandable rows in the Transactions table. Each transfer records a signed asset change amount and an optional Value Change in the portfolio's base currency.

**Independent Test**: Navigate to `/finance/transactions` — create a transaction against an active portfolio with two transfers (one with a Value Change, one without), expand the row to see inline transfers, attempt to create a transaction against a closed portfolio (error expected), edit a transaction replacing its transfers, delete a transaction (all transfers cascade-deleted).

### Backend — US3

- [ ] T025 [US3] Write failing pytest-django tests for the Transaction API (nested transfer CRUD, atomic write, closed-portfolio guard, cascade delete, portfolio timestamp update) in `apps/unihub/backend/tests/finance/test_transactions.py`
- [ ] T026 [US3] Add `Transaction` model (`id`, `portfolio` FK PROTECT, `timestamp`, `description`, `created_at`, `updated_at`) and `Transfer` model (`id`, `transaction` FK CASCADE, `asset` FK PROTECT, `asset_change_amount`, `value_change` nullable, `created_at`, `updated_at`) to `apps/unihub/backend/finance/models.py`
- [ ] T027 [US3] Create `apps/unihub/backend/finance/signals.py` with `update_portfolio_times` signal receiver on `post_save` and `post_delete` of Transaction (calls `instance.portfolio.refresh_transaction_times()`); register via `FinanceConfig.ready()` in `apps/unihub/backend/finance/apps.py`
- [ ] T028 [US3] Generate and apply Django migration for Transaction and Transfer models: `uv run python manage.py makemigrations finance` → `uv run python manage.py migrate`
- [ ] T029 [US3] Add `TransferSerializer` to `apps/unihub/backend/finance/serializers.py` (writable: `asset`, `asset_change_amount`, `value_change`; read-only: `id`, `asset_name` denormalized, `created_at`, `updated_at`)
- [ ] T030 [US3] Add `TransactionSerializer` to `apps/unihub/backend/finance/serializers.py` with nested `transfers = TransferSerializer(many=True)`; `validate()` checks portfolio is active and transfers list is non-empty; `create()` and `update()` wrapped in `transaction.atomic()`; `update()` uses full-replace strategy for transfers; include `portfolio_name` as denormalized read-only field
- [ ] T031 [US3] Add `TransactionViewSet` to `apps/unihub/backend/finance/views.py` — `filterable_fields` includes `portfolio` (exact), `timestamp` (date), `description` (icontains); default ordering `['-timestamp']`
- [ ] T032 [US3] Register `transactions/` route in `apps/unihub/backend/finance/urls.py`
- [ ] T033 [US3] Verify all backend tests for US3 pass: `uv run ruff check . && uv run pytest tests/finance/test_transactions.py`

### Frontend — US3

- [ ] T034 [P] [US3] Add `pages.finance.transactions.*` i18n keys (title, create button, portfolio, timestamp, description, asset, asset change amount, value change with `{currency}` placeholder, transfer count column, delete confirm) to both locale files in the same edit; add `menu.finance.transactions` nav key to both locale files
- [ ] T035 [P] [US3] Add `Transaction`, `Transfer` interfaces and `listTransactions`, `createTransaction`, `updateTransaction`, `deleteTransaction` service functions to `apps/unihub/frontend/src/services/unihub-backend/finance.ts`; `Transfer` includes `asset_name` (denormalized) and nullable `value_change`
- [ ] T036 [US3] Implement `TransactionsPage` in `apps/unihub/frontend/src/pages/finance/transactions/index.tsx`:
  - PageTable with `expandable.expandedRowRender` showing a `ProTable ghost` of transfers per row
  - Transfer columns: asset name (as `<Tag>`), asset change amount, Value Change (`pages.finance.transactions.valueChange` with `{currency}` = parent transaction's portfolio base currency), empty-cell placeholder for null value_change
  - Create/edit modal includes portfolio select, timestamp picker, description field, and a dynamic transfer list editor (add/remove rows; each row: asset select, asset_change_amount input, optional value_change input)
  - Value Change field label derived from selected portfolio's `base_currency`: `"Value Change (USD)"`
  - `Modal.confirm` with `okType: 'danger'` before transaction delete
  - `timestamp` column displays both absolute and relative time (dayjs `YYYY-MM-DD HH:mm` + `fromNow()`)
- [ ] T037 [US3] Add `/finance/transactions` route to the app router and add the Transactions nav item to `apps/unihub/frontend/src/components/AppShell.tsx` under Finance using `menu.finance.transactions` i18n key

**Checkpoint ✅ US3**: Transactions page with inline transfer rows is fully functional. Run: `pnpm lint && pnpm typecheck && pnpm test`

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T038 Regenerate OpenAPI schema from backend: `uv run python manage.py spectacular --file openapi.yaml` from `apps/unihub/backend/`; commit updated `openapi.yaml`
- [ ] T039 [P] Run full backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . --fix && uv run pytest`
- [ ] T040 [P] Run full frontend quality loop from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test`
- [ ] T041 Verify Finance domain existing pages (Accounts, Balance Sheets, Exchange Rates, Currencies) remain fully functional — smoke-test each page in the browser (Constitution Principle II compliance check)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    └── Phase 2 (Foundational — no-op, included in US phases)
            ├── Phase 3 (US1 — Assets)     ← start here
            ├── Phase 4 (US2 — Portfolios) ← start after US1 backend is done (migration dependency)
            └── Phase 5 (US3 — Transactions) ← start after US1 + US2 backend are done
                        └── Phase 6 (Polish)
```

### Migration Chain (must be sequential)

1. US1 migration: `Asset`
2. US2 migration: `Portfolio`
3. US3 migration: `Transaction`, `Transfer` (depends on Asset + Portfolio migrations)

### Within Each User Story

```
Backend tests (write first, must fail) →
Model definition →
Migration →
Serializer(s) →
ViewSet →
URL registration →
Backend quality loop passes →
[Frontend tasks T010/T011, T021/T022, T034/T035 can run in parallel] →
Page component →
Router + nav →
Frontend quality loop passes
```

### Parallel Opportunities

Within US1: T010 (i18n) and T011 (service) can be written in parallel once backend API is stable.
Within US2: T021 (i18n) and T022 (service) can be written in parallel.
Within US3: T034 (i18n) and T035 (service) can be written in parallel.
T039 (backend quality) and T040 (frontend quality) in Phase 6 can run in parallel.

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Phase 1: Setup (T001–T002)
2. Phase 3: US1 backend (T003–T009) → frontend (T010–T013)
3. **Stop and validate**: Assets page CRUD works end-to-end
4. Proceed to US2 when ready

### Incremental Delivery

1. US1 complete → Assets page live
2. US2 complete → Portfolios page live (depends on US1 migration)
3. US3 complete → Transactions + inline Transfers live (depends on US1 + US2 migrations)
4. Phase 6: Polish → regenerate schema, quality loops, existing-page smoke test

---

## Notes

- `[P]` tasks touch different files and have no incomplete dependencies — safe to parallelize
- Every US backend phase follows TDD: write failing test → implement → verify green
- `Modal.confirm` with `okType: 'danger'` is NON-NEGOTIABLE on every delete action (Constitution Dev Constraints)
- All user-facing strings go through `formatMessage` — never hardcoded (Constitution Principle VIII)
- `ProTable ghost` (not PageTable) inside `expandedRowRender` (Constitution Principle VII)
- `Tag` wrapper for FK display values: `base_currency`, `state`, `asset_name` in transfer rows (Constitution Principle VI)
- Empty-cell placeholder: `<Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>` (Constitution Principle VI)
- Datetime columns: `dayjs(val).format('YYYY-MM-DD HH:mm')` + `dayjs(val).fromNow()` (Constitution Principle VI)
