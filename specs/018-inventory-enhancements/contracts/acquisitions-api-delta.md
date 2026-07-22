# API Contract Delta — Acquisitions (018)

**Base**: existing inventory API (`specs/014-inventory-app/contracts/inventory-api.md`).
Only the deltas below change; everything else is unchanged. Schema is
regenerated via drf-spectacular and consumed through openapi-typescript
(Constitution IV).

## CostFactor object (read & write)

```jsonc
{
  "id": "abc123",
  "value": "0.0000",
  "currency": "TWD",
  "type": "accumulated",
  "display_order": 0,
  "user_managed": true          // NEW — optional on write, default false
}
```

- `user_managed` is meaningful only on `type == "accumulated"` factors:
  `true` = the amount was manually set by the user and MUST NOT be
  auto-recalculated by any flow; `false` = system-derived.
- Manual factors may send the field; it is stored but ignored.

## POST /api/inventory/acquisitions/ (create) — behavior change

| Payload contains | Old behavior | New behavior |
|---|---|---|
| ≥1 `type="accumulated"` factor | **400** — "The accumulated factor is system-managed." | Accumulated factors stored **verbatim** (value, currency, `user_managed`) in payload order; the server derives **nothing**. Validation: at most one accumulated factor per currency (400 otherwise — same rule update already enforces). |
| no accumulated factor | Server derives one accumulated row per item currency — Σ(sku_price × quantity), or a single zero row when no item is priced | Unchanged, derived rows get `user_managed=false`. Keeps back-compat for importers/scripts and the ≥1-factor invariant. |

The frontend form now always sends the FULL factor list on create
(accumulated rows exactly as displayed — including 0 — plus manual rows),
so a user-cleared accumulated line is stored as `value=0,
user_managed=true` (FR-001/FR-002).

## PUT/PATCH /api/inventory/acquisitions/{id} (update) — field addition only

- Unchanged semantics: when `cost_factors` is present it replaces the whole
  set in payload order (still ≥1 factor, still ≤1 accumulated per currency).
- Each factor row now round-trips `user_managed`; omitted ⇒ `false`.
- The server never recomputes accumulated values on update (that was already
  true — the recalculation bug lives in the form's reconcile logic; see
  research.md D3).

## GET responses

`cost_factors[].user_managed` appears on every acquisition/catalog payload
that embeds cost factors. `net_cost` math is unchanged (it always summed
stored values).

## Non-changes (explicit)

- No new endpoints, no pagination/filter changes.
- Item endpoints unchanged; item edits never touch accumulated factors
  server-side.
- data_io CSV shape gains the `user_managed` column automatically via
  `auto_system_fields(CostFactor)`.
- Legacy HTML importer continues writing derived accumulated rows
  (`user_managed=false` default) — re-imports preserve behavior.
