# API Contract: Sync Publish Preview

## Endpoint

```
GET /api/v1/sync/publish/preview/
```

**Authentication**: Session (Django session cookie + CSRF token — same as all other sync endpoints)

**Purpose**: Compute a per-table change summary of what would be published to the remote git repository if the user triggers "Publish" now. This is a read-only operation — nothing is staged, committed, or pushed.

---

## Request

No request body. No query parameters.

**Headers required**:
- `Cookie: sessionid=...` (Django session auth)

---

## Responses

### 200 OK — Changes detected

```json
{
  "status": "has_changes",
  "changes": [
    {
      "table": "finance.account",
      "display_name": "Accounts",
      "added": 2,
      "modified": 1,
      "deleted": 0
    },
    {
      "table": "language.wordcard",
      "display_name": "Word Cards",
      "added": 0,
      "modified": 0,
      "deleted": 3
    }
  ]
}
```

- `changes` includes only tables with at least one add, modify, or delete.
- Tables with no changes are omitted from the list.
- `modified` is a count of records where at least one field value differs between the current DB and the last committed HEAD CSV.

### 200 OK — Nothing to publish

```json
{
  "status": "up_to_date"
}
```

Returned when the current DB state is identical to the last published HEAD commit across all tables.

### 200 OK — First-ever publish (no prior commit)

```json
{
  "status": "no_prior_publish",
  "changes": [
    {
      "table": "finance.currency",
      "display_name": "Currencies",
      "added": 5,
      "modified": 0,
      "deleted": 0
    }
  ]
}
```

Returned when the local clone exists but has no commits (fresh empty repository). All local records are shown as `added`. Tables with 0 records are omitted.

### 400 Bad Request — Sync not configured

```json
{
  "error": "not_configured"
}
```

Returned when no `SyncConfig` exists.

### 500 Internal Server Error — Git operation failed

```json
{
  "error": "git_error",
  "message": "Could not read remote clone. Check sync configuration."
}
```

PAT is never included in error messages (sanitised by `GitSyncService._sanitise()`).

---

## Behaviour Notes

- This endpoint calls `ensure_clone()` internally — if the local clone is absent or corrupt, it will be re-created.
- The comparison is always: **current local DB** vs **last committed HEAD in the local clone** (not vs FETCH_HEAD / remote). It answers "what will change if I push right now" — not "what is different from the remote."
- The endpoint does NOT fetch from the remote. Remote status (ahead/behind) is a separate concern (`GET /api/v1/sync/status/`).
- Response time depends on table size; for typical personal data volumes (hundreds of records per table) should complete in well under 5 seconds.

---

## Existing Endpoints — Unchanged Contracts

The following existing endpoints retain their contracts with no changes:

| Endpoint | Contract |
|---|---|
| `POST /api/v1/sync/publish/` | Unchanged — still exports, commits, and pushes without a preview step server-side |
| `POST /api/v1/sync/force-publish/` | Unchanged |
| `GET /api/v1/sync/apply/preview/` | Unchanged |
| `POST /api/v1/sync/apply/confirm/` | Unchanged |
| `GET /api/v1/sync/status/` | Unchanged |
| `GET/PUT/DELETE /api/v1/sync/config/` | Unchanged |
