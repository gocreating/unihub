# Data Model: Entity Operations

**Phase**: 1 | **Date**: 2026-05-31 | **Feature**: 008-entity-operations

## Database Changes

**None.** This feature adds no new database tables or migrations. All filter and sort logic is applied at query time using existing Django ORM capabilities. Column configuration is held in React component state (session-scoped).

---

## Backend: New Infrastructure Classes

### `core/filters.py` — EntityFilterBackend

A DRF filter backend that parses the `filters` query param (JSON-encoded `FilterGroups`) and builds Django `Q()` objects.

**Viewset opt-in**:
```python
class MyViewSet(viewsets.ModelViewSet):
    filter_backends = [EntityFilterBackend, filters.OrderingFilter]
    filterable_fields = {
        # Maps attr key → Django ORM lookup field + data type
        'name':     {'lookup': 'name',     'type': 'text'},
        'currency': {'lookup': 'currency', 'type': 'single_select'},
        'amount':   {'lookup': 'amount',   'type': 'number'},
        'date':     {'lookup': 'date',     'type': 'date'},
    }
```

**Q-object construction**:
- Groups are combined with `OR`
- Conditions within a group are combined with `AND` or `OR` (per `group.logic`)
- Operator → ORM lookup mapping:

| Operator     | ORM suffix        | Negated? |
|--------------|-------------------|----------|
| contains     | `__icontains`     | no  |
| not_contains | `__icontains`     | yes |
| equals       | `__iexact`        | no  |
| not_equals   | `__iexact`        | yes |
| starts_with  | `__istartswith`   | no  |
| ends_with    | `__iendswith`     | no  |
| is_empty     | `__isnull` + `=''`| no  |
| is_not_empty | `__isnull` + `=''`| yes |
| eq           | (exact)           | no  |
| neq          | (exact)           | yes |
| gt           | `__gt`            | no  |
| gte          | `__gte`           | no  |
| lt           | `__lt`            | no  |
| lte          | `__lte`           | no  |
| is           | `__iexact`        | no  |
| is_not       | `__iexact`        | yes |
| date_before  | `__lt`            | no  |
| date_after   | `__gt`            | no  |

**Error handling**: Invalid JSON → `400 Bad Request` with `{"filters": "Invalid filter format."}`. Unknown `attr` keys are silently skipped (no error — prevents breaking clients when schema evolves).

---

### `core/pagination.py` — EntityOffsetPagination and EntityCursorPagination

**EntityOffsetPagination** (extends `LimitOffsetPagination`):
```python
class EntityOffsetPagination(LimitOffsetPagination):
    default_limit = 50
    max_limit = 500
```

Response shape:
```json
{
  "count": 1250,
  "next": "https://host/api/v1/.../accounts/?limit=50&offset=100",
  "previous": "https://host/api/v1/.../accounts/?limit=50&offset=0",
  "results": [...]
}
```

**EntityCursorPagination** (extends `CursorPagination`):
```python
class EntityCursorPagination(CursorPagination):
    page_size = 50
    page_size_query_param = 'limit'
    max_page_size = 500
    ordering = '-created_at'  # overridden per viewset
```

Response shape:
```json
{
  "next": "https://host/api/v1/.../balance-sheets/?cursor=cD0yMDI1...",
  "previous": null,
  "results": [...]
}
```

**Viewset opt-in**:
```python
class BalanceSheetViewSet(viewsets.ModelViewSet):
    pagination_class = EntityCursorPagination
```

---

## Frontend: State Shapes (TypeScript)

These types live in `src/components/EntityToolbar/types.ts`.

### FilterCondition

```ts
type FilterOperator =
  | 'contains' | 'not_contains' | 'equals' | 'not_equals'
  | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is' | 'is_not' | 'date_before' | 'date_after';

interface FilterCondition {
  id: string;           // client-side UUID, not sent to backend
  attr: string;         // attribute key (e.g. 'name', 'currency')
  op: FilterOperator;
  val: string;
}
```

### FilterGroup

```ts
type GroupLogic = 'and' | 'or';

interface FilterGroup {
  id: string;           // client-side UUID, not sent to backend
  logic: GroupLogic;
  conditions: FilterCondition[];
}
```

### FilterState (serialised to URL)

```ts
interface FilterPayload {
  groups: Array<{
    logic: GroupLogic;
    conditions: Array<{ attr: string; op: FilterOperator; val: string }>;
  }>;
}
```

### SortRule

```ts
type SortDirection = 'asc' | 'desc';

interface SortRule {
  field: string;        // attribute key (e.g. 'name')
  direction: SortDirection;
}
// Ordered list — index 0 is highest priority
type SortState = SortRule[];
```

### ColumnConfig

```ts
interface ColumnDef {
  key: string;
  label: string;
  dataType: 'text' | 'number' | 'date' | 'boolean' | 'single_select';
  visible: boolean;
  order: number;        // display position (lower = further left)
}

interface ColumnState {
  columns: ColumnDef[];
  stickyLeft: boolean;  // pin first visible column
  stickyRight: boolean; // pin last visible column
}
```

### AttributeDefinition (from API)

Each domain viewset exposes its filterable/sortable attributes. The frontend reads these from the API to populate filter condition dropdowns:

```ts
interface FilterableAttribute {
  key: string;          // e.g. 'name'
  label: string;        // display name
  dataType: 'text' | 'long_text' | 'number' | 'date' | 'boolean' | 'single_select';
  options?: string[];   // for single_select only
}
```

This may be returned inline in a future `GET /api/v1/<domain>/<resource>/meta/` endpoint, or derived from the existing `AttributeDefinition` API. For MVP, the set of filterable attributes is statically declared in each viewset's `filterable_fields` and documented per-domain.

---

## Finance Domain: Filterable/Sortable Attributes

### Currency

| Key      | Type          | Filterable Ops             | Sortable |
|----------|---------------|----------------------------|----------|
| code     | text          | contains, equals, starts_with | ✅ |
| name     | text          | contains, equals, starts_with | ✅ |

### Account

| Key           | Type          | Filterable Ops                | Sortable |
|---------------|---------------|-------------------------------|----------|
| name          | text          | contains, equals, starts_with | ✅ |
| currency      | single_select | is, is_not                    | ✅ |
| open_datetime | date          | date_before, date_after, is_empty, is_not_empty | ✅ |
| close_datetime| date          | date_before, date_after, is_empty, is_not_empty | ✅ |

### ExchangeRate

| Key            | Type          | Filterable Ops             | Sortable |
|----------------|---------------|----------------------------|----------|
| base_currency  | single_select | is, is_not                 | ✅ |
| quote_currency | single_select | is, is_not                 | ✅ |
| date           | date          | date_before, date_after    | ✅ |

### BalanceSheet

| Key  | Type | Filterable Ops          | Sortable |
|------|------|-------------------------|----------|
| date | date | date_before, date_after | ✅ |
