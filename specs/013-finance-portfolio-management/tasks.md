# Tasks: Finance Portfolio Management — Iteration 3 (Legacy Migration + Policy Compliance)

**Input**: Design documents from `/specs/013-finance-portfolio-management/` (plan.md, spec.md Clarifications 2026-08-13, research.md I3-1…I3-7, data-model.md iteration-3 sections, contracts/api.md amendments, quickstart.md runbook)

**Tests**: TDD red-first throughout (established repo practice — write the failing test before the implementation it locks).

**Organization**: Stories 1–3 shipped their CRUD in iterations 1–2; this iteration's story phases carry only the amendments. Backend paths are relative to `apps/unihub/backend/`, frontend paths to `apps/unihub/frontend/`.

## Phase 1: Setup

- [X] T001 Confirm green baseline: run `uv run ruff check . && uv run pytest` (backend) and `pnpm lint && pnpm build && pnpm test` (frontend); record the pre-iteration test counts (553 backend / 838 frontend, 3 known full-suite-load flakes pass in isolation)

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Model/API amendments and the filter-contract repair that every story phase builds on. The 500 fix lives here because Stories 2–5 verification all require working filtered lists (spec maps it to US5/FR-016).

- [X] T002 Write failing backend tests for the filter contract regression in tests/finance/test_transactions.py (+ test_assets.py, test_portfolios.py): drive the real `filters` query param through the API — `portfolio eq <id>` on transactions MUST return 200 with only that portfolio's rows (currently FieldError→500); `name contains` on assets; `state eq` on portfolios (FR-016)
- [X] T003 Write failing backend tests for model amendments in tests/finance/: asset payloads have no `category` (test_assets.py); portfolio `description` round-trips on create/update (test_portfolios.py); transaction `chain_id`/`tx_hash` and transfer `remark` round-trip; 18-decimal precision survives write→read exactly (`-0.000000067305900768`) (test_transactions.py) (FR-002, FR-008c–e)
- [X] T004 Amend finance/models.py per data-model.md: drop `Asset.category`; add `Portfolio.description` CharField(500), `Transaction.chain_id` CharField(32), `Transaction.tx_hash` CharField(128), `Transfer.remark` CharField(255) (all blank, default ""); widen `Transfer.asset_change_amount`/`value_change` to `max_digits=38, decimal_places=18`; then `uv run python manage.py makemigrations finance` → migrations/0012
- [X] T005 Amend finance/serializers.py: remove `category` from AssetSerializer; add `description` to both Portfolio serializers (writable); add `chain_id`/`tx_hash` to TransactionSerializer and `remark` to TransferSerializer; TransferSerializer decimal fields → (38,18)
- [X] T006 Fix finance/views.py filter declarations to the current core contract (`lookup` = ORM field path — research I3-1) on AssetViewSet/PortfolioViewSet/TransactionViewSet; drop `category` from Asset filterable/ordering fields; T002+T003 now pass
- [X] T007 Write failing backend tests for quick search opt-in (019 contract) in tests/finance/: `?search=` narrows assets by name, portfolios by name/description/base_currency, transactions by description/remark/asset name; blank search is a no-op; multi-valued `transfers__` legs don't duplicate rows (data-model.md warns: may need `.distinct()` or dropping the reverse legs — encode the chosen behaviour)
- [X] T008 Add `EntitySearchFilter` + `searchable_fields` to the three viewsets in finance/views.py per data-model.md; T007 passes
- [X] T009 Regenerate the API contract: `uv run python manage.py spectacular --file openapi.yaml` (backend), then `pnpm openapi-ts` (frontend) to refresh src/services/unihub-backend/api-types.ts; `pnpm typecheck` surfaces every frontend site still using `category` or missing new fields
- [X] T010 [P] Update both locale files src/locales/en-US/pages.ts + src/locales/zh-TW/pages.ts in one edit: remove `pages.finance.assets.col.category` / `form.category*`; add keys for portfolio description, transaction chain/tx, transfer remark labels and placeholders (constitution VIII — both locales same commit)

**Checkpoint**: backend quality loop green with new contract; frontend compiles against regenerated types.

## Phase 3: User Story 1 — Assets page amendments (P1)

**Goal**: Assets page reflects category removal. **Independent test**: Assets CRUD works with name-only forms; no category column anywhere.

- [X] T011 [US1] Update failing page tests in src/pages/finance/assets/ (suite beside index.tsx): no category column, create/edit form has name only, delete confirmation uses the shared dialog (`data-testid="confirm-dialog-footer"`, not `.ant-modal-confirm*`)
- [X] T012 [US1] Amend src/pages/finance/assets/index.tsx: remove category column/form item/filterable attr; replace `Modal.confirm` (line ~147) with `confirmDialog` from `@/components/ConfirmDialog` (FR-002, FR-017)

## Phase 4: User Story 2 — Portfolio description (P2)

**Goal**: Portfolios carry an optional description, editable and visible on the detail panel. **Independent test**: create/edit a portfolio with description; it shows on the "Portfolio" panel and ports from legacy.

- [X] T013 [US2] Write failing tests: portfolios list/form tests in src/pages/finance/portfolios/ for the description field in the create/edit modal; detail-page test asserting the "Portfolio" panel renders description (with `<EmptyValue />` when blank)
- [X] T014 [US2] Amend src/pages/finance/portfolios/index.tsx (form field + optional column) and src/pages/finance/portfolios/detail.tsx ("Portfolio" panel row; edit modal field); replace both `Modal.confirm` sites in detail.tsx (~lines 179, 286) with `confirmDialog` (FR-008e, FR-017)

## Phase 5: User Story 3 — Transaction/transfer field amendments (P3)

**Goal**: Transactions expose chain/tx metadata; transfers expose remark; amounts keep 18-decimal precision end-to-end. **Independent test**: create a transaction with chain/tx + remarked transfer with a wei-scale amount; expanded row shows remark; value re-reads exactly.

- [X] T015 [US3] Write failing tests in src/pages/finance/portfolios/ (transactions panel suite): chain_id/tx_hash fields in the transaction form; remark column in expanded transfer rows (`<EmptyValue />` when blank) and remark input in the transfer editor; an 18-decimal amount round-trips through the form without float mangling
- [X] T016 [US3] Amend the transactions panel + transaction form in src/pages/finance/portfolios/detail.tsx: add chain_id/tx_hash form items; add remark to transfer editor rows and expanded-row columns; switch amount `InputNumber`s to `stringMode` with `precision` unset so 18dp survives (display: trim trailing zeros) (FR-008c–e)

## Phase 6: User Story 4 — Legacy CSV import (P4)

**Goal**: `import_legacy_finance` ports the four CSVs additively and idempotently. **Independent test**: run against a scratch DB with synthetic fixtures → exact counts, conversions, states; re-run → all skipped.

- [X] T017 [US4] Write the failing importer test suite tests/finance/test_import_legacy.py with SYNTHETIC fixture CSVs (never the real files) covering: reference→PK mapping; minor-unit conversion by asset decimals (incl. 18-dp wei case); `UPDATE_POSITION`→NULL vs COST/EXPENSE/REVENUE→settlement÷10^dec; "[Active]" prefix→state with verbatim name; description/chain/tx/remark porting; legacy created/updated timestamps preserved; Currency get_or_create (existing rows untouched); idempotent re-run (0 created, nothing modified); abort-atomic on unknown reference; per-entity count report; portfolio first/last transaction times recomputed (FR-012a–g)
- [X] T018 [US4] Implement finance/management/commands/import_legacy_finance.py per research I3-4/I3-5/I3-6 (stdlib csv, one `transaction.atomic()`, order assets→currencies→portfolios→transactions→transfers, PK-exists→skip, post-insert `QuerySet.update()` for timestamps, final `refresh_transaction_times()` per portfolio, created/skipped report); T017 passes
- [X] T019 [US4] Verification run against the LOCAL dev database with the real `migration/` CSVs: expect exactly 38/55/359/837 created, second run all-skipped; spot-check `[Active] 永豐 DCA TW.00918` (state active, description 每月 13, 29 日 10000 元) and one wei-scale transfer; NEVER stage/commit `migration/` (FR-012h, SC-003)

## Phase 7: User Story 5 — Views + quick search adoption (P5)

**Goal**: 013 pages behave like every other entity table. **Independent test**: Assets/Portfolios pages pass the same per-page locks as currencies/accounts (016 round 12); transactions panel search narrows with highlights.

- [X] T020 [US5] Write failing per-page lock tests for src/pages/finance/assets/ and src/pages/finance/portfolios/ modeled on the compliant pages' suites: (a) first request carries no filter/ordering and default page size, (b) a stored default view is applied on arrival with no unsaved-changes indicator (both row shapes), (c) typing a search query issues a request with `search=` and marks matches
- [X] T021 [US5] Adopt views+search on src/pages/finance/assets/index.tsx per research I3-7: `useEntityTable({ key: 'finance-assets', … })`, `viewConfigFromColumns` baseline, `useEntityViews`, `viewBar={<ViewTabs/>}`, `searchProps`, `SearchHighlightProvider`/`SearchMark`, PageTable remount key `${pinFingerprint}-${activeTabId}`
- [X] T022 [US5] Adopt views+search on src/pages/finance/portfolios/index.tsx (tableKey `finance-portfolios`), same wiring; keep Name/View hyperlinks (iteration 2) rendering through `SearchMark`
- [X] T023 [US5] Add quick search (searchProps + highlight provider + SearchMark cells) to the transactions panel in src/pages/finance/portfolios/detail.tsx — NO ViewTabs on the embedded table (research I3-7); search param joins the panel's portfolio filter server-side

## Phase 8: Polish & Cross-Cutting

- [X] T024 Full quality loops: backend `uv run ruff check . && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — run before committing)
- [X] T025 Grep gates: `Modal.confirm` absent from src/pages/finance/ (assets|portfolios); `category` absent from finance backend + frontend (except migrations history); both locale files key-synced
- [X] T026 Operator step (with user, real data): rebuild the docker stack from this branch, apply migration 0012, run `import_legacy_finance` per quickstart.md runbook, verify the portfolio detail Transactions panel loads (SC-006) — requires user confirmation before touching the real database

## Dependencies & Execution Order

- Phase 2 (T002–T010) blocks all story phases; within it T002/T003 (tests) precede T004–T006; T007 precedes T008; T009 follows T004–T008; T010 is parallel to backend work.
- US1 (T011–T012), US2 (T013–T014), US3 (T015–T016) are mutually independent after Phase 2 — parallelizable across different files (assets page vs portfolios pages).
- US4 (T017–T019) depends only on Phase 2 models — parallel to US1–US3 (backend-only vs frontend-only).
- US5 (T020–T023) touches the same three page files as US1–US3 — run AFTER them to avoid edit collisions (T021 after T012, T022–T023 after T014/T016).
- Phase 8 last; T026 requires explicit user go-ahead.

**Parallel examples**: T010 ∥ T004–T008; T017 ∥ T011/T013/T015; T021 ∥ T022 (different files).

**MVP scope**: Phase 2 alone fixes the reported 500 (SC-006 first half); Phase 6 delivers the migration (the iteration's headline); story phases 3–5 and 7 complete spec compliance.

**Total: 26 tasks** (US1: 2, US2: 2, US3: 2, US4: 3, US5: 4, Setup: 1, Foundational: 9, Polish: 3)
