# Implementation Plan: Database Import/Export

**Branch**: `002-db-import-export` | **Date**: 2026-05-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-db-import-export/spec.md`

## Summary

Add a stateless import/export infrastructure layer that allows any registered domain table to be exported as CSV (or multi-table ZIP) and re-imported via upsert or replace mode. User-defined attributes (AttributeValues) are included as bracketed columns in the CSV, preserving full round-trip fidelity. A shared `<ImportExportDrawer>` frontend component is added to Finance domain table pages; no new route is needed.

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 / React 18.3 (frontend)

**Primary Dependencies**:
- Backend: Django 5.x, Django REST Framework 3.x, drf-spectacular (OpenAPI), Python stdlib `csv` + `zipfile` (no new packages)
- Frontend: Ant Design 5.24, TanStack React Query 5, React Router 7 (no new packages)

**Storage**: PostgreSQL 16 — shared instance; `io` app has no persistent models

**Testing**: pytest-django (backend), Vitest + React Testing Library (frontend)

**Target Platform**: Linux server (backend), desktop/tablet browser (frontend)

**Project Type**: Web application (Django + React SPA)

**Performance Goals**: Preview renders within 3 seconds for CSVs up to 10,000 rows (SC-002)

**Constraints**: Session-based auth (CSRF required); UTF-8 CSV encoding only; desktop/tablet widths only

**Scale/Scope**: Single authenticated user; Finance domain tables in v1 (6 tables)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Entity-Centric Domain Architecture | ✅ Pass | AttributeValues (user-defined attrs) are exported as `[name]:type` columns and re-imported via bulk-upsert in the same transaction. No parallel attribute storage. |
| II. Domain Independence | ✅ Pass | `io` app is infrastructure; domains register themselves via `AppConfig.ready()`. `io` holds no domain model imports directly. |
| III. Reference Implementation Alignment | ✅ Pass | Django + DRF, session auth, drf-spectacular, `uv`, `ruff`, `pytest-django`, `pnpm`, React Query, Ant Design 5. |
| IV. API Contract-Driven Frontend | ✅ Pass | `io` endpoints are exposed via drf-spectacular OpenAPI schema; frontend types generated from `openapi.yaml`. |
| V. Quality Loop Enforcement | ✅ Pass | All backend endpoints have pytest-django happy-path + error-path tests; frontend passes ESLint + tsc strict + Vitest. |
| VI. UI/UX Reference: ov-fleet | ✅ Pass | Drawer, Table, Button patterns follow Ant Design / ov-fleet conventions. Empty cell display uses `<Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>`. |
| VII. PageTable Layout | ✅ Pass | Preview table is inside a Drawer (not a page); regular Ant Design `<Table>` is correct here. Existing page table pages (Accounts, Exchange Rates) continue to use `PageTable`. Import/Export trigger button goes in the `action` or `toolBarRender` prop of the existing `PageTable`. |

**Post-Phase 1 re-check**: All principles hold. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-db-import-export/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output — HTTP API contract
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
apps/unihub/backend/
  io/                             # New Django app
    __init__.py
    apps.py                       # IOConfig — registers with Django
    registry.py                   # TableDescriptor dataclass + register() + get_registry()
    services/
      __init__.py
      csv_exporter.py             # model rows → CSV bytes (handles AttributeValues)
      csv_importer.py             # CSV bytes → validated ChangeRecord list
      change_preview.py           # Diff CSV ChangeRecords against current DB rows
    views.py                      # TablesView, ExportView, ImportPreviewView, ImportConfirmView
    serializers.py                # Request/response DRF serializers
    urls.py                       # Router registration
    migrations/                   # Empty (no models)
    tests/
      __init__.py
      test_registry.py
      test_csv_exporter.py
      test_csv_importer.py
      test_change_preview.py
      test_views_export.py
      test_views_import.py
  finance/
    apps.py                       # Updated: register Finance tables in io registry
  unihub/
    urls.py                       # Updated: include io.urls at /api/v1/io/

apps/unihub/frontend/src/
  components/
    ImportExport/
      index.tsx                   # ImportExportDrawer — entry point, manages drawer open/close
      ExportPanel.tsx             # Export tab: format select, download/copy buttons
      ImportPanel.tsx             # Import tab: mode select, paste/upload, submit for preview
      ChangePreviewTable.tsx      # Diff viewer: create/update/delete tabs + row count summary
  services/unihub-backend/
    io.ts                         # listTables(), exportTables(), importPreview(), importConfirm()
    index.ts                      # Updated: export * from './io'
    types.ts                      # Updated: re-export io types
  pages/finance/
    accounts/index.tsx            # Updated: add ImportExportDrawer for finance.account
    exchange-rates/index.tsx      # Updated: add ImportExportDrawer for finance.exchangerate
```

**Structure Decision**: Web application layout (Option 2 from template). Backend under `apps/unihub/backend/io/`, frontend components under `src/components/ImportExport/`, service layer under `src/services/unihub-backend/io.ts`.

## Complexity Tracking

> No constitution violations to justify.

---

## Implementation Notes

### Backend: `io/registry.py`

```python
# Simplified structure — not implementation code
@dataclass
class FieldDescriptor:
    column_name: str
    csv_header: str      # "name:text" or "[attr_name]:single_select"
    data_type: str
    is_pk: bool
    is_fk: bool
    fk_content_type_label: str | None
    nullable: bool

@dataclass
class TableDescriptor:
    content_type_label: str
    display_name: str
    model_class: type
    system_fields: list[FieldDescriptor]
    has_user_attributes: bool
    import_order: int
```

### Backend: CSV Header Format

- System field: `{field_name}:{data_type}` → `id:string`, `open_datetime:datetime`
- User-defined attribute: `[{attr_name}]:{data_type}` → `[priority]:single_select`
- FK fields serialize as the referenced PK string

### Backend: Import Transaction

`ImportConfirmView` wraps all writes in `transaction.atomic()`:
1. For each CREATE record: `Model.objects.create(...)` + `AttributeValue` bulk-upsert
2. For each UPDATE record: `Model.objects.filter(pk=...).update(...)` + `AttributeValue` bulk-upsert
3. For replace mode, for each DELETE record: `Model.objects.filter(pk=...).delete()`
4. If any step raises, transaction rolls back; 409 response if PK set changed since preview

### Frontend: `ImportExportDrawer` Props

```typescript
interface ImportExportDrawerProps {
  contentTypeLabel: string   // e.g. "finance.account"
  displayName: string        // e.g. "Accounts"
  open: boolean
  onClose: () => void
}
```

### Frontend: Clipboard Flow

- **Export copy**: `navigator.clipboard.writeText(csvString)`
- **Import paste**: Textarea for manual paste (clipboard read requires user gesture; textarea is more reliable cross-browser)

### Finance Domain Registration (in `finance/apps.py`)

```python
# Called in FinanceConfig.ready()
from io.registry import register
register(TableDescriptor(
    content_type_label="finance.currency",
    display_name="Currencies",
    model_class=Currency,
    system_fields=[...],
    has_user_attributes=False,
    import_order=1,
))
# ... repeat for account (import_order=3), balancesheet (4), exchangerate (5), balance (6)
```
