# Contract: `search` query parameter on entity list endpoints (019)

## Endpoints gaining the parameter

```
GET /api/v1/finance/currencies/?search=<q>
GET /api/v1/finance/accounts/?search=<q>
GET /api/v1/finance/exchange-rates/?search=<q>
GET /api/v1/inventory/items/?search=<q>
GET /api/v1/inventory/acquisitions/?search=<q>
GET /api/v1/inventory/scenarios/?search=<q>
```

`search` composes with ALL existing list parameters unchanged: `filters` (JSON), `ordering`, `limit`, `offset`.

## Semantics

1. **Trim**: leading/trailing whitespace is stripped. An absent, empty, or whitespace-only `search` is a no-op — the endpoint behaves exactly as before this feature.
2. **Union across attributes**: a row matches when the query is a case-insensitive substring of the textual representation of ANY of that endpoint's searchable fields (matrix in [data-model.md §1](../data-model.md)), including — for items — the value of any dynamic parameter.
3. **Intersection with filters**: `search` is applied IN ADDITION to the `filters` payload (logical AND). Results are always a subset of what the same request without `search` returns. This is the FR-004 guarantee: search never escapes the active view's scope.
4. **Literal matching** (FR-013): the query is matched as plain text. `%`, `_`, `(`, `)`, `~`, `*` and any other character are literals, never operators or wildcards.
5. **Whole-query phrase**: the trimmed query is one contiguous fragment; it is not tokenized into words.
6. **Non-text fields**: numeric/date fields declared `"cast"` match against their database text form (e.g. `31.05000000`, `2026-08-12 14:00:00+00`). Booleans and computed serializer fields do not participate.
7. **Forgiving contract**: `search` on an endpoint that does not declare searchable fields is silently ignored (no 400) — consistent with unknown `attr` keys in `filters`.
8. **Ordering, pagination, totals**: `ordering` applies to the searched set; `count` and footer `totals` are computed over the searched (post-filter) queryset; `limit`/`offset` page through it.

## Response

Unchanged envelope:

```json
{
  "count": <int>,          // rows matching filters AND search
  "next": <url|null>,
  "previous": <url|null>,
  "results": [ <entity serializer output, unchanged> ],
  "totals": { ... }        // where the endpoint already provides footer totals
}
```

No match metadata is returned — highlighting is computed client-side from the query against rendered cell text (the client knows the query; returning offsets would couple the API to display formatting).

## OpenAPI

`EntitySearchFilter.get_schema_operation_parameters()` contributes:

```yaml
- in: query
  name: search
  required: false
  schema: { type: string }
  description: Case-insensitive substring matched against any searchable attribute; combined with `filters` as AND.
```

on each opted-in list operation. Schema regenerated per R12 (spectacular → file → openapi-typescript).

## Errors

No new error responses. Malformed `filters` still 400s exactly as today; `search` itself cannot 400 (any string is a valid literal query).
