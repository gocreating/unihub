# Research: Database Import/Export

**Branch**: `002-db-import-export` | **Date**: 2026-05-20

## Decision Log

### 1. Where to house the import/export backend code

**Decision**: New Django app `io` under `apps/unihub/backend/`

**Rationale**: Import/export is infrastructure-level transport logic distinct from the entity/attribute infrastructure already in `core`. Adding it to `core` would conflate two concerns. A standalone `io` app keeps it isolated, independently testable, and consistent with the Domain Addition Protocol (Principle II).

**Alternatives considered**:
- Add to `core` app: rejected — `core` already owns the attribute storage system; mixing CSV transport logic there would make `core` do two jobs.
- Add as management commands only: rejected — the spec requires a UI and clipboard support, both of which require HTTP endpoints.

---

### 2. CSV parsing / ZIP handling

**Decision**: Python stdlib `csv` module for CSV, `zipfile` module for ZIP archives.

**Rationale**: Both are available in the standard library with no new dependencies. The `csv` module handles quoting, escaping, and Unicode well when opened with `encoding='utf-8'`. `zipfile` handles multi-table ZIP creation/reading.

**Alternatives considered**:
- `pandas`: rejected — heavyweight dependency for a task the stdlib handles.
- `openpyxl` (Excel): rejected — spec explicitly targets `.csv`; Excel is out of scope.

---

### 3. Change preview — stateless vs. server-side caching

**Decision**: Stateless — preview and confirm both receive the full CSV payload; the server recomputes the diff on confirm and applies it inside `transaction.atomic`.

**Rationale**: Stateless design means no session cache, no expiry logic, and no stale-preview risk. The CSV payload is small enough to send twice (preview then confirm). Django's `transaction.atomic` guarantees the confirm is all-or-nothing.

**Alternatives considered**:
- Store preview in Django cache keyed by session token: rejected — adds cache dependency and requires managing expiry.
- Store ImportJob in DB: rejected — persisting ephemeral preview data adds model churn; the spec does not require resumable imports.

---

### 4. Table registry design

**Decision**: Declarative registry in `io/registry.py` — a dict mapping `content_type_label` (e.g., `"finance.account"`) to a `TableDescriptor` dataclass. Each domain app explicitly calls `io.registry.register(...)` inside its `AppConfig.ready()`.

**Rationale**: Explicit registration keeps the `io` app decoupled from domain internals while remaining discoverable. The `content_type_label` key is the same identifier already used by the frontend's `AttributeDefinition` API, so the contract is consistent.

**Alternatives considered**:
- Autodiscovery via Django's app registry: rejected — fragile; depends on a naming convention that must be enforced across all future apps.
- Hard-coding the table list in `io`: rejected — violates Principle II (domain independence); `io` should not import domain model classes directly.

---

### 5. AttributeValue handling in CSV

**Decision**: For model classes registered with user-defined attribute support, each `AttributeDefinition` linked to that content type becomes an extra column in the export CSV. On import, `AttributeValue` records are upserted alongside the main model row inside the same transaction.

**Rationale**: Principle I requires that all attributes — system and user-defined — flow through the same infrastructure. Exporting a model row without its AttributeValues would produce an incomplete CSV that cannot round-trip. Bracketed column headers (`[attr_name]:data_type`) directly reflect the `is_system` flag on `AttributeDefinition`.

**Header format**:
- System-defined field: `{column_name}:{data_type}` → e.g., `id:string`, `name:text`, `amount:decimal`
- User-defined attribute: `[{attr_name}]:{data_type}` → e.g., `[priority]:single_select`, `[notes]:long_text`

**Data type strings** (mapping from Django / AttributeDefinition types):
| Source type | CSV data_type |
|---|---|
| `CharField` / `TextField` | `text` |
| `DecimalField` | `decimal` |
| `IntegerField` / `AutoField` | `integer` |
| `BooleanField` | `boolean` |
| `DateField` | `date` |
| `DateTimeField` | `datetime` |
| `ForeignKey` | `string` (serialized as PK value) |
| AttributeDefinition `text` | `text` |
| AttributeDefinition `long_text` | `long_text` |
| AttributeDefinition `number` | `number` |
| AttributeDefinition `date` | `date` |
| AttributeDefinition `boolean` | `boolean` |
| AttributeDefinition `single_select` | `single_select` |

---

### 6. FK serialization in CSV

**Decision**: ForeignKey values are serialized as their PK (the referenced record's ID string), not their display name.

**Rationale**: Round-trip fidelity requires that importing an exported CSV restores the original relationship. Display names can change; PKs are stable. The `TableDescriptor` includes an explicit FK-field list so the importer knows which columns hold FK references and can validate existence before committing.

**Alternatives considered**:
- Serialize as display name (e.g., currency code instead of currency ID): rejected — ambiguous for non-unique display names and breaks round-trip for renamed records.

---

### 7. Import dependency ordering for multi-table ZIP

**Decision**: The `io` app defines an explicit import order for known Finance tables. When importing from a ZIP, CSVs are processed in this order regardless of ZIP entry order:

1. `finance.currency` (no FK dependencies)
2. `core.attributedefinition` (depends on content types, not on domain entities)
3. `finance.account` (depends on Currency)
4. `finance.balancesheet` (no FK dependencies)
5. `finance.exchangerate` (depends on Currency)
6. `finance.balance` (depends on Account + BalanceSheet)

**Rationale**: FK constraints must be satisfied before dependent rows are inserted. This ordering is deterministic and safe for both upsert and replace modes.

---

### 8. Frontend clipboard and file I/O

**Decision**: Use browser-native Clipboard API (`navigator.clipboard.writeText` / `navigator.clipboard.readText`) for clipboard operations. Use `<input type="file" accept=".csv,.zip">` with `FileReader.readAsText()` for file upload, and `URL.createObjectURL(blob)` + `<a download>` for file download.

**Rationale**: No additional frontend dependencies. The Clipboard API is available in all modern browsers and requires HTTPS (already the case in production). FileReader handles CSV text extraction on the client side before upload.

---

### 9. Frontend UI component choice for preview table

**Decision**: Ant Design `<Table>` inside a `<Drawer>` (not `PageTable`) for the change preview.

**Rationale**: Principle VII mandates `PageTable` for *page-level* tabular views. The import preview is an ephemeral modal/drawer within an existing page — it is not a standalone page. A regular `<Table>` inside a `<Drawer>` is the correct Ant Design pattern for this use case and does not violate the constitution.

---

### 10. Frontend entry point

**Decision**: Import/Export is triggered from a toolbar button on existing domain table pages (e.g., Accounts, Exchange Rates). No new route or top-level page. A shared `<ImportExportDrawer>` component is placed in `src/components/ImportExport/` and rendered as a sibling of `PageTable` in each page that opts in.

**Rationale**: Import/export is an action on a specific table, not a destination. Keeping it as a drawer tied to the table view makes the scope clear and avoids an extra navigation entry.
