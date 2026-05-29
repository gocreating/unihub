# Research: Data Sync Across Devices

**Phase**: 0 | **Feature**: 004-data-sync-devices | **Date**: 2026-05-27

---

## Decision 1: Where to house the sync Django app

**Decision**: New standalone `sync` Django app under `apps/unihub/backend/sync/`.

**Rationale**: The `data_io` app is already focused on the stateless CSV/ZIP import-export concern. Sync adds stateful concerns (stored credentials, repo clone lifecycle, git operations). Keeping them separate honours the single-responsibility principle and is consistent with the project's domain-app pattern. The `sync` app imports from `data_io` services for export/import—this is an infrastructure-to-infrastructure dependency, not a domain-to-domain one, so it does not violate Constitution Principle II.

**Alternatives considered**:
- Extend `data_io` app: Would conflate stateless I/O with stateful sync credential management and git orchestration. Rejected.

---

## Decision 2: Git authentication mechanism

**Decision**: Embed the PAT directly in the remote HTTPS URL at runtime (`https://<pat>@github.com/user/repo`). The authenticated URL is constructed only when git commands run and is never persisted or logged.

**Rationale**: This is the standard credential-free approach for server-side git automation. No git credential helper configuration is needed. Combined with `GIT_TERMINAL_PROMPT=0` to prevent interactive prompts, it works reliably in Docker containers.

**Alternatives considered**:
- Git credential helper (`git config credential.helper`): Requires writing to `.git/config` and managing helper lifecycle. More complex, no meaningful security gain over URL embedding for a personal project. Rejected.
- SSH key on server: Requires the user to upload a private key and manage server-side SSH config. Higher complexity; PAT is simpler and scoped to a single repo. Rejected per spec (HTTPS + PAT is the decided approach).

---

## Decision 3: PAT encryption at rest

**Decision**: Encrypt stored PAT using `cryptography.fernet.Fernet`, with the key derived via `hashlib.sha256(settings.SECRET_KEY.encode())`. Add `cryptography` to backend dependencies via `uv add cryptography`.

**Rationale**: `cryptography` is an industry-standard library already present as a transitive dependency in most Django deployments. Fernet provides symmetric AES-128-CBC encryption with HMAC-SHA256 authentication. Deriving the Fernet key from Django's `SECRET_KEY` means the PAT is unreadable without the application's secret—suitable for a personal self-hosted project.

**Alternatives considered**:
- Plain text storage: Acceptable for a personal project but violates the spec requirement "stored securely server-side". Rejected.
- `django.core.signing`: Uses HMAC for tamper detection, not AES encryption. A signed value is decodable (just base64) by anyone with the data. Rejected.

---

## Decision 4: Git operations — subprocess vs. library

**Decision**: Use Python's `subprocess.run()` for all git commands. No new git library dependency.

**Rationale**: The full set of git commands needed (clone, fetch, pull, add, commit, push, rev-list) is simple and well-understood. `subprocess` keeps the dependency surface minimal and the commands transparent. Errors are captured via `stderr` and surfaced to the user directly.

**Key subprocess safety rules**:
- Always pass `env` with `GIT_TERMINAL_PROMPT=0` and `GIT_ASKPASS=/bin/true` to prevent interactive prompts.
- Set `timeout=60` on all git commands to prevent hanging.
- Never log the authenticated remote URL; strip the PAT before surfacing errors.

**Alternatives considered**:
- `gitpython`: Higher-level API but adds a dependency and its async handling is limited. The extra abstraction isn't warranted for this command set. Rejected.
- `pygit2`/`libgit2`: C extension, more complex to install in Docker. Rejected.

---

## Decision 5: Local repo clone lifecycle

**Decision**: The server maintains a single local clone of the configured repository at a path derived from `settings.SYNC_REPO_DIR` (default: `{BASE_DIR}/../sync_repo`). The clone is created on first publish/apply and re-cloned automatically if the directory is missing or corrupt.

**Rationale**: A persistent clone avoids re-cloning on every operation (slow for large histories). Django's `BASE_DIR` is already defined in `settings.py`; a sibling directory keeps it within the Docker volume mount. Auto-recovery on missing/corrupt clone prevents stuck states.

**Alternatives considered**:
- Temporary directory per operation (`tempfile.mkdtemp`): Clean but slow — full clone every sync. Rejected.
- User-configurable path stored in `SyncConfig`: Adds unnecessary configuration surface for a personal project. Rejected.

---

## Decision 6: Publish flow — reusing data_io export services

**Decision**: The sync publish step calls `data_io.services.csv_exporter.export_table(descriptor)` for each registered table, writes the resulting bytes as `{app}_{model}.csv` files to the clone directory, then runs `git add -A`, `git commit`, `git push`.

**Rationale**: `export_table()` already handles all value serialization, FK natural keys, user-defined attributes, and NULL handling. Reusing it means sync data is byte-for-byte identical to a manual export—satisfying FR-012 with zero additional serialization code.

**File naming**: `_zip_entry_name(label)` in `csv_exporter.py` already converts `finance.account` → `finance_account.csv`. The same helper is used for sync.

---

## Decision 7: Apply flow — reusing data_io import services

**Decision**: The apply flow reads CSV files from the local clone after `git pull`, then passes each CSV through the existing `data_io` import pipeline: `parse_csv()` → `change_preview.compute_diff()` for preview, and the `ImportZipConfirmView` logic (topological sort + `transaction.atomic()` upsert/replace) for confirm.

**Rationale**: The ZIP confirm view already handles multi-table import in dependency order within a single transaction. Reusing this logic ensures apply semantics are identical to a manual ZIP import—the spec's stated intent. No new import code is needed.

---

## Decision 8: Status check implementation

**Decision**: `GET /api/v1/sync/status/` runs `git fetch origin --quiet` followed by `git rev-list --left-right --count HEAD...origin/HEAD` to compute ahead/behind counts. The result maps to: `in_sync` (0/0), `ahead` (>0/0), `behind` (0/>0), or `diverged` (>0/>0).

**Rationale**: `git rev-list --left-right --count` is the canonical two-number ahead/behind query. Running `git fetch` first ensures the comparison reflects the actual remote state. The `--quiet` flag suppresses output noise.

**Note on `no_remote` state**: If the local clone does not exist or has never been pushed to, `git rev-list` will fail. This is surfaced as `status: "no_remote"`.

---

## Decision 9: Sync tab placement

**Decision**: The Sync feature is added as a third tab in the existing IO page (`apps/unihub/frontend/src/pages/io/index.tsx`). The current page already renders `<Tabs defaultActiveKey="export" items={tabs} size="large" />`. A new tab item `{ key: 'sync', label: <FormattedMessage id="pages.io.sync.tabLabel" />, children: <SyncTab /> }` is appended.

**Rationale**: The spec explicitly requires a "Sync" tab within the data migration page. The Ant Design `Tabs` component already in use makes this a one-line addition to the `tabs` array.
