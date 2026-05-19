# Feature Specification: Database Import/Export

**Feature Branch**: `002-db-import-export`

**Created**: 2026-05-20

**Status**: Draft

**Input**: User description: "Add infrastructure level feature to allow user to import or export database with .csv format. Support upsert and replace modes, clipboard and file sourcing, and change preview."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export Table to CSV File (Priority: P1)

A user wants to back up or inspect data from a specific table by downloading it as a CSV file. They navigate to the import/export interface, select a table, choose export, and receive a `.csv` file. Column headers include the data type annotation (e.g., `id:integer`, `[label]:string`) so the file is self-describing.

**Why this priority**: Export is the safest and most universally needed operation — it requires no write access to the database and unblocks all downstream import workflows by producing reference files.

**Independent Test**: Can be fully tested by triggering an export on any populated table and verifying the downloaded `.csv` has correct headers and data rows.

**Acceptance Scenarios**:

1. **Given** a table with records, **When** the user selects that table and triggers "Download to file", **Then** a `.csv` file is downloaded with system-defined columns as raw names and user-defined columns wrapped in brackets, each suffixed with `:datatype`.
2. **Given** multiple tables are selected for export, **When** the user triggers a bulk export, **Then** a `.zip` file is downloaded containing one `.csv` per table.
3. **Given** the user triggers "Copy to clipboard" for a single table, **When** export completes, **Then** the clipboard contains valid CSV text matching the file-download format.

---

### User Story 2 - Preview Changes Before Import (Priority: P2)

A user wants to import a CSV into the system but needs confidence about what will change before committing. They paste or upload a CSV, see a diff-style preview of records to be created, updated, or deleted (replace mode only), then confirm or cancel.

**Why this priority**: The preview step is a safety gate that makes import trustworthy. Without it, mistakes require manual correction. It protects both upsert and replace workflows.

**Independent Test**: Can be fully tested by importing a CSV with a mix of new rows, modified rows, and (for replace mode) rows absent from the file, then verifying the preview accurately lists each change category before any writes occur.

**Acceptance Scenarios**:

1. **Given** a CSV is pasted or uploaded, **When** the system parses it, **Then** a preview shows: rows to be created (new PKs), rows to be updated (existing PKs with changed values), and — in replace mode only — rows to be deleted (PKs in DB not in CSV).
2. **Given** the user reviews the preview, **When** they click "Cancel", **Then** no changes are written to the database.
3. **Given** the user reviews the preview, **When** they click "Confirm", **Then** the changes shown are applied exactly.

---

### User Story 3 - Import via Upsert Mode (Priority: P3)

A user has a CSV of records to synchronize — adding new entries and updating existing ones — without removing any data already in the table. They paste or upload the CSV, choose "Upsert", review the preview, and confirm.

**Why this priority**: Upsert is the safer import mode and covers the majority of real-world data-sync needs (incremental updates, partial refreshes).

**Independent Test**: Can be fully tested end-to-end by importing a CSV where some rows have existing PKs (should update) and some have new PKs (should insert), verifying no existing rows outside the CSV are removed.

**Acceptance Scenarios**:

1. **Given** a valid CSV in upsert mode, **When** import is confirmed, **Then** rows with matching PKs are updated, rows with new PKs are inserted, and rows not in the CSV are left untouched.
2. **Given** a CSV row has a PK that matches an existing record, **When** import is confirmed, **Then** only the fields present in the CSV are updated; no fields are nulled out.

---

### User Story 4 - Import via Replace Mode (Priority: P4)

A user wants to fully reset a table to exactly what the CSV contains — removing stale rows and replacing all data. They paste or upload the CSV, choose "Replace", review the preview (including deletions), and confirm.

**Why this priority**: Replace mode is a destructive operation and less frequently needed, but important for authoritative data loads (e.g., a reference table managed externally).

**Independent Test**: Can be fully tested by importing a CSV that omits some existing rows, confirming the preview shows those rows as deletions, and verifying after confirmation that the table matches the CSV exactly.

**Acceptance Scenarios**:

1. **Given** a CSV in replace mode, **When** import is confirmed, **Then** the target table's contents exactly match the CSV (inserts, updates, and deletes all applied).
2. **Given** the preview shows rows to be deleted, **When** the user cancels, **Then** no data is modified.

---

### Edge Cases

- What happens when the CSV has columns not present in the target table's schema?
- What happens when required (non-nullable) columns are missing from the CSV?
- How does the system handle a CSV with duplicate PKs within the file itself?
- What happens when a very large CSV (thousands of rows) is pasted or uploaded — does the preview remain responsive?
- What happens when the ZIP contains a CSV for a table that does not exist?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to export any single table as a `.csv` file download.
- **FR-002**: System MUST allow users to export multiple tables simultaneously as a `.zip` file containing one `.csv` per table.
- **FR-003**: System MUST allow users to copy table data to the clipboard in CSV format.
- **FR-004**: System MUST allow users to import a table from a `.csv` file upload.
- **FR-005**: System MUST allow users to import a table by pasting CSV text from the clipboard.
- **FR-006**: System MUST support **upsert mode**: match rows by primary key, insert new rows, update existing rows, and leave unmatched rows untouched.
- **FR-007**: System MUST support **replace mode**: after import, the table must contain exactly the rows in the CSV (inserts, updates, and deletions all applied).
- **FR-008**: System MUST display a change preview before any import is committed, showing records to be created, updated, and (in replace mode) deleted.
- **FR-009**: System MUST NOT apply any changes until the user explicitly confirms the preview.
- **FR-010**: CSV column headers for system-defined attributes MUST use the raw column name (e.g., `id`).
- **FR-011**: CSV column headers for user-defined attributes MUST wrap the column name in brackets (e.g., `[label]`).
- **FR-012**: All CSV column headers MUST be suffixed with `:` followed by the column's data type (e.g., `id:integer`, `[label]:string`).
- **FR-013**: System MUST validate the uploaded/pasted CSV schema against the target table before showing the preview and report any schema mismatches to the user.

### Key Entities

- **Table**: A database table available for import or export; has system-defined and optionally user-defined columns.
- **ImportJob**: Represents a pending import operation — holds the parsed CSV rows, chosen mode (upsert/replace), and computed change diff shown in the preview.
- **ChangePreview**: The diff produced by comparing CSV rows against current table state — categorizes each row as create, update, or delete.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can export any table and re-import the downloaded file without data loss or schema errors — round-trip fidelity is 100%.
- **SC-002**: Change preview renders within 3 seconds for CSVs up to 10,000 rows on a standard connection.
- **SC-003**: After a confirmed upsert import, zero rows outside the CSV are modified or removed.
- **SC-004**: After a confirmed replace import, the table row count and content exactly matches the imported CSV.
- **SC-005**: Users can complete a full export-then-import cycle (single table, file mode) in under 2 minutes without external documentation.

## Assumptions

- The feature targets authenticated admin users; no additional per-table permission model is introduced for v1.
- Primary key columns are always system-defined (never user-defined) and serve as the canonical match key for upsert and replace logic.
- CSV encoding is UTF-8; other encodings are out of scope for v1.
- Multi-table import (from ZIP) supports replace and upsert modes applied per-table using the individual CSV files inside the archive.
- Real-time collaborative editing during an in-progress import is out of scope; imports are single-user atomic operations.
- The clipboard API is browser-native; no browser extension is required.
