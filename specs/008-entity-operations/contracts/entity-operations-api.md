# API Contract: Entity Operations

**Phase**: 1 | **Date**: 2026-05-31 | **Feature**: 008-entity-operations

All entity list endpoints that opt into `EntityFilterBackend` and pagination classes gain the following unified query parameter contract. The Finance domain is the reference integration.

---

## Common Query Parameters

| Parameter  | Type   | Default | Description |
|------------|--------|---------|-------------|
| `filters`  | string | —       | URL-encoded JSON `FilterPayload`. Omit to return all records. |
| `ordering` | string | (viewset default) | Comma-separated field names; prefix `-` for descending. First field is highest-priority sort. |
| `limit`    | int    | 50      | Page size (1–500). |
| `offset`   | int    | 0       | Offset for offset-based pagination. Omit when using cursor mode. |
| `cursor`   | string | —       | Opaque cursor for cursor-based pagination (returned in previous response). |

---

## Filter Payload Schema (`filters` param)

```json
{
  "groups": [
    {
      "logic": "and",
      "conditions": [
        {
          "attr": "<attribute_key>",
          "op":   "<operator>",
          "val":  "<value_string>"
        }
      ]
    }
  ]
}
```

- `groups` — array of condition groups, combined with **OR** between groups
- `logic` — `"and"` | `"or"` — how conditions within the group are combined
- `attr` — attribute key registered in the viewset's `filterable_fields`
- `op` — operator code (see table below)
- `val` — value string; coerced to the attribute's data type server-side

### Operator Reference

| Operator      | Applicable Types              | Semantics |
|---------------|-------------------------------|-----------|
| contains      | text, long_text               | case-insensitive substring match |
| not_contains  | text, long_text               | negated contains |
| equals        | text, long_text               | case-insensitive exact match |
| not_equals    | text, long_text               | negated equals |
| starts_with   | text, long_text               | case-insensitive prefix match |
| ends_with     | text, long_text               | case-insensitive suffix match |
| is_empty      | text, long_text, date         | null or empty string |
| is_not_empty  | text, long_text, date         | not null and not empty string |
| eq            | number                        | equal to |
| neq           | number                        | not equal to |
| gt            | number                        | greater than |
| gte           | number                        | greater than or equal to |
| lt            | number                        | less than |
| lte           | number                        | less than or equal to |
| is            | boolean, single_select        | exact match |
| is_not        | boolean, single_select        | negated exact match |
| date_before   | date                          | strictly before date (`<`) |
| date_after    | date                          | strictly after date (`>`) |

### Example: Two condition groups

```
GET /api/v1/finance/accounts/?filters=<url-encoded>

Decoded filters:
{
  "groups": [
    {
      "logic": "and",
      "conditions": [
        { "attr": "name", "op": "contains", "val": "savings" },
        { "attr": "currency", "op": "is", "val": "USD" }
      ]
    },
    {
      "logic": "or",
      "conditions": [
        { "attr": "currency", "op": "is", "val": "EUR" }
      ]
    }
  ]
}
```

SQL equivalent:
```sql
WHERE (name ILIKE '%savings%' AND currency = 'USD') OR (currency = 'EUR')
```

---

## Sort Examples

```
GET /api/v1/finance/accounts/?ordering=name
→ sort by name ASC

GET /api/v1/finance/accounts/?ordering=-currency,name
→ sort by currency DESC (primary), then name ASC (tiebreaker)
```

---

## Pagination Response Shapes

### Offset Mode (default for most viewsets)

```json
{
  "count": 1250,
  "next": "https://host/api/v1/finance/accounts/?limit=50&offset=100",
  "previous": "https://host/api/v1/finance/accounts/?limit=50&offset=0",
  "results": [
    { ... },
    { ... }
  ]
}
```

- `count`: total number of records matching current filter
- `next` / `previous`: full URLs with preserved `filters` and `ordering` params; `null` when at the boundary
- `results`: array of serialized entity objects

### Cursor Mode (for BalanceSheet and any high-volume, append-only entities)

```json
{
  "next": "https://host/api/v1/finance/balance-sheets/?cursor=cD0yMDI1LTA1LTMxKzE0JTNBMzAlM0EwMC4wMDAwMDAmcj0x",
  "previous": null,
  "results": [
    { ... },
    { ... }
  ]
}
```

- No `count` field
- `next` / `previous`: opaque cursor URLs; `null` when at the boundary
- Cursor remains stable even when records are inserted/deleted between navigations

---

## Error Responses

### Invalid `filters` JSON — 400

```json
{
  "filters": "Invalid filter format."
}
```

### Invalid `ordering` field — 400 (DRF standard)

```json
{
  "detail": "Invalid ordering."
}
```

### `limit` out of range — 400

```json
{
  "detail": "Invalid limit."
}
```

---

## Frontend Service Layer Contract

Each Finance service function is extended to accept an `EntityListParams` argument:

```ts
// src/services/unihub-backend/finance.ts

interface EntityListParams {
  filters?: FilterPayload;
  ordering?: string;       // e.g. "name,-currency"
  limit?: number;
  offset?: number;         // offset mode
  cursor?: string;         // cursor mode
}

interface OffsetPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

interface CursorPaginatedResponse<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

// Example:
function listAccounts(params?: EntityListParams): Promise<OffsetPaginatedResponse<Account>>;
function listBalanceSheets(params?: EntityListParams): Promise<CursorPaginatedResponse<BalanceSheet>>;
```

The `FilterPayload` is JSON-stringified and URL-encoded before being appended to the request URL:
```ts
if (params.filters) {
  searchParams.set('filters', JSON.stringify(params.filters));
}
```

---

## Frontend Hook Contracts

### `useEntityFilter(key: string)`

Manages filter state and URL encoding/decoding.

```ts
interface UseEntityFilterReturn {
  pendingGroups: FilterGroup[];          // groups being edited in the panel (not yet applied)
  activeGroups: FilterGroup[];           // groups currently applied to the query
  apply: () => void;                     // commit pendingGroups → activeGroups, update URL
  cancel: () => void;                    // discard pendingGroups, restore from activeGroups
  setPendingGroups: (groups: FilterGroup[]) => void;
  isActive: boolean;                     // true when activeGroups has ≥1 non-empty condition
  reset: () => void;                     // clear all active groups, update URL
  toApiParam: () => FilterPayload | undefined;  // serialise activeGroups for API call
}
```

### `useEntitySort(key: string)`

Manages sort state, URL sync, and provides the header-click handler.

```ts
interface UseEntitySortReturn {
  pendingRules: SortRule[];              // rules being edited in panel (not yet applied)
  activeRules: SortRule[];              // rules currently applied to the query
  apply: () => void;                    // commit pendingRules → activeRules, update URL
  cancel: () => void;                   // discard pendingRules
  setPendingRules: (rules: SortRule[]) => void;
  handleHeaderClick: (field: string) => void;  // immediate — no Apply needed
  sortOrderForField: (field: string) => 'ascend' | 'descend' | null;  // for ProTable sortOrder
  toOrderingParam: () => string | undefined;   // serialise activeRules for API call
  isActive: boolean;
}
```

### `useColumnConfig(columns: ColumnDef[])`

Manages column visibility, order, and sticky pinning.

```ts
interface UseColumnConfigReturn {
  pendingState: ColumnState;
  activeState: ColumnState;
  apply: () => void;
  cancel: () => void;
  setPendingState: (state: ColumnState) => void;
  visibleColumns: ColumnDef[];          // ordered visible columns from activeState
  firstColumnFixed: 'left' | undefined; // for ProTable column fixed prop
  lastColumnFixed: 'right' | undefined;
}
```
