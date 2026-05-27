# Data Model: Data Sync Across Devices

**Feature**: 004-data-sync-devices | **Date**: 2026-05-27

---

## Backend Django Model

### `SyncConfig` (app: `sync`)

Stores the one-per-installation sync configuration. There is never more than one row; the application enforces this in the view layer (upsert on PUT, singleton check on GET).

```
SyncConfig
├── id                    integer         PK, auto
├── repo_url              varchar(500)    HTTPS GitHub URL (no PAT embedded)
├── pat_encrypted         text            Fernet-encrypted PAT
├── device_name           varchar(100)    Label recorded in git commit messages
├── last_published_at     datetime        UTC, nullable — timestamp of last successful push
├── last_published_commit varchar(40)     nullable — git SHA of last pushed commit
├── last_applied_at       datetime        UTC, nullable — timestamp of last successful apply
├── last_applied_commit   varchar(40)     nullable — git SHA of last applied commit
├── created_at            datetime        auto_now_add
└── updated_at            datetime        auto_now
```

**Constraints**:
- `repo_url` must be a valid HTTPS GitHub URL (validated in serializer).
- `pat_encrypted` is never returned in API responses; the serializer write-only field accepts `pat` and encrypts before saving.
- At most one `SyncConfig` row exists. PUT creates if absent, updates if present.

---

## API Data Shapes

### `SyncConfigRequest` — PUT /api/v1/sync/config/

```json
{
  "repo_url": "https://github.com/username/my-unihub-sync",
  "pat": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "device_name": "home-desktop"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `repo_url` | string | yes | Must start with `https://github.com/` |
| `pat` | string | yes | Write-only; encrypted before DB storage |
| `device_name` | string | yes | Max 100 chars; used in git commit messages |

---

### `SyncConfigResponse` — GET /api/v1/sync/config/

```json
{
  "is_configured": true,
  "repo_url": "https://github.com/username/my-unihub-sync",
  "device_name": "home-desktop",
  "last_published_at": "2026-05-27T10:00:00Z",
  "last_published_commit": "abc123def456",
  "last_applied_at": "2026-05-26T09:00:00Z",
  "last_applied_commit": "xyz789abc123"
}
```

When unconfigured: `{ "is_configured": false }` (all other fields absent).

PAT is **never** included in any response.

---

### `SyncStatusResponse` — GET /api/v1/sync/status/

```json
{
  "status": "behind",
  "ahead_count": 0,
  "behind_count": 3,
  "remote_commit": "def456abc789",
  "error_message": null
}
```

| `status` value | Meaning |
|---|---|
| `in_sync` | `HEAD` and `origin/HEAD` point to the same commit |
| `ahead` | Local has unpushed commits; remote has nothing new |
| `behind` | Remote has commits not yet applied locally |
| `diverged` | Both local and remote have commits the other lacks |
| `no_remote` | Local clone missing or remote branch does not yet exist |
| `error` | git command failed; `error_message` contains sanitised details |

---

### `SyncPublishResponse` — POST /api/v1/sync/publish/ and POST /api/v1/sync/force-publish/

Success (HTTP 200):
```json
{
  "commit_sha": "abc123def456",
  "published_at": "2026-05-27T10:15:00Z",
  "tables_exported": ["finance_account", "finance_currency", "finance_exchangerate"]
}
```

Up-to-date (HTTP 200, no commit created):
```json
{
  "status": "up_to_date",
  "message": "No changes since last publish."
}
```

Diverged conflict (HTTP 409, publish only — not force-publish):
```json
{
  "error": "diverged",
  "ahead_count": 1,
  "behind_count": 2,
  "message": "Remote has 2 commit(s) not present locally. Choose to apply latest first or force publish."
}
```

---

### `SyncApplyPreviewResponse` — POST /api/v1/sync/apply/preview/

Reuses the same shape as the existing `ImportZipPreviewView` response — an array, one entry per table:

```json
[
  {
    "table": "finance_account",
    "mode": "replace",
    "creates": [...],
    "updates": [...],
    "deletes": [...],
    "errors": []
  }
]
```

Up-to-date (HTTP 200):
```json
{
  "status": "up_to_date",
  "message": "Already up to date with remote."
}
```

---

### `SyncApplyConfirmResponse` — POST /api/v1/sync/apply/confirm/

Reuses the same shape as the existing `ImportZipConfirmView` response:

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

---

## Frontend Service Types

Auto-generated from `openapi.yaml` after backend is implemented. Key types the frontend will consume:

```typescript
// From generated types (do not hand-write)
type SyncConfigResponse = {
  is_configured: boolean;
  repo_url?: string;
  device_name?: string;
  last_published_at?: string;
  last_published_commit?: string;
  last_applied_at?: string;
  last_applied_commit?: string;
};

type SyncStatus = 'in_sync' | 'ahead' | 'behind' | 'diverged' | 'no_remote' | 'error';

type SyncStatusResponse = {
  status: SyncStatus;
  ahead_count: number;
  behind_count: number;
  remote_commit: string | null;
  error_message: string | null;
};
```

---

## Crypto Utility

The `sync.services.crypto` module provides two functions (not a model, but documented here for clarity):

```python
def encrypt_pat(pat: str) -> str:
    """Encrypt plaintext PAT using Fernet(sha256(SECRET_KEY))."""

def decrypt_pat(encrypted: str) -> str:
    """Decrypt Fernet-encrypted PAT back to plaintext."""
```

The Fernet key is derived at import time from `settings.SECRET_KEY` and cached as a module-level constant.
