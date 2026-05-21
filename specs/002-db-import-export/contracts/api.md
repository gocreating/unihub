# API Contract: Import/Export (`io` app)

**Base path**: `/api/v1/io/`
**Auth**: Session-based (all endpoints require authenticated user)

---

## GET /api/v1/io/tables/

List all tables available for import/export, including their field schemas.

**Response 200**:
```json
[
  {
    "content_type_label": "finance.account",
    "display_name": "Accounts",
    "fields": [
      { "csv_header": "id:string",               "data_type": "string",    "is_system": true,  "is_pk": true  },
      { "csv_header": "name:text",               "data_type": "text",      "is_system": true,  "is_pk": false },
      { "csv_header": "currency_id:string",      "data_type": "string",    "is_system": true,  "is_pk": false },
      { "csv_header": "open_datetime:datetime",  "data_type": "datetime",  "is_system": true,  "is_pk": false },
      { "csv_header": "close_datetime:datetime", "data_type": "datetime",  "is_system": true,  "is_pk": false },
      { "csv_header": "[priority]:single_select","data_type": "single_select","is_system": false,"is_pk": false }
    ]
  }
]
```

---

## POST /api/v1/io/export/

Export one or more tables as CSV or ZIP.

**Request** (`application/json`):
```json
{
  "tables": ["finance.account", "finance.currency"],
  "format": "zip"
}
```

| Field | Required | Default | Validation |
|---|---|---|---|
| `tables` | Yes | — | Non-empty list; each must be a registered content_type_label |
| `format` | No | `"csv"` if 1 table, `"zip"` if >1 | Must be `"csv"` or `"zip"` |

**Response 200**: Binary file stream
- Single table, CSV: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="{model_name}.csv"`
- Multiple tables or format=zip: `Content-Type: application/zip`, `Content-Disposition: attachment; filename="unihub-export-{YYYYMMDD}.zip"`

**Error 400**: `tables` is empty, unknown table, or `format="csv"` with multiple tables.

---

## POST /api/v1/io/import/preview/

Parse a CSV and compute the change diff without writing to the database.

**Request** (`multipart/form-data`):

| Field | Required | Description |
|---|---|---|
| `table` | Yes | Content type label of target table |
| `mode` | Yes | `"upsert"` or `"replace"` |
| `csv_text` | One of | Raw CSV string (clipboard paste) |
| `csv_file` | One of | Uploaded `.csv` binary file |

**Response 200**:
```json
{
  "table": "finance.account",
  "mode": "upsert",
  "total_rows_in_csv": 3,
  "total_rows_in_db": 5,
  "creates": [
    {
      "pk": "newid000001",
      "operation": "create",
      "before": null,
      "after": { "id:string": "newid000001", "name:text": "Brokerage", "currency_id:string": "USD" },
      "changed_fields": []
    }
  ],
  "updates": [
    {
      "pk": "abc123xyz789",
      "operation": "update",
      "before": { "name:text": "Savings" },
      "after":  { "name:text": "Long-term Savings" },
      "changed_fields": ["name:text"]
    }
  ],
  "deletes": [],
  "errors": []
}
```

**Response 200 with errors** (schema/validation failures — no changes applied regardless):
```json
{
  "table": "finance.account",
  "mode": "upsert",
  "total_rows_in_csv": 0,
  "total_rows_in_db": 5,
  "creates": [],
  "updates": [],
  "deletes": [],
  "errors": [
    { "row": 1, "column": "currency_id:string", "message": "Currency 'XYZ' does not exist" },
    { "row": 0, "column": null, "message": "Missing required column: name:text" }
  ]
}
```

**Error 400**: Missing required fields (`table`, `mode`), neither `csv_text` nor `csv_file` provided, unregistered table.

---

## POST /api/v1/io/import/confirm/

Apply the import. Same request schema as `/preview/`. Server recomputes the diff and applies it in a single database transaction.

**Request**: Identical to `POST /api/v1/io/import/preview/`

**Response 200**:
```json
{
  "table": "finance.account",
  "mode": "upsert",
  "created": 1,
  "updated": 1,
  "deleted": 0
}
```

**Error 400**: Same validation as preview. If validation errors exist, no changes are applied.

**Error 409**: Concurrent modification detected (optimistic check — row count or PK set changed between preview and confirm). Client should re-run preview.

---

## Error Response Format

All error responses follow DRF's standard format:

```json
{ "detail": "human-readable message" }
```

Or field-level validation errors:

```json
{
  "table": ["This field is required."],
  "mode": ["\"invalid_mode\" is not a valid choice."]
}
```
