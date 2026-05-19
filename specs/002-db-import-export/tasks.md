# Tasks: Database Import/Export

**Input**: Design documents from `specs/002-db-import-export/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅, quickstart.md ✅

**Tests**: Backend tests are required per Constitution Principle V (test-first, red-green-refactor). Frontend tests are included for service-layer functions.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the `io` Django app and wire it into the project before any feature work begins.

- [ ] T001 Create `io` app skeleton: `apps/unihub/backend/io/__init__.py`, `apps.py`, `urls.py`, `views.py`, `serializers.py`, `registry.py`, `migrations/__init__.py`, `services/__init__.py`, `services/csv_exporter.py`, `services/csv_importer.py`, `services/change_preview.py`, `tests/__init__.py`
- [ ] T002 Add `'io'` to `INSTALLED_APPS` in `apps/unihub/backend/unihub/settings.py`
- [ ] T003 Add `path("api/v1/io/", include("io.urls"))` to `apps/unihub/backend/unihub/urls.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core registry and table registration that ALL user stories depend on. No user story can be implemented until this phase is complete.

**⚠️ CRITICAL**: Blocks all user story phases.

- [ ] T004 Implement `FieldDescriptor` and `TableDescriptor` dataclasses, `register()`, `get_registry()`, and `get_table()` in `apps/unihub/backend/io/registry.py`
- [ ] T005 [P] Write `apps/unihub/backend/io/tests/test_registry.py`: test `register()` succeeds, `get_table()` returns descriptor, duplicate registration raises, unknown table raises `KeyError`
- [ ] T006 Register all Finance tables (`finance.currency`, `finance.account`, `finance.balancesheet`, `finance.exchangerate`, `finance.balance`) with correct `system_fields`, `has_user_attributes`, and `import_order` in `apps/unihub/backend/finance/apps.py` `FinanceConfig.ready()`
- [ ] T007 [P] Register `core.attributedefinition` table in `apps/unihub/backend/core/apps.py` `CoreConfig.ready()`
- [ ] T008 Implement all request/response DRF serializers in `apps/unihub/backend/io/serializers.py`: `FieldInfoSerializer`, `TableInfoSerializer`, `ExportRequestSerializer`, `ImportPreviewRequestSerializer`, `ChangeRecordSerializer`, `ValidationErrorSerializer`, `ImportPreviewResponseSerializer`, `ImportConfirmRequestSerializer`, `ImportConfirmResponseSerializer`

**Checkpoint**: Registry populated, serializers defined — user story phases can now begin.

---

## Phase 3: User Story 1 — Export Table to CSV File (Priority: P1) 🎯 MVP

**Goal**: Users can export any registered table as a `.csv` file (or multi-table `.zip`), including system columns and user-defined attribute columns. Clipboard copy is included.

**Independent Test**: Export `finance.currency` table; verify downloaded `.csv` has correct `code:string,name:text,symbol:text` headers and all rows. Export `finance.account` and verify user-defined attribute columns appear as `[name]:data_type`.

### Backend

- [ ] T009 Write `apps/unihub/backend/io/tests/test_csv_exporter.py`: test single-table CSV output (correct headers, correct rows), user-defined attribute columns included as `[name]:type`, empty table produces headers-only CSV, multi-table call produces valid ZIP with correct filenames
- [ ] T010 Implement `apps/unihub/backend/io/services/csv_exporter.py`: `export_table(descriptor) → bytes` (CSV) and `export_tables(descriptors) → bytes` (ZIP); generates `{col}:{type}` and `[attr]:type` headers; fetches `AttributeValue` rows for `has_user_attributes=True` tables; serializes FK fields as PK strings
- [ ] T011 Write `apps/unihub/backend/io/tests/test_views_export.py`: GET `/tables/` returns all registered tables; POST `/export/` single table returns CSV with correct `Content-Disposition`; multi-table returns ZIP; unknown `content_type_label` returns 400; unauthenticated request returns 403
- [ ] T012 Implement `TablesView` (GET `/api/v1/io/tables/`) in `apps/unihub/backend/io/views.py`: returns `TableInfoSerializer` list for all registered tables, including dynamic `AttributeDefinition` fields for `has_user_attributes=True` tables
- [ ] T013 Implement `ExportView` (POST `/api/v1/io/export/`) in `apps/unihub/backend/io/views.py`: validates `ExportRequestSerializer`; streams CSV or ZIP response; defaults `format` to `"csv"` for single table, `"zip"` for multiple
- [ ] T014 Wire `TablesView` and `ExportView` routes in `apps/unihub/backend/io/urls.py`

### Frontend

- [ ] T015 Regenerate OpenAPI schema and frontend types: run `uv run python manage.py spectacular --color --file openapi.yaml` in `apps/unihub/backend/`, then `pnpm generate:types` in `apps/unihub/frontend/`
- [ ] T016 Implement `listTables()` and `exportTables()` in `apps/unihub/frontend/src/services/unihub-backend/io.ts`; export barrel re-exports from `index.ts` and `types.ts`
- [ ] T017 Implement `ImportExportDrawer` shell (open/close, tab bar for Export/Import) in `apps/unihub/frontend/src/components/ImportExport/index.tsx`; accept `contentTypeLabel`, `displayName`, `open`, `onClose` props
- [ ] T018 Implement `ExportPanel` (table confirmed via prop, format selector, Download button using `URL.createObjectURL`, Copy to Clipboard button using `navigator.clipboard.writeText`) in `apps/unihub/frontend/src/components/ImportExport/ExportPanel.tsx`
- [ ] T019 [P] Add `ImportExportDrawer` trigger button (toolbar) and drawer instance to `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` for `finance.account`
- [ ] T020 [P] Add `ImportExportDrawer` trigger button (toolbar) and drawer instance to `apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx` for `finance.exchangerate`

**Checkpoint**: Export is fully functional end-to-end. User can download CSV and copy to clipboard from Finance pages.

---

## Phase 4: User Story 2 — Preview Changes Before Import (Priority: P2)

**Goal**: Users can paste or upload a CSV, see a structured diff (creates / updates) before any data is written, and cancel without side effects.

**Independent Test**: Upload a CSV with one new row and one modified row for `finance.currency`. Verify preview response shows 1 create and 1 update with correct `before`/`after` fields and 0 errors. Click Cancel — verify DB is unchanged.

### Backend

- [ ] T021 Write `apps/unihub/backend/io/tests/test_csv_importer.py`: valid CSV parses correctly; header missing `:type` suffix returns `ValidationError`; column not in descriptor schema returns `ValidationError`; unknown FK value in row returns `ValidationError`; duplicate PKs within CSV returns `ValidationError`; empty CSV body (headers only) returns empty rows
- [ ] T022 Implement `apps/unihub/backend/io/services/csv_importer.py`: `parse_csv(csv_text: str, descriptor: TableDescriptor) → tuple[list[ParsedRow], list[ValidationError]]`; validates header names and types against descriptor; parses each data row; validates FK existence; detects duplicate PKs
- [ ] T023 Write `apps/unihub/backend/io/tests/test_change_preview.py`: new PK in CSV → ChangeRecord operation=create; existing PK with changed field → operation=update with correct `changed_fields`; existing PK with identical values → not included in output; upsert mode → no delete records regardless of rows absent from CSV
- [ ] T024 Implement `compute_diff(parsed_rows, descriptor, mode) → list[ChangeRecord]` in `apps/unihub/backend/io/services/change_preview.py`: loads current DB rows keyed by PK; diffs against parsed rows; produces create/update records; in upsert mode, absent DB rows are not included
- [ ] T025 Write preview endpoint tests in `apps/unihub/backend/io/tests/test_views_import.py`: POST `/import/preview/` happy path returns 200 with correct creates/updates lists; schema errors return 200 with non-empty `errors` and empty change lists; missing `table` or `mode` returns 400; `csv_text` and `csv_file` both absent returns 400
- [ ] T026 Implement `ImportPreviewView` (POST `/api/v1/io/import/preview/`) in `apps/unihub/backend/io/views.py`: validates `ImportPreviewRequestSerializer`; calls `parse_csv` then `compute_diff`; returns `ImportPreviewResponseSerializer`; returns 200 even when `errors` is non-empty (no writes ever occur in this endpoint)
- [ ] T027 Wire `ImportPreviewView` route in `apps/unihub/backend/io/urls.py`

### Frontend

- [ ] T028 Add `importPreview()` function to `apps/unihub/frontend/src/services/unihub-backend/io.ts`
- [ ] T029 Implement `ChangePreviewTable` (tabbed Ant Design `<Table>` inside drawer showing Creates / Updates / Errors tabs with row counts; `before`/`after` field diff for updates) in `apps/unihub/frontend/src/components/ImportExport/ChangePreviewTable.tsx`; use `<Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>` for empty cells
- [ ] T030 Implement `ImportPanel` (mode selector, paste textarea, file upload `<input type="file" accept=".csv">` with `FileReader`, submit for preview, display `ChangePreviewTable` when preview data available) in `apps/unihub/frontend/src/components/ImportExport/ImportPanel.tsx`
- [ ] T031 Wire `ImportPanel` into `ImportExportDrawer` tab in `apps/unihub/frontend/src/components/ImportExport/index.tsx`

**Checkpoint**: Import preview is fully functional. Users see creates/updates diff before any writes.

---

## Phase 5: User Story 3 — Import via Upsert Mode (Priority: P3)

**Goal**: Users can confirm a previewed import in upsert mode — new rows are inserted, existing rows are updated, rows absent from the CSV are untouched.

**Independent Test**: Import a CSV for `finance.currency` with one new currency (new PK) and one modified currency (existing PK, changed name). Confirm. Verify: new currency exists, existing currency name updated, all other currencies unchanged. Re-import the same CSV — verify `updated: 0, created: 0` (idempotent).

### Backend

- [ ] T032 Extend `apps/unihub/backend/io/tests/test_views_import.py` with upsert confirm tests: POST `/import/confirm/` with `mode=upsert` returns correct `created`/`updated` counts; rows absent from CSV remain in DB; `AttributeValue` rows are upserted alongside main model rows; confirming same CSV twice returns 0 creates and 0 updates (idempotent)
- [ ] T033 Implement `apply_diff(change_records, descriptor, mode) → ApplyResult` in `apps/unihub/backend/io/services/change_preview.py`: uses `transaction.atomic`; for each CREATE calls `Model.objects.create()`; for each UPDATE calls `Model.objects.filter(pk=pk).update()`; for `has_user_attributes=True` tables, bulk-upserts `AttributeValue` records; returns `{created: int, updated: int, deleted: int}`
- [ ] T034 Implement `ImportConfirmView` (POST `/api/v1/io/import/confirm/`) in `apps/unihub/backend/io/views.py`: identical request to preview; calls `parse_csv` → `compute_diff` → `apply_diff` inside one request; returns `ImportConfirmResponseSerializer`
- [ ] T035 Wire `ImportConfirmView` route in `apps/unihub/backend/io/urls.py`

### Frontend

- [ ] T036 Add `importConfirm()` function to `apps/unihub/frontend/src/services/unihub-backend/io.ts`
- [ ] T037 Add Confirm and Cancel buttons below `ChangePreviewTable` in `apps/unihub/frontend/src/components/ImportExport/ImportPanel.tsx`; Confirm button disabled when `errors` is non-empty
- [ ] T038 Handle confirm response in `apps/unihub/frontend/src/components/ImportExport/index.tsx`: show `message.success` with created/updated counts, close drawer, invalidate relevant React Query keys

**Checkpoint**: Full upsert import flow works end-to-end. Export → modify → import → verify round-trip.

---

## Phase 6: User Story 4 — Import via Replace Mode (Priority: P4)

**Goal**: Users can replace an entire table with the contents of a CSV — rows absent from the CSV are deleted. A destructive warning is shown before confirm.

**Independent Test**: Add an extra row to `finance.currency` DB directly. Import the original CSV with `mode=replace`. Verify: extra row is deleted, all other rows match CSV exactly.

### Backend

- [ ] T039 Extend `apps/unihub/backend/io/tests/test_views_import.py` with replace mode tests: preview returns non-empty `deletes` list for rows in DB not in CSV; confirm deletes those rows; upsert mode confirm never deletes; multi-field delete correctly reported in preview
- [ ] T040 Extend `compute_diff()` in `apps/unihub/backend/io/services/change_preview.py` for replace mode: for each DB row whose PK is absent from the CSV, emit a ChangeRecord with `operation="delete"`
- [ ] T041 Extend `apply_diff()` in `apps/unihub/backend/io/services/change_preview.py` for replace mode: within the existing `transaction.atomic`, delete rows whose PKs have `operation="delete"`

### Frontend

- [ ] T042 Show DELETE tab and row count in `ChangePreviewTable` in `apps/unihub/frontend/src/components/ImportExport/ChangePreviewTable.tsx`; style DELETE rows distinctly (Ant Design `danger` color token)
- [ ] T043 Show destructive warning (`Popconfirm` or `Modal.confirm`) when replace mode + `deletes.length > 0` before calling `importConfirm()` in `apps/unihub/frontend/src/components/ImportExport/ImportPanel.tsx`

**Checkpoint**: All four user stories are fully functional and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T044 [P] Regenerate final OpenAPI schema and types; update `apps/unihub/frontend/src/services/unihub-backend/index.ts` and `types.ts` barrel exports
- [ ] T045 [P] Run backend quality loop from `apps/unihub/backend/`: `uv run ruff format .`, `uv run ruff check . --fix`, `uv run pytest` — fix all failures
- [ ] T046 [P] Run frontend quality loop from `apps/unihub/frontend/`: `pnpm lint`, `pnpm typecheck`, `pnpm test` — fix all failures
- [ ] T047 Execute round-trip smoke test from `quickstart.md`: export `finance.currency` → add one row → import preview (verify 1 create, 0 errors) → import confirm → export again → verify new row present

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user story phases**
- **Phase 3 (US1)**: Depends on Phase 2 — no dependency on US2/US3/US4
- **Phase 4 (US2)**: Depends on Phase 2 — no dependency on US1 backend (frontend depends on US1 for the drawer shell)
- **Phase 5 (US3)**: Depends on Phase 4 (upsert confirm reuses importer + change_preview from US2)
- **Phase 6 (US4)**: Depends on Phase 5 (replace mode extends compute_diff + apply_diff from US3)
- **Phase 7 (Polish)**: Depends on all desired user stories complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no story dependencies
- **US2 (P2)**: Can start after Phase 2 — no story dependencies (frontend drawer shell from US1 is helpful but not blocking)
- **US3 (P3)**: Depends on US2 complete (reuses `parse_csv` + `compute_diff`; confirm view extends preview flow)
- **US4 (P4)**: Depends on US3 complete (extends `compute_diff` and `apply_diff` for delete logic)

### Within Each Phase

- Backend tests written **before** implementation (constitution requirement — must see FAIL before green)
- Models/registry before services
- Services before views
- Views before URL wiring
- Backend complete + schema regenerated before frontend service types are finalized

### Parallel Opportunities

- T005, T007 in Phase 2 are parallel (different app files)
- T009, T011 in Phase 3 (test files) can be written in parallel
- T019, T020 in Phase 3 (page integrations) are parallel (different pages)
- T044, T045, T046 in Phase 7 are parallel (different toolchains)

---

## Parallel Example: Phase 3 (US1)

```
# Write both test files in parallel:
Task T009: "Write io/tests/test_csv_exporter.py"
Task T011: "Write io/tests/test_views_export.py"

# After T009 passes (red phase confirmed):
Task T010: "Implement io/services/csv_exporter.py"

# After T011 passes (red phase confirmed) AND T010 complete:
Task T012: "Implement TablesView"
Task T013: "Implement ExportView"

# After T015 (schema regen):
Task T016: "Implement io.ts service"
Task T017: "Implement ImportExportDrawer shell"  (sequential after T016)

# After T017:
Task T019: "Add drawer to accounts page"
Task T020: "Add drawer to exchange-rates page"  (parallel with T019)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Export)
4. **STOP and VALIDATE**: Export a CSV, verify headers and data, test clipboard copy
5. Ship / demo export capability independently

### Incremental Delivery

1. Phase 1 + 2 → Registry + app wired
2. Phase 3 (US1) → Export working → demo-able
3. Phase 4 (US2) → Preview working → users can inspect diffs before committing
4. Phase 5 (US3) → Upsert import working → full safe import flow
5. Phase 6 (US4) → Replace import working → full destructive import flow

---

## Notes

- `[P]` tasks touch different files and have no inter-task dependencies — safe to run concurrently
- Backend tests must be written first and confirmed failing before implementing the corresponding service/view
- Constitution Principle VII: preview table uses `<Table>` (not `PageTable`) inside a `<Drawer>` — this is correct
- Constitution Principle VI: empty cells in `ChangePreviewTable` use `<Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>`
- FK fields exported as PK strings for round-trip fidelity (see research.md decision 6)
- Clipboard paste for import uses a `<textarea>` (not `navigator.clipboard.readText`) for cross-browser reliability
