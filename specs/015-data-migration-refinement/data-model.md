# Data Model — Data Migration Refinement (015)

**Date**: 2026-07-20 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

No new domain entities and no new Django models. The feature extends one existing
infrastructure model and defines several **API-level (non-persisted) shapes**.

## Persisted model changes

### SyncConfig (`sync/models.py`) — extended

| Field | Type | New? | Meaning |
|---|---|---|---|
| repo_url | URLField(500) | — | unchanged |
| pat_encrypted | TextField | — | unchanged (never serialized) |
| last_published_at / last_published_commit | DateTime / Char(40) | — | unchanged |
| last_applied_at / last_applied_commit | DateTime / Char(40) | — | unchanged |
| **local_state_commit** | Char(40), null | NEW | sha of the snapshot the local DB last corresponded to; written by publish, force-publish, and checkout confirm |
| **last_known_remote_commit** | Char(40), null | NEW | remote head sha recorded at every successful fetch; basis of force-push detection (R4) |

- Migration: one `sync` migration adding both nullable fields (no backfill — absent
  values mean "unknown", the graph renders without a local marker until the next sync op).
- `data_io` registry: `sync.syncconfig` is intentionally **not registered** (credentials
  must never round-trip through CSV backup) — existing precedent, unchanged by this
  feature; noted here per constitution Principle I's "explicitly recorded" rule.

## API-level shapes (serializers only, not persisted)

### CommitNode (history payload)

| Field | Type | Notes |
|---|---|---|
| sha | string(40) | commit id |
| parents | string[] | parent shas (lineage rendering) |
| author_date | ISO datetime | commit authored time |
| message | string | commit subject |
| is_remote_head | bool | newest remote commit |
| is_local_state | bool | equals `SyncConfig.local_state_commit` |
| compatible | bool | per R6 header-validation |
| incompatible_reason | string \| null | human-readable, only when incompatible |

### HistoryResponse

| Field | Type | Notes |
|---|---|---|
| commits | CommitNode[] | newest-first, page of `limit` (default 50) |
| has_more | bool | older commits exist (`before` cursor paging) |
| remote_head | string \| null | null for empty remote |
| local_commit | string \| null | `local_state_commit` |
| has_local_changes | bool | drives the pending-local-changes pseudo-node |
| history_rewritten | bool | force-push detected (R4) |

### ChangeRecord (existing shape, reused)

`{pk, operation: create|update|delete, before, after, changed_fields[]}` — unchanged;
rows remain grouped per table as `{table, display_name, added, modified, deleted, rows[]}`.

### Preview envelope (publish + checkout)

Existing `{status, changes[]}` envelope gains:

| Field | Type | Notes |
|---|---|---|
| base_commit | string | sha the diff was computed against (remote head / checkout target) |
| diff_digest | string | sha256 over the canonical diff JSON; pins confirm to preview |

### Confirm request (publish, force-publish, checkout)

| Field | Type | Notes |
|---|---|---|
| base_commit / commit | string | echo of the previewed base (checkout: target sha) |
| diff_digest | string | must match the recomputed diff → else `409 preview_stale` |
| excluded | {table, pk}[] | unstaged rows; empty/omitted = everything staged (default) |

### Confirm response additions

| Field | Type | Notes |
|---|---|---|
| auto_included | {table, pk, operation}[] | dependency-closure rows added server-side (FR-014) |

## State transitions

```
                    publish/force-publish (staged subset)
   DB state ────────────────────────────────────────────▶ new remote head commit
      ▲                                                        │
      │ checkout confirm (staged subset of commit-vs-DB diff)  │
      └────────────────────────────────────────────────────────┘
   both transitions set SyncConfig.local_state_commit = resulting/target sha
   every fetch sets SyncConfig.last_known_remote_commit = remote head sha
   history_rewritten := stored last_known_remote_commit not ancestor-of/equal-to new head
```

## Validation rules (from spec FRs)

- Diffs always computed from `objects.all()` exports of every registered table — no
  filter parameters accepted anywhere in the sync path (FR-001).
- Confirm rejected (`409 preview_stale`) when `diff_digest` mismatches (FR-002).
- Confirm rejected (`400`) when the staged set is empty after exclusions (FR-013).
- Checkout confirm rejected (`409 incompatible_commit`) for incompatible shas (FR-018).
- Dependency closure computed from registry FK metadata only — no domain-specific
  knowledge (constitution Principle II).
