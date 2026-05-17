---
description: "Task list for UniHub Project Bootstrap"
---

# Tasks: UniHub Project Bootstrap

**Input**: Design documents from `specs/001-project-bootstrap/`

**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story this task delivers (US1–US4)
- All decimal values in Finance domain use `DecimalField` + `coerce_to_string=True` on backend; `decimal.js` on frontend

---

## Phase 1: Setup

**Purpose**: Scaffold the monorepo structure and containerization before any code is written.

- [X] T001 Create directory structure per plan.md: `apps/unihub/backend/` and `apps/unihub/frontend/` with subdirectories for `core/`, `finance/`, `health/`, `tests/`
- [X] T002 [P] Initialize Django project (`unihub`) with uv in `apps/unihub/backend/`: run `uv init`, add Django 5.x, DRF, drf-spectacular, psycopg2-binary, gunicorn, httpx to `pyproject.toml`
- [X] T003 [P] Initialize Vite + React + TypeScript frontend with pnpm in `apps/unihub/frontend/`: run `pnpm create vite`, add Ant Design 5, @ant-design/pro-components, TanStack React Query 5, React Router 7, decimal.js to `package.json`
- [X] T004 Create `apps/unihub/docker-compose.local.yml` with `db` (PostgreSQL 16) and `backend` services
- [X] T005 [P] Create `apps/unihub/.env.example` with all required vars: `SECRET_KEY`, `POSTGRES_*`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`
- [X] T006 [P] Create `apps/unihub/backend/Dockerfile` (python:3.12-slim base, uv install, gunicorn entrypoint)
- [X] T007 [P] Create `apps/unihub/backend/entrypoint.sh` (wait for DB, run migrations, exec gunicorn)

**Checkpoint**: `docker compose -f apps/unihub/docker-compose.local.yml up db -d` succeeds; backend container builds without errors.

---

## Phase 2: Foundational

**Purpose**: Backend infrastructure and frontend shell that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Backend Foundation

- [X] T008 [P] Create NanoID utility in `apps/unihub/backend/core/nanoid.py`: add `nanoid` to `pyproject.toml`; implement `generate_id()` using alphabet `string.ascii_letters + string.digits` (no underscores/dashes), length 12; this function is used as `default=` on all model `id` fields project-wide
- [X] T009 Configure `apps/unihub/backend/unihub/settings.py`: `INSTALLED_APPS` (rest_framework, drf_spectacular, django.contrib.contenttypes, core, finance, health), `DATABASES` (PostgreSQL from env), `REST_FRAMEWORK` (session auth, DRF decimal coerce_to_string default), `CORS_ALLOWED_ORIGINS`
- [X] T009 Create `apps/unihub/backend/health/views.py` and `health/urls.py` with `GET /api/v1/health/` returning `{"status": "ok"}`; register in `unihub/urls.py`
- [X] T010 Create auth endpoints in `apps/unihub/backend/unihub/auth/views.py`: `POST /api/v1/auth/login/`, `POST /api/v1/auth/logout/`, `GET /api/v1/auth/me/`; register in `unihub/urls.py`
- [X] T011 Create `apps/unihub/backend/core/models.py` with `AttributeDefinition` (`id = CharField(12, pk, default=generate_id)`, content_type FK, name, data_type choices, is_system, display_order, options JSONField) and `AttributeValue` (`id = CharField(12, pk, default=generate_id)`, attribute_definition FK, content_type FK, `object_id = CharField(12)` — NOT PositiveIntegerField — plus GenericForeignKey, value TextField); add `UNIQUE` and `Index` constraints per data-model.md
- [X] T012 Create initial migration for `core` app: `apps/unihub/backend/core/migrations/0001_initial.py`
- [X] T013 [P] Configure drf-spectacular in `apps/unihub/backend/unihub/settings.py` and `urls.py`: expose schema at `GET /api/schema/` and Swagger UI at `GET /api/docs/`
- [X] T014 [P] Create `apps/unihub/backend/core/serializers.py` and `core/views.py` with `AttributeDefinitionViewSet` (list by content_type query param, create user-defined only, delete with `?confirm=true` two-step) and `AttributeValueViewSet` (list + bulk upsert for entity); register in `core/urls.py` and include in `unihub/urls.py`

### Frontend Foundation

- [X] T015 [P] Copy and adapt PageTable component from ov-fleet: create `apps/unihub/frontend/src/components/PageTable/index.tsx` (remove UmiJS `@umijs/max` imports; use React Router 7 `useNavigate` if needed; keep sticky-header/footer/scrollbar logic intact)
- [X] T016 [P] Copy `useStickyHeaderOffset.ts` to `apps/unihub/frontend/src/components/PageTable/useStickyHeaderOffset.ts` (56px header offset constant)
- [X] T017 Create `apps/unihub/frontend/src/layouts/AppShell.tsx` using ProLayout with `layout="side"`, fixed sidebar, logo/title in header, Finance nav entry; wrap children with `<Outlet />` for React Router 7
- [X] T018 Configure React Router 7 in `apps/unihub/frontend/src/main.tsx`: root route → AppShell, `/` → dashboard, `/finance/accounts` `/finance/balance-sheets` `/finance/exchange-rates` routes, `/login` route; wrap with `QueryClientProvider`
- [X] T019 Create API service skeleton: `apps/unihub/frontend/src/services/unihub-backend/index.ts` (export `API_BASE_URL = ''`), `auth.ts` (login, logout, getMe); add `generate-types` script to `apps/unihub/frontend/package.json` (`openapi-typescript http://localhost:8000/api/schema/ -o src/generated/api-types.ts`)
- [X] T020 Run `pnpm run generate-types` with backend running to produce initial `apps/unihub/frontend/src/generated/api-types.ts`; create `apps/unihub/frontend/src/services/unihub-backend/types.ts` re-exporting all Finance types

**Checkpoint**: Backend starts, `/api/v1/health/` returns 200, `/api/docs/` renders Swagger UI. Frontend dev server starts, AppShell renders with sidebar. Quality loop passes: `uv run ruff check . && uv run pytest` (backend); `pnpm lint && pnpm typecheck` (frontend).

---

## Phase 3: User Story 1 — Dashboard Shell (Priority: P1) 🎯 MVP

**Goal**: Authenticated user sees the dashboard shell and can navigate to the Finance domain.

**Independent Test**: Launch app → redirected to `/login` → log in → see AppShell with Finance in sidebar → click Finance → land on Finance accounts page.

- [X] T021 [P] [US1] Create login page in `apps/unihub/frontend/src/pages/auth/login.tsx`: form with username/password, calls `auth.login()`, redirects to `/` on success; show error on 400
- [X] T022 [US1] Add auth guard to router in `apps/unihub/frontend/src/main.tsx`: `useQuery(getMe)` on app load; redirect unauthenticated users to `/login`; redirect authenticated users away from `/login`
- [X] T023 [P] [US1] Create dashboard landing page in `apps/unihub/frontend/src/pages/dashboard/index.tsx`: simple welcome card with links to each domain section
- [X] T024 [US1] Verify acceptance scenarios: unauthenticated → login redirect; login → dashboard; sidebar Finance link → accounts page; back navigation works without full reload

**Checkpoint**: User Story 1 independently testable. Auth flow and navigation work end-to-end.

---

## Phase 4: User Story 2 — Manage Finance Accounts (Priority: P1)

**Goal**: User can create, view, edit, and delete financial accounts with name, type, and currency.

**Independent Test**: Create 3 accounts (one asset/USD, one liability/USD, one asset/TWD) → verify list shows all three with correct currency → edit one → delete one without balances → attempt delete with balances (when balances exist) → see cascade warning.

### Backend

- [X] T025 [P] [US2] Add `Account` model to `apps/unihub/backend/finance/models.py`: `id = CharField(12, pk, default=generate_id)`, `name` CharField(200), `account_type` CharField choices(asset/liability/equity), `currency` CharField(3), `created_at`/`updated_at` auto fields; ordering by `name`
- [X] T026 [US2] Create `apps/unihub/backend/finance/migrations/0001_initial.py` with Account table; add data migration `0002_seed_account_system_attrs.py` to seed system AttributeDefinitions for Account (name/text/0, account_type/single_select/1, currency/text/2) using ContentType
- [X] T027 [US2] Create `AccountSerializer` in `apps/unihub/backend/finance/serializers.py`: all system fields + `custom_attributes` (list of AttributeValue from GenericRelation); all DecimalField instances use `coerce_to_string=True`
- [X] T028 [US2] Create `AccountViewSet` in `apps/unihub/backend/finance/views.py`: ModelViewSet with list/create/retrieve/partial_update/destroy; `destroy` returns 400 with `affected_balance_count` if balances exist and `?confirm=true` not present; requires session auth
- [X] T029 [US2] Create `apps/unihub/backend/finance/urls.py` with router for AccountViewSet; include at `/api/v1/finance/` in `unihub/urls.py`
- [X] T030 [US2] Add integration tests in `apps/unihub/backend/tests/test_finance.py`: create account, list accounts, edit account, delete account without balances, delete account with balances (no confirm → 400, with confirm → 204)

### Frontend

- [X] T031 [P] [US2] Regenerate `apps/unihub/frontend/src/generated/api-types.ts` from updated schema
- [X] T032 [P] [US2] Add account service functions to `apps/unihub/frontend/src/services/unihub-backend/finance.ts`: `listAccounts`, `createAccount`, `updateAccount`, `deleteAccount` (with confirm param)
- [X] T033 [US2] Create Finance Accounts page in `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` using PageTable: columns for name, account_type, currency, actions; `widthForHeader` + `computeScrollX` for column sizing; TanStack Query for data fetching
- [X] T034 [US2] Add create/edit Account modal to `apps/unihub/frontend/src/pages/finance/accounts/index.tsx`: form with name (text), account_type (select), currency (text, ISO 4217 validated); optimistic update on save
- [X] T035 [US2] Add delete Account confirmation in `apps/unihub/frontend/src/pages/finance/accounts/index.tsx`: call DELETE without confirm first; if 400 with `affected_balance_count`, show warning dialog with count; on confirm re-call with `?confirm=true`

**Checkpoint**: User Story 2 independently testable. All account CRUD operations work including cascade-delete warning.

---

## Phase 5: User Story 2b — Balance Sheets (Priority: P1)

**Goal**: User can create balance sheets, enter account balances, and view per-currency net worth subtotals and base-currency total.

**Independent Test**: Create balance sheet "May 2026" (base USD) → enter balance for Chase Checking ($52,000) → enter balance for Mortgage ($200,000 liability) → net worth shows USD total ($-148,000); with TWD account added and exchange rate present, also shows TWD subtotal and base-currency total.

### Backend

- [X] T036 [P] [US2b] Add `BalanceSheet` and `Balance` models to `apps/unihub/backend/finance/models.py`: BalanceSheet (`id = CharField(12, pk, default=generate_id)`, date DateField, label CharField blank, base_currency CharField(3)); Balance (`id = CharField(12, pk, default=generate_id)`, account FK, balance_sheet FK, amount DecimalField(20,4), UNIQUE constraint); ordering BalanceSheet by `-date`
- [X] T037 [US2b] Create migration `apps/unihub/backend/finance/migrations/0003_balancesheet_balance.py` with BalanceSheet + Balance tables; add `0004_seed_balancesheet_system_attrs.py` to seed system AttributeDefinitions for BalanceSheet
- [X] T038 [US2b] Create `BalanceSheetSerializer` and `BalanceSerializer` in `apps/unihub/backend/finance/serializers.py`: `amount` uses `DecimalField(coerce_to_string=True, max_digits=20, decimal_places=4)` — never FloatField
- [X] T039 [US2b] Create `BalanceSheetViewSet` and nested balance endpoints in `apps/unihub/backend/finance/views.py`: BalanceSheet CRUD; `GET/PUT/DELETE balance-sheets/{id}/balances/{account_id}/` upsert balance; `GET balance-sheets/{id}/net-worth/` computes per-currency subtotals and closest-prior-rate base-currency total (see research.md Decision 3); missing-rate pairs returned in `missing_rates` list — never silently zeroed
- [X] T040 [US2b] Register balance sheet and balance URLs in `apps/unihub/backend/finance/urls.py`
- [X] T041 [US2b] Add integration tests in `apps/unihub/backend/tests/test_finance.py`: create balance sheet, enter balances, single-currency net worth correct, missing-rate flagged correctly

### Frontend

- [X] T042 [P] [US2b] Regenerate `apps/unihub/frontend/src/generated/api-types.ts`
- [X] T043 [P] [US2b] Add balance sheet, balance, and net worth service functions to `apps/unihub/frontend/src/services/unihub-backend/finance.ts`
- [X] T044 [US2b] Create BalanceSheet list page in `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` using PageTable: columns for date, label, base_currency; create/edit/delete modal; sorted by date desc
- [X] T045 [US2b] Create BalanceSheet detail page in `apps/unihub/frontend/src/pages/finance/balance-sheets/[id].tsx`: PageTable of all accounts with editable amount column (inline or modal); import `decimal.js` — use `new Decimal(amountString)` for all arithmetic, never `parseFloat`; display per-currency subtotals and base-currency total summary card below table; show missing-rate warning chips for uncovered currencies

**Checkpoint**: User Story 2b independently testable with same-currency accounts. Multi-currency total requires US2c exchange rates.

---

## Phase 6: User Story 2c — Exchange Rates (Priority: P1)

**Goal**: User records exchange rates between currency pairs at specific dates; balance sheet net worth total uses closest-prior rate.

**Independent Test**: Record "TWD→USD 0.030769 on 2026-04-01" and "TWD→USD 0.031000 on 2026-06-01" → balance sheet dated 2026-05-01 uses April rate (0.030769) → balance sheet dated 2026-07-01 uses June rate (0.031000).

### Backend

- [X] T046 [P] [US2c] Add `ExchangeRate` model to `apps/unihub/backend/finance/models.py`: `id = CharField(12, pk, default=generate_id)`, `from_currency` CharField(3), `to_currency` CharField(3), `rate` DecimalField(24,8), `date` DateField; `UNIQUE(from_currency, to_currency, date)`; ordering `-date`
- [X] T047 [US2c] Create migration `apps/unihub/backend/finance/migrations/0005_exchangerate.py`; composite unique constraint creates index for closest-prior-rate query
- [X] T048 [US2c] Create `ExchangeRateSerializer` in `apps/unihub/backend/finance/serializers.py`: `rate` uses `DecimalField(coerce_to_string=True, max_digits=24, decimal_places=8)`; validate `rate > 0` and valid ISO 4217 codes
- [X] T049 [US2c] Create `ExchangeRateViewSet` in `apps/unihub/backend/finance/views.py`: list (with from_currency/to_currency filter), create, partial_update, destroy; register in `finance/urls.py`; update net-worth view to use closest-prior-rate from ExchangeRate table
- [X] T050 [US2c] Add integration tests in `apps/unihub/backend/tests/test_finance.py`: exchange rate CRUD; closest-prior-rate selection with multiple rates on different dates; multi-currency net worth with rates present; missing-rate flagging when no rate exists before balance sheet date

### Frontend

- [X] T051 [P] [US2c] Regenerate `apps/unihub/frontend/src/generated/api-types.ts`
- [X] T052 [P] [US2c] Add exchange rate service functions to `apps/unihub/frontend/src/services/unihub-backend/finance.ts`: `listExchangeRates`, `createExchangeRate`, `updateExchangeRate`, `deleteExchangeRate`
- [X] T053 [US2c] Create ExchangeRate list page in `apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx` using PageTable: columns for from_currency, to_currency, rate (displayed as string, no parseFloat), date; create/edit/delete modal
- [X] T054 [US2c] Update BalanceSheet detail page `apps/unihub/frontend/src/pages/finance/balance-sheets/[id].tsx`: refresh net worth query on exchange rate changes; display missing-rate warning per currency using Ant Design Alert; show which exchange rate date was used for each conversion (tooltip or sub-row)

**Checkpoint**: User Story 2c independently testable. Full multi-currency net worth with closest-prior-rate selection verified end-to-end.

---

## Phase 7: User Story 3 — Customize Domain Attributes (Priority: P2)

**Goal**: User can add custom attributes to Finance Account entities and see/fill them in forms and table columns.

**Independent Test**: Open Finance → Accounts → Attribute Settings → add "Bank" (text) attribute → create new account → see "Bank" field in form → fill it in → verify it appears as a column in the accounts table → delete "Bank" attribute → confirm count warning → attribute and values removed.

### Backend

- [X] T055 [P] [US3] Update `core/views.py` `AttributeDefinitionViewSet` to enforce `is_system=True` delete protection (return 400 with clear message); ensure `DELETE ?confirm=true` path returns `affected_entity_count` before deletion
- [X] T056 [US3] Add integration tests in `apps/unihub/backend/tests/test_core.py`: create user-defined attr, list attrs for content_type, create+set AttributeValue, delete attr with values (confirm flow), reject delete of system attr

### Frontend

- [X] T057 [P] [US3] Regenerate `apps/unihub/frontend/src/generated/api-types.ts`
- [X] T058 [P] [US3] Add core service functions to `apps/unihub/frontend/src/services/unihub-backend/core.ts`: `listAttributeDefinitions(contentType)`, `createAttributeDefinition`, `deleteAttributeDefinition(id, confirm?)`, `bulkUpsertAttributeValues`
- [X] T059 [US3] Create AttributeManagementPanel component in `apps/unihub/frontend/src/components/AttributeManagementPanel/index.tsx`: shows system attrs (read-only) and user-defined attrs (add/delete); delete triggers count-warning confirm dialog; accepts `contentType` prop for domain-agnostic reuse
- [X] T060 [US3] Add AttributeManagementPanel to Accounts page in `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` (drawer or settings tab); dynamically add custom attribute columns to PageTable when user-defined attrs exist
- [X] T061 [US3] Update Account create/edit modal to render user-defined attribute fields (text, number, date, boolean, single_select) alongside system fields in `apps/unihub/frontend/src/pages/finance/accounts/index.tsx`; call `bulkUpsertAttributeValues` after save

**Checkpoint**: User Story 3 independently testable. Custom attribute add/fill/delete cycle works for Finance Accounts.

---

## Phase 8: User Story 4 — Domain-Specific Visualization (Priority: P3)

**Goal**: Balance Sheet list and detail offer a chart view in addition to the default table, toggled by the user.

**Independent Test**: BalanceSheet list → toggle to "Chart" view → line chart shows net worth over time across all balance sheets → toggle back to table → data unchanged. BalanceSheet detail → toggle shows asset/liability breakdown by currency.

- [X] T062 [P] [US4] Add net worth trend line chart to `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx`: use `@ant-design/charts` or Ant Design Pro `StatisticCard`; X axis = balance sheet dates, Y axis = base-currency net worth (decimal.js for all value computation); toggle button to switch table ↔ chart view
- [X] T063 [P] [US4] Add account-type breakdown stacked bar chart (assets vs liabilities per currency) to `apps/unihub/frontend/src/pages/finance/balance-sheets/[id].tsx`; visible as a collapsible section below the net worth summary card
- [X] T064 [US4] Verify both views reflect entity changes: after editing a balance, React Query cache invalidation causes both table and chart views to re-render with updated values

**Checkpoint**: User Story 4 independently testable. Chart and table views both reflect current data.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, documentation, and final quality validation.

- [X] T065 [P] Add empty state components (Ant Design `Empty`) to Accounts, BalanceSheets, and ExchangeRates pages when list is empty
- [X] T066 [P] Add error boundary in `apps/unihub/frontend/src/main.tsx` and per-page API error display (Ant Design `Alert`) for failed queries and mutations
- [X] T067 [P] Create `apps/unihub/frontend/CLAUDE.md` with frontend-specific conventions (PageTable usage, decimal.js requirement, service layer patterns, type generation workflow)
- [X] T068 [P] Create `apps/unihub/backend/CLAUDE.md` with backend-specific conventions (DecimalField-only for Finance numerics, coerce_to_string, system attr seeding via data migration, integration test requirements)
- [X] T069 [P] Add `docker-compose.production.yml` with frontend Nginx build stage and backend gunicorn service; verify production build produces no TypeScript errors (`pnpm build`)
- [X] T070 Run full quality loop and fix all issues: `uv run ruff check . && uv run pytest` (backend); `pnpm lint && pnpm typecheck && pnpm test` (frontend)
- [X] T071 Export final `openapi.yaml` from running backend (`GET /api/schema/?format=yaml`) and commit to `apps/unihub/backend/openapi.yaml`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational — no user story dependencies
- **US2 (Phase 4)**: Depends on Foundational — no user story dependencies
- **US2b (Phase 5)**: Depends on US2 (Account model must exist for Balance FK)
- **US2c (Phase 6)**: Depends on Foundational — can start parallel to US2/US2b, but multi-currency net worth test requires US2b complete
- **US3 (Phase 7)**: Depends on Foundational — independent of US2/US2b/US2c
- **US4 (Phase 8)**: Depends on US2b (needs balance sheet data to chart)
- **Polish (Phase 9)**: Depends on all user stories complete

### User Story Dependencies

- **US1**: Independent after Foundational
- **US2**: Independent after Foundational
- **US2b**: Requires US2 complete (Account model + API must exist)
- **US2c**: Independent after Foundational; multi-currency net worth test requires US2b
- **US3**: Independent after Foundational
- **US4**: Requires US2b complete

### Within Each Phase

- Models before serializers before viewsets before URL registration
- Backend API must be running before `pnpm run generate-types`
- Types must be generated before service layer functions are written
- Service layer before page component

### Parallel Opportunities

```bash
# Phase 1 — run together after T001:
T002 (backend init) || T003 (frontend init) || T005 (.env.example) || T006 (Dockerfile) || T007 (entrypoint)

# Phase 2 — backend and frontend can proceed in parallel:
T008-T014 (backend foundation) || T015-T020 (frontend foundation)

# Phase 4 US2 — after T026 (backend migration), backend + frontend proceed in parallel:
T027-T030 (backend serializer/viewset/tests) || T031-T032 (frontend regen+service)

# Phase 6 US2c — after T047 (migration):
T048-T050 (backend serializer/viewset/tests) || T051-T052 (frontend regen+service)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational ← **BLOCKS everything**
3. Complete Phase 3: US1 (Dashboard Shell)
4. Complete Phase 4: US2 (Finance Accounts)
5. **STOP AND VALIDATE**: Authenticated user can log in, see sidebar, create/edit/delete accounts
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → App shell running
2. + US1 → Authentication and navigation working
3. + US2 → Account CRUD working (MVP!)
4. + US2b → Balance sheet entry + single-currency net worth
5. + US2c → Multi-currency net worth with exchange rates
6. + US3 → Custom attributes for any entity
7. + US4 → Charts and visualizations

---

## Notes

- `[P]` = different files, no blocking dependency on an incomplete task in the same phase
- All Finance numeric inputs/outputs: `DecimalField` on backend, `decimal.js` on frontend — no exceptions
- Regenerate `api-types.ts` after every backend serializer change before writing frontend code
- Each user story phase ends with a Checkpoint — validate independently before moving on
- `PageTable` is mandatory for all tabular views (Constitution Principle VI)
- System AttributeDefinitions are seeded via data migration, never hardcoded in views or serializers
- All model PKs use `id = CharField(12, primary_key=True, default=generate_id, editable=False)` from `core.nanoid.generate_id` — no AutoField or integer PKs anywhere
- `AttributeValue.object_id` is `CharField(12)` (not `PositiveIntegerField`) to match string PKs
