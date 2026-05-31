# Feature Specification: Data Sync Migration Fix & Publish Preview

**Feature Branch**: `007-data-sync-migration-fix`

**Created**: 2026-05-31

**Status**: Draft

**Input**: User description: "Bug: Data migration is not reflecting latest tables and failed to give correct diff with remote. The data migration function should auto discover all tables instead of hard coding them in codebase. New feature: Allow user to preview changes before push database snapshot to git remote."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - All Data Categories Are Included in Sync (Priority: P1)

The user adds a new domain to the application (e.g., health, music, language). When they next open the Sync tab and trigger a publish, the system automatically includes all data from the new domain alongside every existing domain — without any manual configuration change.

Previously, certain domains could be silently omitted from sync because the list of data categories was fixed in the codebase. After this fix, the system continuously reflects the full, up-to-date set of data categories whenever it exports, diffs, or syncs.

**Why this priority**: Correctness is foundational. If data categories are missing, the diff with the remote is wrong, and apply/publish operations are incomplete. All other sync and migration improvements depend on this working correctly.

**Independent Test**: Can be fully tested by adding a new data domain, navigating to the Sync tab, triggering Publish, and verifying via the remote GitHub repository that CSV files for the new domain appear in the committed snapshot. Delivers correctness as standalone value.

**Acceptance Scenarios**:

1. **Given** all data domains currently exist in the application, **When** the user triggers "Publish", **Then** the snapshot committed to the remote repository contains one CSV file per domain, with no domain omitted.
2. **Given** the application has been extended with a new data domain since the last publish, **When** the user triggers "Publish", **Then** the new domain's data is automatically included in the snapshot without any configuration change.
3. **Given** a data domain has been removed from the application, **When** the user triggers "Publish", **Then** the removed domain's CSV file is no longer included in the snapshot.
4. **Given** the user views the sync status on the Sync tab, **When** the remote diff is calculated, **Then** the diff reflects all current data domains — not a stale or partial subset.

---

### User Story 2 - Preview Changes Before Publishing to Remote (Priority: P2)

The user has been working on Device A and wants to push their latest data snapshot to the remote repository. Before committing, they want to review exactly what has changed compared to the remote — which data categories have new, modified, or deleted records — so they can make an informed decision whether to proceed.

**Why this priority**: Prevents accidental overwrites. The user may have made unintentional changes or may be unsure whether local data is up-to-date. A publish preview gives them a chance to verify before the push is final.

**Independent Test**: Can be fully tested on a single device with prior publish history. The user triggers Publish, sees a change summary across all data categories, and chooses to confirm or cancel. The remote is only updated when the user confirms.

**Acceptance Scenarios**:

1. **Given** the user triggers "Publish" and local data differs from the last published remote snapshot, **When** the system prepares the publish, **Then** it first displays a per-category change summary showing how many records have been added, changed, or removed in each category, before pushing anything.
2. **Given** the publish preview is displayed, **When** the user reviews and confirms, **Then** the system proceeds to push the snapshot to the remote repository and shows a success confirmation.
3. **Given** the publish preview is displayed, **When** the user cancels, **Then** no data is pushed and the user is returned to the Sync tab with nothing changed.
4. **Given** the user triggers "Publish" and local data is identical to the last published remote snapshot, **When** the system checks for changes, **Then** the system skips the preview and informs the user that everything is already up to date (no push is made).
5. **Given** no prior publish exists on the remote (first-ever publish), **When** the user triggers "Publish", **Then** the system shows a preview indicating all records across all categories are new and asks for confirmation before pushing.
6. **Given** the system cannot calculate the diff (e.g., the remote is unreachable), **When** the user triggers "Publish", **Then** the system surfaces a descriptive error and does not proceed with the push.

---

### Edge Cases

- What happens if a data category exists in the remote snapshot but no longer exists in the local application (orphaned CSV in remote)?
- How does the preview handle extremely large changesets (thousands of records changed) — does it summarise by count rather than list every record?
- What if the diff calculation itself fails mid-way with partial results — does the system show partial data or block the publish entirely?
- What happens when the user navigates away from the preview screen without confirming or cancelling?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST automatically discover all currently active data categories at sync time rather than relying on a fixed, manually maintained list.
- **FR-002**: The auto-discovered data category list MUST be used for all sync and migration operations: export snapshot, diff with remote, publish, and apply.
- **FR-003**: When the user triggers "Publish", the system MUST calculate a per-category diff between the local state and the last published remote snapshot before committing or pushing anything.
- **FR-004**: The publish preview MUST display, for each data category that has changes: the number of records added, the number of records changed, and the number of records removed.
- **FR-005**: Data categories with no changes MUST either be hidden from or clearly marked as unchanged in the publish preview, so the user can focus on what has actually changed.
- **FR-006**: The publish MUST NOT proceed until the user explicitly confirms the preview.
- **FR-007**: The user MUST be able to cancel from the publish preview without triggering any push to the remote.
- **FR-008**: When no changes are detected between local and remote, the system MUST skip the preview and inform the user that the remote is already up to date.
- **FR-009**: When no prior remote publish exists (first-ever publish), the system MUST display a preview indicating all records are new and require confirmation before pushing.
- **FR-010**: All existing sync behaviours (apply latest, diverged-history handling, configuration management) MUST continue to work correctly after these changes.

### Key Entities

- **DataCategory**: A logical grouping of records within the application (e.g., one per domain: finance, visiting, language, people, music). The set of data categories is derived dynamically from what the application currently manages, not from a static list.
- **ChangeSet**: A per-category summary of differences between the local state and the last published remote snapshot — comprising counts of added, changed, and removed records. Produced during the publish preview flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any new data domain is added to the application, the next publish automatically includes that domain without any manual intervention — 0 domains omitted.
- **SC-002**: The publish preview is displayed to the user before any data is sent to the remote, every time local data differs from the remote state.
- **SC-003**: The publish preview accurately reflects the actual changes committed: the remote snapshot after a confirmed publish differs from the prior remote snapshot by exactly the records shown in the preview.
- **SC-004**: 100% of confirmed publish operations only proceed after explicit user confirmation via the preview step — no accidental pushes occur.
- **SC-005**: The remote diff displayed in the Sync status on tab load reflects all current data categories, not a partial or outdated subset.

## Assumptions

- A "data category" corresponds to one database table / one exported CSV file, consistent with the existing per-table CSV export convention.
- The publish preview shows record-count-level summaries per category, not field-level diffs for individual records — row-level detail is out of scope.
- The diff is computed by comparing current local data against the most recently committed CSV files in the remote git repository.
- When no prior publish exists on the remote, all local records are treated as additions and shown as such in the preview.
- The existing Apply Latest preview (per-table change preview before importing) is not modified by this feature — only the Publish flow gains a new preview step.
- Single-user application; no concurrent publish conflicts between users on the same device are considered.
- Mobile support is out of scope.
