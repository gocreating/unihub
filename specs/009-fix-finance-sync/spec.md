# Feature Specification: Fix Finance Data Sync — Systematic Full-Field Coverage

**Feature Branch**: `009-fix-finance-sync`

**Created**: 2026-06-01

**Status**: Draft

**Input**: Currency's `is_base_currency` attribute and Account's `color` attribute are not synced to remote, causing data loss. The fix must be permanent and apply to all tables and all attributes, not only the two fields identified in the issue.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sync Exports Every Attribute of Every Entity (Priority: P1)

A user stores Finance data — currencies, accounts, balance sheets, exchange rates — and syncs it to a remote backup. When they restore data on another device or after a data loss event, every attribute of every record is present exactly as it was before the sync. No field is silently missing regardless of when it was added to the system.

**Why this priority**: Silent data loss during sync is the most severe data integrity failure possible. A backup that omits any field is not a true backup. The user cannot detect the loss until they try to use the missing data — at which point recovery may be impossible.

**Independent Test**: Create records across all entity types (Currency, Account, BalanceSheet, ExchangeRate) with all their attributes populated. Push to remote. Clear local data. Pull from remote. Verify every record and every field matches the original exactly.

**Acceptance Scenarios**:

1. **Given** any Finance entity record with all its attributes set, **When** the user pushes data to remote, **Then** every attribute of that record is included in the exported dataset.
2. **Given** a complete exported dataset, **When** the user pulls data from remote, **Then** every record is restored with all its attributes at their original values.
3. **Given** a new attribute is added to any entity type in the future, **When** that entity is synced, **Then** the new attribute is automatically included in export and import without requiring any manual update to the sync mechanism.
4. **Given** records across all entity types, **When** a full push-and-pull cycle completes, **Then** zero fields are silently omitted for any record in any table.

---

### User Story 2 - Sync Preview Detects Changes to Any Attribute (Priority: P1)

A user modifies a record — for example, marks a currency as a base currency or assigns a color to an account — and then views the publish preview before syncing. The preview correctly identifies the record as modified and counts it in the change summary, regardless of which attribute was changed.

**Why this priority**: If the sync preview misses changes to certain attributes, the user cannot know what data will be synced and may make incorrect decisions about when to push. The preview must reflect the complete state of all data.

**Independent Test**: Change only the `is_base_currency` flag on a Currency record. Open the publish preview. Verify that Currency appears in the modified count. Repeat with Account `color`. Repeat with any other single-attribute change across all entity types.

**Acceptance Scenarios**:

1. **Given** any attribute of any entity record is changed, **When** the user views the publish preview, **Then** that record is counted as modified in the preview.
2. **Given** an attribute was previously omitted from sync, **When** the fix is applied and the user views the publish preview, **Then** records that differ in that attribute between local and remote are counted as modified (not silently treated as unchanged).
3. **Given** no changes have been made to any record, **When** the user views the publish preview, **Then** the preview correctly shows zero modified records (no false positives from the expanded field set).

---

### User Story 3 - Backward Compatibility: Import Succeeds with Older Remote Datasets (Priority: P2)

A user has a remote dataset that was exported before the sync fix was applied — it may be missing columns that exist in the current data model. When the user pulls that older dataset, the import completes without error. Missing fields are filled with safe defaults, and no existing data is corrupted.

**Why this priority**: Users who have been syncing data before this fix have older remote snapshots. The fix must not break their ability to restore from those snapshots.

**Independent Test**: Create a remote dataset with deliberately missing columns (simulating an older export). Perform a pull. Verify import succeeds, missing fields receive safe defaults, and all present fields are restored correctly.

**Acceptance Scenarios**:

1. **Given** a remote dataset missing one or more columns that currently exist in the data model, **When** the user pulls, **Then** the import completes without error.
2. **Given** a missing column in an imported dataset, **When** the import applies defaults, **Then** the defaults are safe and non-destructive (e.g., boolean fields default to false, optional string fields default to empty string).
3. **Given** a remote dataset created with the new full-field export, **When** pulled into a system running an older version (forward-compatibility), **Then** unknown columns are ignored gracefully rather than causing an error.

---

### Edge Cases

- What if a newly added field has no safe default? — The sync mechanism must document which default applies per field type; if no safe default exists, the import must flag that record rather than silently applying an incorrect value.
- What if the same field name exists in two different entity types with incompatible types? — Each entity type's export and import is independent; there is no cross-table field conflict.
- What if a field is removed from a model in the future? — Columns present in the remote dataset but absent from the current model are ignored on import, preserving forward-compatibility.
- What if the remote dataset is very large (many tables, many records)? — The sync mechanism must handle all records across all tables in a single sync operation without truncating any table.

## Requirements *(mandatory)*

### Functional Requirements

**Comprehensive Export**

- **FR-001**: The data sync export MUST include all persisted attributes of every registered entity type (Currency, Account, BalanceSheet, ExchangeRate, and any future entity type added to the sync registry).
- **FR-002**: When a new attribute is added to any entity type, it MUST be automatically included in the next export without requiring a manual change to the sync mechanism.
- **FR-003**: The export MUST NOT omit any attribute that is stored in the system's data store for any registered entity type.

**Comprehensive Import**

- **FR-004**: The data sync import MUST restore all attributes present in an exported dataset for every registered entity type.
- **FR-005**: When an imported dataset contains a column that is absent in the current data model (forward-compatibility), the import MUST ignore that column and continue without error.
- **FR-006**: When the current data model contains a field that is absent from an older imported dataset (backward-compatibility), the import MUST apply a safe default for that field rather than failing. Safe defaults: boolean → `false`, optional string → empty string, optional number → `null`.

**Sync Preview**

- **FR-007**: The publish preview comparison MUST include all persisted attributes of every registered entity type when computing added/modified/deleted counts.
- **FR-008**: A record MUST be counted as "modified" in the publish preview if any of its attributes differ between local and remote — including attributes that were previously omitted from the comparison.

**Illustrative Cases (Minimum Fix)**

The following specific fields are confirmed as currently missing from sync. They are included as the minimum scope of this fix, but the fix must be implemented in a way that covers all fields systematically:

- **FR-009**: Currency `is_base_currency` — MUST be included in export, import, and preview comparison.
- **FR-010**: Account `color` — MUST be included in export, import, and preview comparison.

### Key Entities

- **Currency**: A unit of monetary exchange. All persisted attributes (including `is_base_currency`) must be synced.
- **Account**: A financial account. All persisted attributes (including `color`) must be synced.
- **BalanceSheet**: A snapshot of account balances at a point in time. All persisted attributes must be synced.
- **ExchangeRate**: A conversion rate between two currencies at a specific date. All persisted attributes must be synced.
- **Sync Dataset**: The exported snapshot of all Finance data stored remotely. Must faithfully represent every persisted attribute of every registered entity type.
- **Sync Registry**: The mechanism that determines which entity types are included in sync. Any entity registered here must have all its attributes synced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a full push-and-pull sync cycle, 100% of records across all entity types have every attribute preserved at its exact original value — zero fields missing or silently defaulted.
- **SC-002**: When a new attribute is added to any entity type, zero changes to the sync mechanism are required for that attribute to be included in the next sync.
- **SC-003**: Importing a dataset that predates the fix (missing columns) completes without error in 100% of cases, with missing fields defaulted safely.
- **SC-004**: The publish preview correctly counts a record as "modified" whenever any of its attributes — including previously omitted ones — differs between local and remote, with zero false negatives.
- **SC-005**: The minimum fix is verified: after a push-and-pull, Currency `is_base_currency` and Account `color` are preserved exactly in 100% of records.

## Assumptions

- The sync mechanism exports and imports Finance data as structured records where each column maps to one entity attribute.
- The root cause is a manually maintained field list in the sync layer that was not updated when `is_base_currency` and `color` were added to the models. Other fields may also be missing; a systematic audit is required.
- All entity types that are registered for sync (Currency, Account, BalanceSheet, ExchangeRate) should have all their fields synced.
- The systemic fix means the sync layer derives its field list automatically from the data model definition rather than maintaining a manual list.
- No migration of existing remote datasets is required. Old remote exports are handled by backward-compatibility defaults.
- The sync feature is the only sanctioned path for remote backup and restore.

## Clarifications

### Session 2026-06-01

- Q: Should the fix cover only the two specific fields mentioned in the issue, or all fields for all tables? → A: The fix must be permanent and systemic — it must cover all fields for all tables. The two specific fields (Currency `is_base_currency`, Account `color`) are illustrative minimum cases, but the solution must ensure no field is ever silently omitted from sync regardless of when it was added.
