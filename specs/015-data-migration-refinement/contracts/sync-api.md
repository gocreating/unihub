# API Contracts — Data Migration Refinement (015)

Base path: `/api/v1/sync/` (session-authenticated, same as existing sync endpoints).
All request/response bodies are JSON. Serializers are drf-spectacular-annotated; after
backend changes, regenerate `openapi.yaml` and the frontend's generated types
(constitution Principle IV).

## GET /api/v1/sync/history/  — NEW

Query: `limit` (int, default 50, max 200), `before` (sha cursor — return commits older
than this sha). The frontend passes `limit=10` for the initial window and `limit=20`
per load-more page (2026-07-21 refinement, R12 — server contract unchanged).

Behavior: fetch + hard-reset clone to remote head (R1); record
`last_known_remote_commit`; compute `history_rewritten` (R4); classify compatibility per
commit (R6).

200 response:

```json
{
  "commits": [
    {
      "sha": "abc123…40",
      "parents": ["def456…40"],
      "author_date": "2026-07-19T12:34:56Z",
      "message": "sync: inventory.item, inventory.acquisition",
      "is_remote_head": true,
      "is_local_state": false,
      "compatible": true,
      "incompatible_reason": null
    }
  ],
  "has_more": true,
  "remote_head": "abc123…40",
  "local_commit": "0f9e8d…40",
  "has_local_changes": true,
  "history_rewritten": false
}
```

Empty remote: `{"commits": [], "has_more": false, "remote_head": null, …}` (200).
Errors: `400 {"error": "not_configured"}`; `500 {"error": "git_error", "message": …}`.

## GET /api/v1/sync/publish/preview/  — CHANGED

Behavior change: fetch + hard-reset to remote head BEFORE diffing (R1). Diff = complete
DB export vs remote-head CSVs for every registered table.

200 response (has changes):

```json
{
  "status": "has_changes",
  "base_commit": "abc123…40",
  "diff_digest": "sha256hex",
  "changes": [
    {
      "table": "inventory.item",
      "display_name": "Items",
      "added": 1, "modified": 2, "deleted": 0,
      "is_new_table": false,
      "rows": [ { "pk": "…", "operation": "update", "before": {…}, "after": {…}, "changed_fields": ["name:string"] } ]
    }
  ]
}
```

`{"status": "up_to_date"}` when identical. Empty remote → all-create preview with
`base_commit: null`.

## POST /api/v1/sync/publish/  — CHANGED

Request:

```json
{ "base_commit": "abc123…40", "diff_digest": "sha256hex", "excluded": [{"table": "inventory.item", "pk": "…"}] }
```

Behavior: recompute diff against `base_commit` (after fetch+reset); verify digest;
build hybrid CSVs = base rows + staged (non-excluded) operations; commit; push
(fast-forward — base is the remote head; a race → 409). Updates `last_published_*` and
`local_state_commit`.

Responses: `200 {"status": "published", "commit_sha", "tables_exported"}`,
`200 {"status": "up_to_date"}`, `400 {"error": "nothing_staged"}`,
`409 {"error": "preview_stale"}` (digest/base mismatch — re-preview),
`409 {"error": "diverged"}` (push race), `400 {"error": "not_configured"}`.

## POST /api/v1/sync/force-publish/  — CHANGED

Same request/pinning/staging semantics as publish; pushes with `--force`. Remains the
only operation that may rewrite remote history (FR-020). Responses as publish (no
`diverged`).

## GET /api/v1/sync/checkout/preview/  — NEW

Query: `commit` (sha, required).

Behavior: fetch + reset; validate the sha exists on the remote history and is
compatible (`409 incompatible_commit` with reason otherwise); diff that commit's CSVs
against the complete current DB (replace semantics — what would change locally).

200 response: same envelope as publish preview with `base_commit = <commit>`;
`{"status": "up_to_date"}` when the DB already matches the snapshot.

## POST /api/v1/sync/checkout/confirm/  — NEW

Request:

```json
{ "commit": "abc123…40", "diff_digest": "sha256hex", "excluded": [] }
```

Behavior: verify digest against a recomputed diff; compute dependency closure over the
staged set from registry FK metadata (auto-include, FR-014); apply staged ChangeRecords
selectively in registry topo order inside one transaction; update `last_applied_at`,
`last_applied_commit`, `local_state_commit` (full-selection checkout of the target →
`local_state_commit = commit`).

Responses:

```json
{ "status": "applied", "results": [{"table": "…", "display_name": "…", "applied": 3}], "auto_included": [{"table": "…", "pk": "…", "operation": "create"}] }
```

`400 nothing_staged`, `409 preview_stale`, `409 incompatible_commit`,
`400 not_configured`.

## REMOVED endpoints

- `GET /api/v1/sync/apply/preview/` → superseded by checkout preview of the remote head.
- `POST /api/v1/sync/apply/confirm/` → superseded by checkout confirm of the remote head.

Frontend `services/unihub-backend/sync.ts` drops `getApplyPreview`/`confirmApply` in the
same change (single consumer; OpenAPI regenerated).

## GET /api/v1/sync/config/  — CHANGED (additive)

Read serializer adds `local_state_commit: string | null`. Write shape unchanged.

## Unchanged

`GET /api/v1/sync/status/` (still used for the lightweight ahead/behind pill; now also
updates `last_known_remote_commit` on successful fetch), `PUT/DELETE /api/v1/sync/config/`.
