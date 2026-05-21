# Quickstart: Database Import/Export

## Local Dev Setup

No new dependencies — Python stdlib handles CSV and ZIP. No frontend packages needed.

After implementing the `io` app:

```bash
# Backend: add 'io' to INSTALLED_APPS, run migrations (io has no models, so no-op)
cd apps/unihub/backend
uv run python manage.py migrate

# Regenerate OpenAPI schema so frontend types stay in sync
uv run python manage.py spectacular --color --file openapi.yaml

# Frontend: regenerate types from updated schema
cd apps/unihub/frontend
pnpm generate:types
```

## Testing an Export (curl)

```bash
# Single table export
curl -s -X POST http://localhost:8000/api/v1/io/export/ \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: <token>" \
  --cookie "sessionid=<sessionid>" \
  -d '{"tables": ["finance.currency"], "format": "csv"}' \
  -o currencies.csv

# Multi-table ZIP
curl -s -X POST http://localhost:8000/api/v1/io/export/ \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: <token>" \
  --cookie "sessionid=<sessionid>" \
  -d '{"tables": ["finance.currency", "finance.account"], "format": "zip"}' \
  -o export.zip
```

## Testing an Import Preview (curl)

```bash
# Paste-mode (CSV text)
curl -s -X POST http://localhost:8000/api/v1/io/import/preview/ \
  -H "X-CSRFToken: <token>" \
  --cookie "sessionid=<sessionid>" \
  -F "table=finance.currency" \
  -F "mode=upsert" \
  -F "csv_text=code:string,name:text,symbol:text
USD,US Dollar,\$
EUR,Euro,€"
```

## Round-trip Smoke Test

1. Export `finance.currency` as CSV
2. Add a new row to the CSV (new currency code)
3. Import preview — verify 1 CREATE shown
4. Import confirm — verify `created: 1`
5. Export again — verify the new row appears

## UI Entry Point

The Import/Export drawer appears as a toolbar button on Finance domain table pages (Accounts, Exchange Rates, etc.). The button opens a `<Drawer>` with:
- **Export tab**: select format + click Download / Copy to Clipboard
- **Import tab**: select mode → paste/upload → review preview → confirm

## Key Files (post-implementation)

```
apps/unihub/backend/
  io/
    registry.py           ← Table registry (TableDescriptor)
    services/
      csv_exporter.py     ← Serialize model rows → CSV bytes
      csv_importer.py     ← Parse CSV → validate → ChangeRecord list
      change_preview.py   ← Diff CSV rows against DB rows
    views.py              ← TablesView, ExportView, ImportPreviewView, ImportConfirmView
    urls.py               ← Route registration
    tests/
      test_export.py
      test_import_preview.py
      test_import_confirm.py

apps/unihub/frontend/src/
  components/ImportExport/
    index.tsx             ← ImportExportDrawer (entry point)
    ExportPanel.tsx       ← Export tab UI
    ImportPanel.tsx       ← Import tab UI (paste / upload)
    ChangePreviewTable.tsx← Diff viewer (Ant Design Table in Drawer)
  services/unihub-backend/
    io.ts                 ← listTables(), exportTables(), importPreview(), importConfirm()
```
