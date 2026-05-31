# Research: Entity Operations

**Phase**: 0 | **Date**: 2026-05-31 | **Feature**: 008-entity-operations

## Decision 1: Filter Query Parameter Encoding

**Decision**: Encode the filter structure as a URL-encoded JSON string in a single `filters` query parameter.

**Format**:
```
GET /api/v1/finance/accounts/?filters=%7B%22groups%22%3A%5B...%5D%7D
```

Decoded value:
```json
{
  "groups": [
    {
      "logic": "and",
      "conditions": [
        { "attr": "name", "op": "contains", "val": "savings" },
        { "attr": "currency", "op": "is", "val": "USD" }
      ]
    }
  ]
}
```

**Rationale**: A single structured JSON param keeps the URL clean and avoids the ambiguity of repeated flat params (e.g., `filter[0][attr]=...&filter[0][op]=...`). The nested group → conditions → operator structure maps directly to the spec's condition group model. `json.loads()` on the backend and `JSON.parse(decodeURIComponent())` on the frontend is the lowest-friction round-trip.

**Alternatives considered**:
- Flat repeated params (`?f[0][attr]=name&f[0][op]=contains`): Hard to parse nested group structure; URL becomes unwieldy for multiple conditions.
- POST body with filters in request body: Non-RESTful for a list/read operation; breaks caching and bookmarkability.
- GraphQL-style query: Overkill for this project's stack.

---

## Decision 2: Offset Pagination — LimitOffsetPagination

**Decision**: Use DRF's built-in `LimitOffsetPagination` for offset-based pagination with `limit` and `offset` query params.

**Response envelope**:
```json
{
  "count": 1250,
  "next": "https://host/api/v1/finance/accounts/?limit=50&offset=100",
  "previous": "https://host/api/v1/finance/accounts/?limit=50&offset=0",
  "results": [...]
}
```

**Rationale**: `LimitOffsetPagination` is built into DRF, is already familiar to the team (ov-fleet uses it), and the `count`/`next`/`previous` envelope maps directly to the spec's offset-mode requirements (total record count + jump-to-page support). No additional dependencies.

**Alternatives considered**:
- `PageNumberPagination`: Page-number-based; requires computing page from offset on both sides. Less flexible than explicit offset.
- Third-party `drf-spectacular-sidecar`: No benefit over built-in for this use case.

---

## Decision 3: Cursor Pagination — CursorPagination

**Decision**: Use DRF's built-in `CursorPagination` for cursor-based pagination.

**Response envelope** (DRF cursor format):
```json
{
  "next": "https://host/api/v1/finance/balance-sheets/?cursor=cD0yMDI1...",
  "previous": null,
  "results": [...]
}
```

**Rationale**: `CursorPagination` is built into DRF, requires no third-party packages, and naturally provides only next/previous navigation with no total count — matching exactly the spec's cursor mode requirements (FR-018). The cursor is opaque to the client, which is correct.

**Constraints**: Cursor pagination requires a consistent ordering field; the viewset's `ordering` attribute must be set and stable.

**Alternatives considered**:
- `djangorestframework-filters` cursor extensions: Adds a dependency with no advantage over built-in.
- Keyset pagination (manual): More control but much more implementation complexity.

---

## Decision 4: Sorting Format — DRF OrderingFilter Convention

**Decision**: Retain DRF's existing `ordering` query param convention (`?ordering=field1,-field2`) for multi-column sort. The first field listed is the highest-priority sort key.

**Examples**:
```
?ordering=name                    → sort by name ASC
?ordering=-created_at,name        → sort by created_at DESC (primary), then name ASC (tiebreaker)
```

**Rationale**: DRF `OrderingFilter` is already wired into Finance viewsets. Keeping the same convention means no new query param; the frontend simply serializes the ordered sort rule list as `rules.map(r => (r.direction === 'desc' ? '-' : '') + r.field).join(',')`. Zero migration cost.

**Frontend serialization**:
```ts
const orderingParam = sortRules
  .map(r => (r.direction === 'desc' ? `-${r.field}` : r.field))
  .join(',');
// → "name,-created_at"
```

**Alternatives considered**:
- New structured sort param (JSON): Unnecessary complexity given DRF's existing convention handles multi-column naturally.
- Separate `sort_by` and `sort_dir` params: Cannot represent multi-column sort without repeated params.

---

## Decision 5: ProTable Column Header Sort Integration

**Decision**: Use Ant Design ProTable's controlled `sortOrder` prop per column combined with the `onChange` callback to implement immediate header-click sort (bypassing the Apply panel).

**Pattern**:
```tsx
// In the columns definition:
{
  dataIndex: 'name',
  sorter: true,
  sortOrder: sortRuleForField('name', activeSortRules),  // 'ascend' | 'descend' | null
}

// ProTable onChange handler:
const handleTableChange = (_pagination, _filters, sorterResult) => {
  const { field, order } = Array.isArray(sorterResult) ? sorterResult[0] : sorterResult;
  // Map: 'ascend' → 'asc', 'descend' → 'desc', undefined → remove
  applyHeaderSort(field, order);  // immediate — no Apply needed
};
```

**Cycle logic** (managed in `useEntitySort`):
- Current state `null` + click → `'ascend'` (append new rule, lowest priority)
- Current state `'ascend'` + click → `'descend'` (update in-place, priority unchanged)
- Current state `'descend'` + click → `null` (remove rule)

**Bidirectional sync**: The sort panel reads `activeSortRules` from `useEntitySort`, so it always reflects the current state regardless of whether rules were set via panel Apply or header click. When the sort panel is open and a header click occurs, the panel state is reset to the new `activeSortRules`.

**Rationale**: ProTable's `sortOrder` prop makes sort indicators fully controlled. The `onChange` callback fires synchronously on header click, enabling the immediate-effect pattern without fighting the framework. This is the same approach used in ov-fleet for server-side table sorting.

**Alternatives considered**:
- Custom column header `renderTitle` with click handlers: More control but loses the built-in sort arrow indicator styling — requires custom indicator implementation.
- External sort-icon-only component outside ProTable: Cannot leverage ProTable's built-in `sortOrder` visual state.

---

## Decision 6: URL State Scope for Filter and Sort

**Decision**: Encode active filter state and active sort state in the URL query string. Column configuration (visibility, order, sticky) is session-scoped only — not URL-reflected.

**Filter URL format**: `?filters=<url-encoded-json>`
**Sort URL format**: `?ordering=field1,-field2` (DRF standard)

**Rationale**: Filters and sort define the *data view* the user is working with — they should be shareable so a collaborator or a bookmark lands on the same data. Column configuration is a *presentation preference* (which attributes to show, in what order) that is personal and ephemeral; including it in the URL would create long, unreadable URLs and doesn't meaningfully improve shareability.

**Alternatives considered**:
- Full view state (filter + sort + columns) in URL: Long URLs; column config is user-specific, not data-specific; spec assumption already scopes column config to session.
- Nothing in URL: Breaks spec requirement for shareable filter/sort state (Assumption in spec).
