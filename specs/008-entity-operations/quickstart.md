# Developer Quickstart: Entity Operations

**Feature**: 008-entity-operations | **Date**: 2026-05-31

This guide explains how to wire a new domain viewset into the entity operations infrastructure (filter, sort, column visibility, pagination) once the infrastructure exists.

---

## Backend: Adding Entity Operations to a New Viewset

### 1. Declare `filterable_fields` on the viewset

```python
# apps/unihub/backend/my_domain/views.py
from core.filters import EntityFilterBackend
from core.pagination import EntityOffsetPagination  # or EntityCursorPagination
from rest_framework import filters, viewsets

class MyEntityViewSet(viewsets.ModelViewSet):
    queryset = MyEntity.objects.all()
    serializer_class = MyEntitySerializer

    # Add EntityFilterBackend alongside the existing OrderingFilter
    filter_backends = [EntityFilterBackend, filters.OrderingFilter]

    # Declare which fields the filter backend is allowed to filter on.
    # Key = attr string used in the API filter param.
    # 'lookup' = Django ORM field name; 'type' = data type for operator validation.
    filterable_fields = {
        'name':         {'lookup': 'name',         'type': 'text'},
        'status':       {'lookup': 'status',       'type': 'single_select'},
        'amount':       {'lookup': 'amount',       'type': 'number'},
        'created_at':   {'lookup': 'created_at',   'type': 'date'},
    }

    # Standard DRF multi-column ordering
    ordering_fields = ['name', 'status', 'amount', 'created_at']
    ordering = ['name']

    # Choose offset (default) or cursor pagination
    pagination_class = EntityOffsetPagination
```

### 2. Write tests (test-first)

```python
# apps/unihub/backend/tests/test_my_entity_filter.py
import pytest
from django.urls import reverse

@pytest.mark.django_db
def test_filter_by_name_contains(client):
    # create test entities ...
    import json, urllib.parse
    filters = {"groups": [{"logic": "and", "conditions": [
        {"attr": "name", "op": "contains", "val": "foo"}
    ]}]}
    url = reverse('my-entity-list') + '?filters=' + urllib.parse.quote(json.dumps(filters))
    response = client.get(url)
    assert response.status_code == 200
    # assert only matching entities in results ...

@pytest.mark.django_db
def test_filter_invalid_json_returns_400(client):
    response = client.get(reverse('my-entity-list') + '?filters=INVALID')
    assert response.status_code == 400
    assert 'filters' in response.json()
```

---

## Frontend: Integrating EntityToolbar into a Page

### 1. Set up hooks in the page component

```tsx
// pages/my_domain/my-entities/index.tsx
import { useEntityFilter } from '@/components/EntityToolbar/hooks/useEntityFilter';
import { useEntitySort }   from '@/components/EntityToolbar/hooks/useEntitySort';
import { useColumnConfig } from '@/components/EntityToolbar/hooks/useColumnConfig';
import { EntityToolbar }   from '@/components/EntityToolbar';

const FILTERABLE_ATTRS: FilterableAttribute[] = [
  { key: 'name',   label: 'Name',   dataType: 'text' },
  { key: 'status', label: 'Status', dataType: 'single_select', options: ['active', 'closed'] },
];

const COLUMN_DEFS: ColumnDef[] = [
  { key: 'name',   label: 'Name',   dataType: 'text',          visible: true,  order: 0 },
  { key: 'status', label: 'Status', dataType: 'single_select', visible: true,  order: 1 },
  { key: 'amount', label: 'Amount', dataType: 'number',        visible: true,  order: 2 },
];

export default function MyEntitiesPage() {
  const filter = useEntityFilter('my-entities');
  const sort   = useEntitySort('my-entities');
  const cols   = useColumnConfig(COLUMN_DEFS);

  const { data, isLoading } = useQuery({
    queryKey: ['my-domain', 'my-entities', filter.toApiParam(), sort.toOrderingParam()],
    queryFn: () => listMyEntities({
      filters: filter.toApiParam(),
      ordering: sort.toOrderingParam(),
    }),
  });
  // ...
}
```

### 2. Render EntityToolbar in the PageTable `headerTitle` prop

```tsx
<PageTable
  pageTitle={<FormattedMessage id="pages.myDomain.myEntities.title" />}
  headerTitle={
    <EntityToolbar
      filterProps={{ attrs: FILTERABLE_ATTRS, hook: filter }}
      sortProps={{ attrs: FILTERABLE_ATTRS, hook: sort }}
      columnProps={{ hook: cols }}
    />
  }
  columns={cols.visibleColumns.map(col => ({
    ...col,
    sorter: true,
    sortOrder: sort.sortOrderForField(col.key),
    fixed: col.key === cols.visibleColumns[0]?.key && cols.activeState.stickyLeft
      ? 'left'
      : col.key === cols.visibleColumns.at(-1)?.key && cols.activeState.stickyRight
      ? 'right'
      : undefined,
  }))}
  dataSource={data?.results ?? []}
  loading={isLoading}
  pagination={{
    total: data?.count,
    pageSize: 50,
    onChange: (page, size) => { /* update offset */ },
  }}
  onChange={(_p, _f, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s.field) sort.handleHeaderClick(String(s.field));
  }}
/>
```

### 3. Add i18n keys

```ts
// locales/en-US/pages.ts  (add under common.entityOps)
'common.entityOps.filter': 'Filter',
'common.entityOps.sort': 'Sort',
'common.entityOps.columns': 'Columns',
'common.entityOps.apply': 'Apply',
'common.entityOps.cancel': 'Cancel',
'common.entityOps.reset': 'Reset',
'common.entityOps.addCondition': 'Add condition',
'common.entityOps.addGroup': 'Add group',
'common.entityOps.addSort': 'Add sort rule',
'common.entityOps.noFilters': 'No filters applied',
'common.entityOps.stickyLeft': 'Pin first column',
'common.entityOps.stickyRight': 'Pin last column',
// ... mirror in zh-TW/pages.ts
```

---

## Checklist: "Did I wire it up correctly?"

- [ ] Backend: `filterable_fields` declared on viewset
- [ ] Backend: `filter_backends` includes `EntityFilterBackend`
- [ ] Backend: `ordering_fields` declared, `ordering` default set
- [ ] Backend: `pagination_class` set (offset or cursor)
- [ ] Backend: Tests written and passing (filter happy path + invalid JSON 400 + pagination)
- [ ] Frontend: `useEntityFilter`, `useEntitySort`, `useColumnConfig` instantiated with a stable unique key
- [ ] Frontend: `EntityToolbar` rendered in `headerTitle` prop (not outside PageTable)
- [ ] Frontend: `onChange` wired to `sort.handleHeaderClick` for header-click sort
- [ ] Frontend: Column `sortOrder` controlled via `sort.sortOrderForField`
- [ ] Frontend: Column `fixed` controlled via `cols.activeState.stickyLeft/Right`
- [ ] Frontend: Query key includes filter param and ordering param
- [ ] Frontend: i18n keys added to both `en-US` and `zh-TW` locale files
- [ ] Frontend: `pnpm lint && pnpm typecheck && pnpm test` pass
