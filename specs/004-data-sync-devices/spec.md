# Feature Specification: Data Sync Across Devices

**Feature Branch**: `004-data-sync-across-devices`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Since import/export for the whole system has been implemented, the next step is the integration of data sources so that the user is able to sync data across the internet easily, using a private GitHub repository with git push/pull."

## Clarifications

### Session 2026-05-27

- Q: Should the feature include a sync history view in the UI? → A: No — the feature is scoped to two operations only: publish current snapshot to remote (push) and apply latest snapshot from remote (pull). No history UI needed.
- Q: Is the developer required to maintain an app-key or app-secret for the sync integration? → A: No — all authentication is handled via user-provided credentials on the backend; the unihub developer does not register or maintain any OAuth app, API key, or service credential.
- Q: What credential type should be used for server-side git authentication? → A: HTTPS with a GitHub Personal Access Token (PAT) — user pastes their PAT into a settings field in unihub; the configuration form must include inline guidance to help the user create or regenerate a token on GitHub.
- Q: What should "Publish" do when the remote has newer commits (diverged history)? → A: Warn and offer both paths — show a warning explaining the remote is ahead, then let the user choose either "Apply Latest first" or "Force Publish (overwrite remote)".
- Q: Should the sync status (ahead/behind/in-sync) be checked automatically on page load? → A: Yes — fetch remote state automatically when the Sync tab is opened; show a loading indicator while checking.
- Q: Where in the UI does the sync feature live? → A: As a "Sync" tab within the existing data migration page, alongside the existing Import and Export tabs. The user pastes credentials and triggers push/pull from there.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish Current Snapshot to Remote (Priority: P1)

The user has been working on unihub on Device A. They navigate to the data migration page and open the Sync tab to commit and push their current data state to a private GitHub repository.

**Why this priority**: Foundation of the sync feature — without a push path, there is nothing to pull from. Also delivers standalone value as a versioned cloud backup.

**Independent Test**: The user opens the Sync tab, completes the one-time configuration, triggers "Publish", and can verify via GitHub that new commits containing per-table CSV files were added. Delivers value as a backup even without a second device.

**Acceptance Scenarios**:

1. **Given** the user has not yet configured a sync repository, **When** they open the Sync tab, **Then** they see a setup form asking for the GitHub repository HTTPS URL, a Personal Access Token, and a device name — with inline guidance on how to create a PAT on GitHub.
2. **Given** the user has configured a sync repository, **When** the Sync tab loads, **Then** the system automatically checks the remote status and displays whether the local state is ahead of, behind, or in sync with the remote.
3. **Given** the user has configured a sync repository, **When** they trigger "Publish", **Then** the system exports each table as a separate CSV file, commits all changes, and pushes to GitHub, showing a progress indicator and a success confirmation with the commit timestamp.
4. **Given** a publish is in progress, **When** it fails (e.g., invalid credentials, network error), **Then** the user sees a descriptive error message and can retry without data loss.
5. **Given** no data has changed since the last publish, **When** the user triggers "Publish", **Then** the system informs the user that everything is already up to date and skips the push.
6. **Given** the remote has commits the local clone does not have, **When** the user triggers "Publish", **Then** the system shows a warning explaining the remote is ahead and presents two choices: "Apply Latest First" or "Force Publish (overwrite remote)".

---

### User Story 2 - Apply Latest Snapshot from Remote (Priority: P2)

The user switches to Device B and opens the Sync tab on the data migration page. They want to pull the latest data committed by Device A and import it into the local unihub database.

**Why this priority**: Completes the round-trip with Story 1. Together they form a functional, independently testable sync cycle.

**Independent Test**: With commits already present in the GitHub repo, the user opens the Sync tab on a second device, triggers "Apply Latest", and verifies the local database reflects the pushed data. Fully testable without triggering a publish from the same device.

**Acceptance Scenarios**:

1. **Given** the user has configured the sync repository and new commits exist on the remote, **When** they trigger "Apply Latest", **Then** the system fetches the latest CSV files and presents a per-table change preview (affected tables, record counts) before importing.
2. **Given** the user confirms the preview, **When** the import completes, **Then** all tables match the state captured in the latest remote commit, and the user sees a summary of changes applied.
3. **Given** the local database already contains data, **When** the user confirms an apply, **Then** existing data is replaced (upsert/replace semantics consistent with the existing import feature) after explicit confirmation.
4. **Given** the local sync clone is already up to date with the remote, **When** the user triggers "Apply Latest", **Then** the system informs the user that no new changes are available.

---

### Edge Cases

- What happens when the remote repo contains CSV files produced by a different version of the application (schema mismatch)?
- How does the system handle "Apply Latest" when the remote repository is empty or has no prior commits?
- What if the user-provided PAT is invalid or has been revoked?
- What if the automatic status check on tab load fails due to a network error?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sync feature MUST be surfaced as a "Sync" tab within the existing data migration page, alongside the Import and Export tabs.
- **FR-002**: System MUST allow users to configure a private GitHub repository (HTTPS URL), a GitHub Personal Access Token (PAT), and a device name as the sync credentials — without requiring the unihub developer to register or maintain any OAuth app, API key, or service credential.
- **FR-003**: The sync configuration form MUST include inline guidance (instructions or link) explaining how to create or regenerate a GitHub Personal Access Token on GitHub.
- **FR-004**: The Sync tab MUST automatically check the remote status on load and display whether the local state is ahead of, behind, or in sync with the remote, showing a loading indicator while checking.
- **FR-005**: System MUST support publishing all domain data to the configured GitHub repository by exporting each table as a separate CSV file, committing the files, and pushing the commit.
- **FR-006**: System MUST support applying data from the configured GitHub repository by fetching the latest commit, presenting a per-table change preview, and importing the CSV files on user confirmation.
- **FR-007**: System MUST require explicit user confirmation before overwriting local data during an apply operation.
- **FR-008**: System MUST detect when a publish is rejected due to diverged remote history and present the user with two explicit choices: (a) apply the latest remote snapshot first, or (b) force publish, overwriting the remote with the current local state.
- **FR-009**: System MUST provide descriptive error messages for common failure modes (invalid PAT, repository not accessible, network error) and allow the user to retry.
- **FR-010**: System MUST inform the user when there is nothing new to publish (no local changes) or apply (already up to date with remote).
- **FR-011**: System MUST allow users to update or remove the sync repository configuration.
- **FR-012**: The sync payload format MUST use one CSV file per database table, consistent with the existing per-table export format, so sync data is compatible with the manual import/export workflow.

### Key Entities

- **SyncConfig**: The configured GitHub repository HTTPS URL, PAT (stored securely server-side), device name, and path to the local clone on the server. One per installation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete a full publish-then-apply cycle across two devices in under 5 minutes, assuming credentials and repository are already configured on both devices.
- **SC-002**: After a successful apply, 100% of records across all tables match the state captured in the latest published commit.
- **SC-003**: When the Sync tab loads, the remote status (ahead/behind/in-sync) and last publish timestamp are displayed automatically without any additional user action.
- **SC-004**: Sync errors are surfaced with enough detail that the user can self-resolve common failure cases (invalid PAT, diverged history, network errors) without external support.

## Assumptions

- The application is single-user; no multi-user conflict resolution is required.
- "Sync" means full-snapshot publish/apply (last-write-wins per table), not incremental/delta merge.
- Git over HTTPS with a user-provided Personal Access Token (PAT) is the sync transport. The unihub developer registers nothing; the user supplies their own fine-grained PAT scoped to the target repository. No SSH key management or cloud storage OAuth app registration is required.
- Every device that participates in sync must have the sync repository configured with valid credentials — this is a documented prerequisite, not handled automatically by the application.
- The application server clones the configured repository locally and runs git operations server-side using the stored PAT.
- Device identity is the device name the user sets during sync configuration; no automatic device discovery.
- No automatic or scheduled sync in v1 — all sync operations are user-triggered.
- Mobile support is out of scope for v1.
- The per-table CSV format is identical to the one produced by the existing export feature, ensuring manual import/export and sync are interchangeable.
