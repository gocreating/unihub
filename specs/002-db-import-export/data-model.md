# Data Model: Database Import/Export

**Branch**: `002-db-import-export` | **Date**: 2026-05-20

## Overview

The `io` app has **no persistent database models**. All import/export operations are stateless request-response cycles. The entities below are in-memory / serializer-layer constructs used to define the API contract and internal service interfaces.

---

## Registry Constructs (in-memory, Python)

### TableDescriptor

Registered per-table in `io/registry.py`. Populated by each domain app's `AppConfig.ready()`.

| Field | Type | Description |
|---|---|---|
| `content_type_label` | `str` | Django content type label, e.g. `"finance.account"` |
| `display_name` | `str` | Human-readable table name, e.g. `"Accounts"` |
| `model_class` | `type[Model]` | The Django model class |
| `system_fields` | `list[FieldDescriptor]` | Ordered list of system-defined column descriptors |
| `has_user_attributes` | `bool` | Whether this table supports user-defined AttributeValues |
| `import_order` | `int` | Lower = imported first (FK dependency order) |

### FieldDescriptor

| Field | Type | Description |
|---|---|---|
| `column_name` | `str` | Raw Python/DB field name, e.g. `"currency_id"` |
| `csv_header` | `str` | Header as it appears in CSV, e.g. `"currency_id:string"` |
| `data_type` | `str` | One of: `text`, `long_text`, `number`, `decimal`, `integer`, `boolean`, `date`, `datetime`, `string` |
| `is_pk` | `bool` | True for the primary key field |
| `is_fk` | `bool` | True for ForeignKey fields |
| `fk_content_type_label` | `str \| None` | Content type of the referenced model (if FK) |
| `nullable` | `bool` | Whether the field accepts null |

---

## API Request / Response Schemas

### TableInfo (GET /api/v1/io/tables/ response item)

| Field | Type | Description |
|---|---|---|
| `content_type_label` | `str` | Unique identifier for the table |
| `display_name` | `str` | Human-readable name |
| `fields` | `list[FieldInfo]` | All columns (system + user-defined, ordered) |

### FieldInfo

| Field | Type | Description |
|---|---|---|
| `csv_header` | `str` | Full header string as it appears in CSV (`name:type` or `[name]:type`) |
| `data_type` | `str` | Data type string |
| `is_system` | `bool` | True = system-defined, False = user-defined AttributeDefinition |
| `is_pk` | `bool` | True for the primary key column |

---

### ExportRequest (POST /api/v1/io/export/)

| Field | Type | Required | Description |
|---|---|---|---|
| `tables` | `list[str]` | Yes | Content type labels to export |
| `format` | `"csv" \| "zip"` | No | Defaults to `"csv"` for single table, `"zip"` for multiple |

**Response**: Binary file stream (`Content-Disposition: attachment; filename=...`)
- Single table → `{model_name}.csv` with `Content-Type: text/csv; charset=utf-8`
- Multiple tables → `unihub-export-{YYYYMMDD}.zip` with `Content-Type: application/zip`

---

### ImportPreviewRequest (POST /api/v1/io/import/preview/)

Multipart form data:

| Field | Type | Required | Description |
|---|---|---|---|
| `table` | `str` | Yes | Content type label of target table |
| `mode` | `"upsert" \| "replace"` | Yes | Import mode |
| `csv_text` | `str` | One of | Raw CSV text (from clipboard paste) |
| `csv_file` | `file` | One of | Uploaded `.csv` file |

---

### ImportPreviewResponse

| Field | Type | Description |
|---|---|---|
| `table` | `str` | Content type label |
| `mode` | `"upsert" \| "replace"` | Mode used |
| `creates` | `list[ChangeRecord]` | Rows that will be inserted |
| `updates` | `list[ChangeRecord]` | Rows with changed values |
| `deletes` | `list[ChangeRecord]` | Rows that will be deleted (replace mode only) |
| `errors` | `list[ValidationError]` | Schema/validation issues in the CSV |
| `total_rows_in_csv` | `int` | Number of data rows parsed from the CSV |
| `total_rows_in_db` | `int` | Current row count in the target table |

### ChangeRecord

| Field | Type | Description |
|---|---|---|
| `pk` | `str` | Primary key value of the affected row |
| `operation` | `"create" \| "update" \| "delete"` | Operation type |
| `before` | `dict[str, str] \| None` | Field values before change (update/delete only) |
| `after` | `dict[str, str] \| None` | Field values after change (create/update only) |
| `changed_fields` | `list[str]` | For updates: field names that differ between before/after |

### ValidationError

| Field | Type | Description |
|---|---|---|
| `row` | `int` | 1-based row number in the CSV (0 = header row issue) |
| `column` | `str \| None` | Column name if field-specific |
| `message` | `str` | Human-readable error description |

---

### ImportConfirmRequest (POST /api/v1/io/import/confirm/)

Identical to `ImportPreviewRequest`. Server recomputes the diff and applies it in `transaction.atomic`.

### ImportConfirmResponse

| Field | Type | Description |
|---|---|---|
| `table` | `str` | Content type label |
| `mode` | `"upsert" \| "replace"` | Mode used |
| `created` | `int` | Number of rows created |
| `updated` | `int` | Number of rows updated |
| `deleted` | `int` | Number of rows deleted (replace mode) |

---

## CSV Schema Conventions

### Header Format

```
{raw_column_name}:{data_type}          ← system-defined field
[{attr_name}]:{data_type}              ← user-defined AttributeDefinition
```

### Example Export: `finance.account`

```csv
id:string,name:text,currency_id:string,open_datetime:datetime,close_datetime:datetime,[priority]:single_select,[notes]:long_text
abc123xyz789,Savings,USD,2024-01-01T00:00:00Z,,high,"Monthly savings account"
def456uvw012,Checking,USD,2024-01-01T00:00:00Z,,medium,
```

Rules:
- Empty optional fields are represented as empty string (no quotes needed)
- Datetime values use ISO 8601 UTC format (`YYYY-MM-DDTHH:MM:SSZ`)
- Date values use `YYYY-MM-DD`
- Boolean values: `true` / `false` (lowercase)
- Decimal values: standard decimal notation with `.` separator, no thousands separator
- FK values: serialized as the referenced record's PK string

### Multi-table ZIP Contents

```
unihub-export-20260520.zip
├── finance_currency.csv
├── core_attributedefinition.csv
├── finance_account.csv
├── finance_balancesheet.csv
├── finance_exchangerate.csv
└── finance_balance.csv
```

ZIP entry naming: `{app_label}_{model_name}.csv` (all lowercase, underscore separator).

---

## Registered Tables (v1 Finance domain)

| Content Type Label | Display Name | Has User Attrs | Import Order |
|---|---|---|---|
| `finance.currency` | Currencies | No | 1 |
| `core.attributedefinition` | Attribute Definitions | No | 2 |
| `finance.account` | Accounts | Yes | 3 |
| `finance.balancesheet` | Balance Sheets | No | 4 |
| `finance.exchangerate` | Exchange Rates | No | 5 |
| `finance.balance` | Balances | No | 6 |

---

## State Transitions (Import Flow)

```
[User selects table + mode]
        ↓
[User provides CSV (paste or upload)]
        ↓
POST /import/preview/
        ↓
[Server parses CSV → validates schema → computes diff]
        ↓
  [ValidationError?] → Return errors list; no state change
        ↓
[Preview rendered: creates / updates / deletes]
        ↓
[User reviews and clicks Confirm or Cancel]
        ↓
  [Cancel] → Discard; no state change
  [Confirm] → POST /import/confirm/ → transaction.atomic(diff applied) → Success
```
