# Tasks: Fix Finance Data Sync — Systematic Full-Field Coverage

**Input**: Design documents from `specs/009-fix-finance-sync/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Backend test tasks included per Constitution Principle V (test-first). No frontend component.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)

---

## Phase 1: Setup

**Purpose**: No new project structure needed — this is a backend-only change to existing files.

- [ ] T001 Verify all Finance model fields in `apps/unihub/backend/finance/models.py` match the expected field sets documented in `specs/009-fix-finance-sync/data-model.md`

**Checkpoint**: Field sets confirmed — proceed to foundational infrastructure

---

## Phase 2: Foundational — `auto_system_fields()` utility

**Purpose**: Add the `auto_system_fields()` utility to `data_io/registry.py`. This is the core infrastructure that all user story fixes depend on.

**⚠️ CRITICAL**: Constitution Principle V — tests MUST be written first and MUST fail before implementation.

- [ ] T002 Write failing test for `auto_system_fields()` — Currency model generates 4 FieldDescriptors matching `Currency._meta.concrete_fields`, in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T003 [P] Write failing test: `auto_system_fields()` handles FK fields — Balance model with `fk_overrides` generates correct `is_fk=True` and `fk_content_type_label` on `account_id` and `balance_sheet_id`, in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T004 [P] Write failing test: `_field_to_data_type()` maps BooleanField→`"boolean"`, DateTimeField→`"datetime"`, DecimalField→`"decimal"`, CharField(max_length≤50)→`"string"`, CharField(max_length>50)→`"text"`, in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T005 Implement `_field_to_data_type(field)` helper in `apps/unihub/backend/data_io/registry.py` — maps Django field classes to data_io data_type strings per mapping in `specs/009-fix-finance-sync/data-model.md` (makes T004 pass)
- [ ] T006 Implement `auto_system_fields(model_class, exclude=None, fk_overrides=None)` in `apps/unihub/backend/data_io/registry.py` — reads `model._meta.concrete_fields`, creates one `FieldDescriptor` per field using `_field_to_data_type()`, sets `is_pk`/`is_fk`/`nullable` from field metadata, merges `fk_overrides` (makes T002, T003 pass)

**Checkpoint**: `uv run pytest tests/test_sync_field_coverage.py::test_auto_system_fields* -v` passes

---

## Phase 3: User Story 1 — Full Field Export Coverage (Priority: P1) 🎯 MVP

**Goal**: Every attribute of every Finance entity record is included when data is exported to the remote. Confirmed missing fields (Currency `is_base_currency`, Account `color`, Account timestamps, BalanceSheet timestamps) are now exported.

**Independent Test**: Create Currency with `is_base_currency=True`, Account with `color="#2196f3"`. Export via the sync mechanism. Inspect the exported CSV — both `is_base_currency:boolean` and `color:string` columns appear with correct values.

- [ ] T007 [US1] Write failing regression test: export of `finance.currency` includes all 4 fields (code, name, symbol, is_base_currency) — assert exported CSV header contains `is_base_currency:boolean`, in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T008 [P] [US1] Write failing regression test: export of `finance.account` includes all 8 fields (id, name, currency, color, open_datetime, close_datetime, created_at, updated_at), in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T009 [P] [US1] Write failing regression test: export of `finance.balancesheet` includes all 4 fields (id, date, created_at, updated_at), in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T010 [P] [US1] Write failing field-coverage invariant test: for every registered Finance table, `{fd.column_name for fd in table.system_fields} == {f.attname for f in table.model_class._meta.concrete_fields}`, in `apps/unihub/backend/tests/test_sync_field_coverage.py` (this is the permanent regression guard from `contracts/field-coverage-contract.md`)
- [ ] T011 [US1] Migrate `finance.currency` registration in `apps/unihub/backend/finance/apps.py` to use `auto_system_fields(Currency)` — replaces the 3-field manual list with auto-discovered 4 fields including `is_base_currency` (makes T007, T010 partial pass)
- [ ] T012 [US1] Migrate `finance.account` registration in `apps/unihub/backend/finance/apps.py` to use `auto_system_fields(Account)` — replaces the 5-field manual list with auto-discovered 8 fields including `color`, `created_at`, `updated_at` (makes T008, T010 partial pass)
- [ ] T013 [US1] Migrate `finance.balancesheet` registration in `apps/unihub/backend/finance/apps.py` to use `auto_system_fields(BalanceSheet)` — replaces the 2-field manual list with auto-discovered 4 fields including `created_at`, `updated_at` (makes T009, T010 partial pass)
- [ ] T014 [P] [US1] Migrate `finance.exchangerate` registration in `apps/unihub/backend/finance/apps.py` to use `auto_system_fields(ExchangeRate)` — no missing fields, but migrates to auto-discovery for systemic consistency (makes T010 partial pass)
- [ ] T015 [P] [US1] Migrate `finance.balance` registration in `apps/unihub/backend/finance/apps.py` to use `auto_system_fields(Balance, fk_overrides={'account_id': {'is_fk': True, 'fk_content_type_label': 'finance.account'}, 'balance_sheet_id': {'is_fk': True, 'fk_content_type_label': 'finance.balancesheet'}})` — no missing fields, but migrates to auto-discovery (makes T010 fully pass)

**Checkpoint**: `uv run pytest tests/test_sync_field_coverage.py -v` all pass — all 5 Finance tables have complete field coverage

---

## Phase 4: User Story 2 — Sync Preview Detects All Attribute Changes (Priority: P1)

**Goal**: The publish preview counts a record as "modified" when any of its attributes change, including the previously omitted fields (`is_base_currency`, `color`, timestamps).

**Independent Test**: Mark a currency as base currency. Open publish preview. Verify the Currency table shows at least 1 modification in the preview count.

- [ ] T016 [US2] Write failing test: publish preview detects a change in `is_base_currency` as a modification to the Currency record — assert preview returns `modified_count >= 1` for `finance.currency` after toggling `is_base_currency`, in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T017 [P] [US2] Write failing test: publish preview detects a change in `color` as a modification to the Account record — assert preview returns `modified_count >= 1` for `finance.account` after changing `color`, in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T018 [US2] Verify preview works end-to-end with the updated field registrations — run the full push-and-pull smoke test: push data to a temp location, modify `is_base_currency` on a currency, run publish preview, assert the currency appears in the modified count. No code change expected (preview logic already uses registry); this task verifies the fix propagates through the full pipeline, in `apps/unihub/backend/tests/test_sync_field_coverage.py`

**Checkpoint**: `uv run pytest tests/test_sync_field_coverage.py::test_preview_* -v` passes — preview correctly detects changes to all fields

---

## Phase 5: User Story 3 — Backward-Compatible Import of Older Datasets (Priority: P2)

**Goal**: Pulling an older remote dataset that is missing the new columns (`is_base_currency`, `color`, timestamps) completes without error. Missing fields receive safe defaults.

**Independent Test**: Construct a Currency CSV that has only `code`, `name`, `symbol` columns (no `is_base_currency`). Perform an import. Verify it succeeds and the imported currency has `is_base_currency=False`.

- [ ] T019 [US3] Write failing test: importing a Currency CSV missing `is_base_currency` column succeeds and defaults to `False` — construct minimal CSV without `is_base_currency`, call importer, assert success and `is_base_currency=False` on imported record, in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T020 [P] [US3] Write failing test: importing an Account CSV missing `color` column succeeds and defaults to empty string — assert `color=""` on imported record, in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T021 [P] [US3] Write failing test: importing an Account CSV missing timestamp columns succeeds — imported record exists; `created_at` and `updated_at` are set to a value (import timestamp acceptable as default), in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T022 [US3] Confirm `csv_importer.py` handles missing columns gracefully for new fields — read `apps/unihub/backend/data_io/services/csv_importer.py` and verify that columns absent in the CSV are skipped rather than causing a KeyError. If the current importer raises on missing columns, add a defensive check: `value = row.get(fd.column_name, fd.default_value)` using a new `default_value` attribute on `FieldDescriptor` (makes T019, T020, T021 pass)
- [ ] T023 [US3] If `FieldDescriptor` needed a `default_value` field (from T022), update `auto_system_fields()` in `apps/unihub/backend/data_io/registry.py` to populate `default_value` from `field.default` or a type-appropriate safe default (boolean→False, string→"", nullable→None)

**Checkpoint**: `uv run pytest tests/test_sync_field_coverage.py::test_backward_compat* -v` passes — old CSVs import cleanly

---

## Phase 6: Polish — Timestamp Import Fidelity + Quality Loop

**Purpose**: Ensure timestamp fields are restored to original values (not import time) when present in the CSV, and the full quality loop passes.

- [ ] T024 Write test: push-and-pull round-trip preserves `created_at` exactly — create Account, record `created_at`, push, pull, assert `created_at` unchanged in `apps/unihub/backend/tests/test_sync_field_coverage.py`
- [ ] T025 Update `csv_importer.py` in `apps/unihub/backend/data_io/services/csv_importer.py` to use two-step import for `auto_now`/`auto_now_add` timestamp fields: (1) `save()` to create the record, (2) `queryset.filter(pk=pk).update(created_at=original, updated_at=original)` to restore original timestamps, bypassing Django's `auto_now` (makes T024 pass)
- [ ] T026 [P] Run backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` — confirm zero errors; fix any ruff issues in changed files
- [ ] T027 [P] Verify `uv run pytest tests/test_sync_field_coverage.py -v` — all tasks pass in a single clean run

**Checkpoint**: All tests pass, ruff clean, round-trip preserves all fields including timestamps

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup/verify)       — no dependencies, start immediately
Phase 2 (auto_system_fields) — depends on Phase 1 (field verification)
Phase 3 (US1 Export)         — depends on Phase 2 (auto_system_fields utility must exist)
Phase 4 (US2 Preview)        — depends on Phase 3 (registry must have full fields)
Phase 5 (US3 Backward compat) — depends on Phase 3 (importer exercises new fields)
Phase 6 (Polish)             — depends on Phase 3–5 complete
```

### User Story Dependencies

- **US1 (P1, Export Coverage)**: Requires Phase 2 (auto_system_fields). No dependency on US2 or US3.
- **US2 (P1, Preview Detection)**: Requires US1 complete (fields must be in registry). No dependency on US3.
- **US3 (P2, Backward Compat)**: Requires US1 complete (importer exercises new columns). Independent of US2.

### Within Each Phase

- Tests MUST fail before implementation (Constitution Principle V)
- T007/T008/T009 test writes [P] — can run in parallel (different fixture data)
- T011/T012/T013/T014/T015 implementation [P T012-T015] — all edit the same file (`apps.py`) so T011 must complete first, then T012-T015 can run as one sequential batch

### Parallel Opportunities

- T002, T003, T004 (Phase 2 test writes) can run in parallel
- T007, T008, T009, T010 (Phase 3 test writes) can run in parallel
- T011 → then T012, T013, T014, T015 as one batch (same file — sequential within batch)
- T016, T017 (Phase 4 test writes) can run in parallel
- T019, T020, T021 (Phase 5 test writes) can run in parallel
- T026, T027 (Phase 6 quality loop) can run in parallel

---

## Parallel Example: Phase 3 (US1 — Export Coverage)

```
Parallel batch 1 — write tests:
  T007: Currency coverage test (is_base_currency in export)
  T008: Account coverage test (color, timestamps in export)
  T009: BalanceSheet coverage test (timestamps in export)
  T010: Coverage invariant test (all model fields ↔ registered fields)

Sequential:
  T011: Migrate Currency registration (makes T007 pass)
  Then parallel:
    T012: Migrate Account registration (makes T008 pass)
    T013: Migrate BalanceSheet registration (makes T009 pass)
    T014: Migrate ExchangeRate registration
    T015: Migrate Balance registration (makes T010 fully pass)
```

---

## Implementation Strategy

### MVP (Phase 1 + Phase 2 + Phase 3 — ~15 tasks)

1. Phase 1: Verify field sets (T001)
2. Phase 2: Build `auto_system_fields()` infrastructure (T002–T006)
3. Phase 3: Migrate all Finance registrations + coverage tests (T007–T015)
4. **STOP and VALIDATE**: Run `uv run pytest tests/test_sync_field_coverage.py -v`, confirm `is_base_currency` and `color` are in exported CSVs
5. This directly fixes the data loss issue and installs the permanent regression guard

### Incremental Delivery

1. MVP: Fix export + permanent guard → confirms fix
2. Add Phase 4: Verify preview picks up changes to new fields
3. Add Phase 5: Verify old CSV imports still work
4. Add Phase 6: Timestamp round-trip fidelity + quality loop

---

## Notes

- [P] tasks touch different fixtures or independent code paths — safe to run simultaneously
- Backend tests follow test-first (Constitution V): test tasks in each phase MUST fail before implementation tasks
- `finance/apps.py` is a single file — T011-T015 all modify it; run as a sequential batch within Phase 3
- The coverage invariant test (T010) is the permanent regression guard: if a future developer adds a model field without updating the registry, T010 will fail immediately in CI
- FK overrides in `auto_system_fields()` calls for Balance table are required — all other tables have no FK fields
- ExchangeRate and Balance currently have full field coverage; their migration to `auto_system_fields()` is still required to establish the systemic pattern (T014, T015)
- All 27 tasks follow strict checklist format: checkbox, ID, [P]?, [Story]?, description with file path
