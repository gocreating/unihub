# API Contract: Sync

**Base path**: `/api/v1/sync/`
**Authentication**: Session (Django built-in + DRF session auth)
**Content-Type**: `application/json` (except where noted)

All endpoints require an authenticated session. Unauthenticated requests return `403`.

---

## GET /api/v1/sync/config/

Returns the current sync configuration. PAT is never included in the response.

**Response 200** — configured:
```json
{
  "is_configured": true,
  "repo_url": "https://github.com/username/my-unihub-sync",
  "device_name": "home-desktop",
  "last_published_at": "2026-05-27T10:00:00Z",
  "last_published_commit": "abc123def456abc123def456abc123def456abc1",
  "last_applied_at": "2026-05-26T09:00:00Z",
  "last_applied_commit": "xyz789abc123xyz789abc123xyz789abc123xyz7"
}
```

**Response 200** — not yet configured:
```json
{
  "is_configured": false
}
```

---

## PUT /api/v1/sync/config/

Create or update the sync configuration. Creates if no config exists; updates if one does.

**Request body**:
```json
{
  "repo_url": "https://github.com/username/my-unihub-sync",
  "pat": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "device_name": "home-desktop"
}
```

**Validation**:
- `repo_url`: Required. Must match `^https://github\.com/[^/]+/[^/]+$`.
- `pat`: Required. Must be non-empty. Encrypted before storage; not echoed in response.
- `device_name`: Required. 1–100 characters.

**Response 200** — returns `SyncConfigResponse` (same as GET, without PAT).

**Response 400** — validation error:
```json
{
  "repo_url": ["Enter a valid URL."],
  "device_name": ["This field may not be blank."]
}
```

**Side effect**: Triggers a `git clone` of the new repository in the background if the repo URL has changed or the clone directory is absent. Clone errors do not fail this endpoint but are surfaced on the next `/status/` or publish/apply call.

---

## DELETE /api/v1/sync/config/

Remove the sync configuration and delete the local repo clone.

**Response 204** — No Content.

**Response 404** — if no config exists.

---

## GET /api/v1/sync/status/

Fetch the current remote status by running `git fetch` + ahead/behind count. This call makes a network request to GitHub.

**Response 200**:
```json
{
  "status": "behind",
  "ahead_count": 0,
  "behind_count": 3,
  "remote_commit": "def456abc789def456abc789def456abc789def4",
  "error_message": null
}
```

`status` values: `in_sync` | `ahead` | `behind` | `diverged` | `no_remote` | `error`

**Response 400** — if sync is not configured:
```json
{ "error": "not_configured" }
```

---

## POST /api/v1/sync/publish/

Export all registered tables to CSV, commit, and push to the remote repository.

**Request body**: `{}` (empty — uses stored config)

**Response 200** — pushed successfully:
```json
{
  "commit_sha": "abc123def456abc123def456abc123def456abc1",
  "published_at": "2026-05-27T10:15:30Z",
  "tables_exported": ["finance_account", "finance_currency", "finance_exchangerate"]
}
```

**Response 200** — nothing to push (no local changes):
```json
{
  "status": "up_to_date",
  "message": "No changes since last publish."
}
```

**Response 409** — remote has commits not present locally (diverged history):
```json
{
  "error": "diverged",
  "ahead_count": 1,
  "behind_count": 2,
  "message": "Remote has 2 commit(s) not present locally. Use force_publish to overwrite or apply_latest first."
}
```

**Response 400** — if sync is not configured:
```json
{ "error": "not_configured" }
```

---

## POST /api/v1/sync/force-publish/

Same as `/publish/` but passes `--force` to `git push`. Overwrites the remote unconditionally.

**Request body**: `{}` (empty)

**Response 200** — same shape as `/publish/` success.

**Response 400** — if sync is not configured.

---

## POST /api/v1/sync/apply/preview/

Fetch the latest remote state and compute a change preview against the local database. Does **not** modify the database.

**Request body**: `{}` (empty)

**Response 200** — changes available (array, one entry per table):
```json
[
  {
    "table": "finance_account",
    "mode": "replace",
    "creates": [
      { "pk": "uuid-...", "operation": "create", "before": null, "after": { "name": "Savings" } }
    ],
    "updates": [],
    "deletes": [],
    "errors": []
  }
]
```

**Response 200** — already up to date:
```json
{
  "status": "up_to_date",
  "message": "Already up to date with remote."
}
```

**Response 400** — if sync is not configured, or if CSV validation errors are found:
```json
{
  "error": "validation_failed",
  "details": [
    { "table": "finance_account", "errors": [{ "row": 3, "column": "id:uuid", "message": "..." }] }
  ]
}
```

---

## POST /api/v1/sync/apply/confirm/

Pull the latest remote state and apply all tables to the local database in a single transaction (replace mode). This is the destructive apply step; the user must have confirmed the preview first.

**Request body**: `{}` (empty)

**Response 200** — applied successfully (array, one entry per table):
```json
[
  {
    "table": "finance_account",
    "mode": "replace",
    "created": 3,
    "updated": 1,
    "deleted": 0
  }
]
```

**Response 400** — if sync is not configured.

**Response 409** — if the remote state changed between preview and confirm (rare race condition):
```json
{ "error": "remote_changed", "message": "Remote changed since preview. Re-run preview." }
```

---

## Error Response Conventions

All error responses follow DRF's standard format. Application-level errors use the `error` key with a machine-readable code; field validation errors use the field name as key. The frontend maps `error` codes to i18n message IDs.

| `error` code | HTTP status | Meaning |
|---|---|---|
| `not_configured` | 400 | No SyncConfig exists |
| `diverged` | 409 | Push rejected due to diverged history |
| `validation_failed` | 400 | CSV validation errors during apply preview |
| `remote_changed` | 409 | Remote changed between preview and confirm |
| `git_error` | 500 | Unexpected git command failure |
