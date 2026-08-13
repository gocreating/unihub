import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { useEntityTable } from './useEntityTable';
import type { ColumnDef, FilterableAttribute } from './types';

const ATTRS: FilterableAttribute[] = [
  { key: 'name', label: 'Name', dataType: 'text' },
  { key: 'amount', label: 'Amount', dataType: 'number' },
];

const COLS: ColumnDef[] = [
  { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0 },
  { key: 'amount', label: 'Amount', dataType: 'number', visible: true, order: 1 },
];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={enUS}>
      {children}
    </IntlProvider>
  </MemoryRouter>
);

describe('useEntityTable', () => {
  it('returns filter, sort, and cols hook instances', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    expect(result.current.filter).toBeDefined();
    expect(result.current.sort).toBeDefined();
    expect(result.current.cols).toBeDefined();
  });

  it('initializes with defaultPageSize 25', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    expect(result.current.limit).toBe(25);
    expect(result.current.offset).toBe(0);
  });

  it('respects custom defaultPageSize', () => {
    const { result } = renderHook(
      () =>
        useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS, defaultPageSize: 50 }),
      { wrapper },
    );
    expect(result.current.limit).toBe(50);
  });

  it('queryParams reflects current limit and offset', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    expect(result.current.queryParams.limit).toBe(25);
    expect(result.current.queryParams.offset).toBe(0);
  });

  // queryParams.ordering drives the API call. After sort.reset() it must be
  // undefined so the backend returns records in its default (initial) order.
  it('queryParams.ordering is set after sort and becomes undefined after sort.reset()', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    // Apply a sort via panel
    act(() => { result.current.sort.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.sort.apply(); });
    expect(result.current.queryParams.ordering).toBe('name');

    // Reset — ordering must be cleared so the API is called without ?ordering=...
    act(() => { result.current.sort.reset(); });
    expect(result.current.queryParams.ordering).toBeUndefined();
    expect(result.current.sort.isActive).toBe(false);
  });

  it('offset resets to 0 when filter is applied', async () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    // Simulate navigating to page 2 by setting offset manually
    act(() => {
      result.current.setOffset(25);
    });
    expect(result.current.offset).toBe(25);

    // Apply a filter — offset should reset
    act(() => {
      result.current.filter.setPendingGroups([
        { id: '1', logic: 'and', conditions: [{ id: '1a', attr: 'name', op: 'contains', val: 'foo' }] },
      ]);
      result.current.filter.apply();
    });
    expect(result.current.offset).toBe(0);
  });

  it('offset resets to 0 when sort is applied via header click', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    act(() => { result.current.setOffset(50); });
    act(() => { result.current.sort.handleHeaderClick('name'); });
    expect(result.current.offset).toBe(0);
  });

  it('handleTableSorterChange calls sort.handleHeaderClick with the field (single object)', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    act(() => {
      result.current.handleTableSorterChange({ field: 'name', order: 'ascend', column: {} } as never);
    });
    expect(result.current.sort.sortOrderForField('name')).toBe('ascend');
  });

  // Panel apply: sort.apply() must commit pendingRules to activeRules AND increment panelApplyCount.
  // sortOrderForField drives the sortOrder prop passed to each column; panelApplyCount drives the
  // PageTable key so ProTable remounts and picks up the new sortOrder (AntD multi-sort internal
  // state only updates via its own onChange, not via prop-only changes).
  it('sort.apply() from panel updates sortOrderForField and increments panelApplyCount for column highlighting', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    // Simulate user picking 'name' desc in the sort panel
    act(() => {
      result.current.sort.setPendingRules([{ field: 'name', direction: 'desc' }]);
    });
    expect(result.current.sort.isDirty).toBe(true);
    expect(result.current.sort.sortOrderForField('name')).toBeNull(); // not yet applied
    expect(result.current.sort.panelApplyCount).toBe(0);

    // User clicks Apply in sort panel
    act(() => {
      result.current.sort.apply();
    });

    // After apply: sortOrderForField reflects the new sort (column will be highlighted on remount)
    expect(result.current.sort.sortOrderForField('name')).toBe('descend');
    expect(result.current.sort.isActive).toBe(true);
    expect(result.current.sort.isDirty).toBe(false);
    expect(result.current.sort.toOrderingParam()).toBe('-name');
    // panelApplyCount must have incremented — page includes it in PageTable key to force remount
    expect(result.current.sort.panelApplyCount).toBe(1);
  });

  // Panel reset: sort.reset() must clear activeRules AND increment panelApplyCount so ProTable
  // remounts and the sort indicators are cleared.
  it('sort.reset() from panel clears sortOrderForField and increments panelApplyCount', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    // Apply a sort first
    act(() => { result.current.sort.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.sort.apply(); });
    expect(result.current.sort.sortOrderForField('name')).toBe('ascend');
    expect(result.current.sort.panelApplyCount).toBe(1);

    // User clicks Reset in sort panel
    act(() => { result.current.sort.reset(); });

    // After reset: no column should be highlighted; panelApplyCount incremented for remount
    expect(result.current.sort.sortOrderForField('name')).toBeNull();
    expect(result.current.sort.isActive).toBe(false);
    expect(result.current.sort.panelApplyCount).toBe(2);
  });

  // Multi-sort: AntD passes full array; correctly identifies the NEW field
  it('handleTableSorterChange detects newly added field from multi-sort array', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    // Pre-sort 'name' asc
    act(() => { result.current.sort.handleHeaderClick('name'); });
    expect(result.current.sort.sortOrderForField('name')).toBe('ascend');

    // AntD fires with [name(existing), amount(new)]
    act(() => {
      result.current.handleTableSorterChange([
        { field: 'name', order: 'ascend', column: {} },
        { field: 'amount', order: 'ascend', column: {} },
      ] as never);
    });
    expect(result.current.sort.sortOrderForField('amount')).toBe('ascend');
    expect(result.current.sort.sortOrderForField('name')).toBe('ascend'); // unchanged
  });

  // Multi-sort: AntD omits a field that was removed; correctly identifies the REMOVED field.
  // AntD only omits a field from the array after it was at 'descend' (third click = remove).
  it('handleTableSorterChange detects removed field from multi-sort array', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    // Put 'name' at descend so the next click removes it
    act(() => { result.current.sort.handleHeaderClick('name'); });   // → asc
    act(() => { result.current.sort.handleHeaderClick('name'); });   // → desc
    act(() => { result.current.sort.handleHeaderClick('amount'); }); // → asc
    expect(result.current.sort.sortOrderForField('name')).toBe('descend');
    expect(result.current.sort.sortOrderForField('amount')).toBe('ascend');

    // AntD fires without 'name' (was desc, user clicked → removed)
    act(() => {
      result.current.handleTableSorterChange([
        { field: 'amount', order: 'ascend', column: {} },
      ] as never);
    });
    expect(result.current.sort.sortOrderForField('name')).toBeNull();
    expect(result.current.sort.sortOrderForField('amount')).toBe('ascend'); // unchanged
  });

  // Multi-sort: AntD reports direction change for one field; correctly toggles that field
  it('handleTableSorterChange detects direction change in multi-sort array', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    act(() => { result.current.sort.handleHeaderClick('name'); });   // name → asc
    act(() => { result.current.sort.handleHeaderClick('amount'); }); // amount → asc

    // AntD fires: 'name' changed to descend, 'amount' still ascend
    act(() => {
      result.current.handleTableSorterChange([
        { field: 'name', order: 'descend', column: {} },
        { field: 'amount', order: 'ascend', column: {} },
      ] as never);
    });
    expect(result.current.sort.sortOrderForField('name')).toBe('descend');
    expect(result.current.sort.sortOrderForField('amount')).toBe('ascend'); // unchanged
  });

  it('paginationProps reflects current page and size', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    const props = result.current.paginationProps(100);
    expect(props.total).toBe(100);
    expect(props.pageSize).toBe(25);
    expect(props.current).toBe(1);
  });

  it('paginationProps.onChange advances offset for page navigation', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    act(() => {
      result.current.paginationProps(100).onChange(2, 25);
    });
    expect(result.current.offset).toBe(25);
  });

  it('paginationProps.onChange resets offset and updates limit on size change', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    act(() => { result.current.setOffset(50); });
    act(() => {
      result.current.paginationProps(100).onChange(1, 50);
    });
    expect(result.current.limit).toBe(50);
    expect(result.current.offset).toBe(0);
  });

  // QF-01: queryParams.filters is undefined before any filter is applied
  it('queryParams.filters is undefined before any filter is applied', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    expect(result.current.queryParams.filters).toBeUndefined();
  });

  // QF-02: after filter.apply() with a real condition, queryParams.filters is defined and contains the condition
  it('queryParams.filters is defined after filter.apply() with a real condition', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );

    act(() => {
      result.current.filter.setPendingGroups([
        {
          id: '1',
          logic: 'and',
          conditions: [{ id: 'c1', attr: 'name', op: 'contains', val: 'foo' }],
        },
      ]);
    });
    act(() => {
      result.current.filter.apply();
    });

    expect(result.current.queryParams.filters).toBeDefined();
    const groups = result.current.queryParams.filters?.groups;
    expect(groups).toBeDefined();
    expect(groups!.length).toBeGreaterThan(0);
    const condition = groups![0]!.conditions[0]!;
    expect(condition.attr).toBe('name');
    expect(condition.op).toBe('contains');
    expect(condition.val).toBe('foo');
  });

  // QF-03: after filter.reset(), queryParams.filters is undefined again
  it('queryParams.filters is undefined again after filter.reset()', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );

    // Apply a real filter first
    act(() => {
      result.current.filter.setPendingGroups([
        {
          id: '1',
          logic: 'and',
          conditions: [{ id: 'c1', attr: 'name', op: 'contains', val: 'foo' }],
        },
      ]);
    });
    act(() => {
      result.current.filter.apply();
    });
    expect(result.current.queryParams.filters).toBeDefined();

    // Now reset — filters must be cleared
    act(() => {
      result.current.filter.reset();
    });
    expect(result.current.queryParams.filters).toBeUndefined();
  });
});

describe('useEntityTable snapshotConfig / loadConfig (016 entity views)', () => {
  const CONFIG = {
    filters: [
      { logic: 'and' as const, conditions: [{ attr: 'name', op: 'contains' as const, val: 'x' }] },
    ],
    sort: [{ field: 'amount', direction: 'desc' as const }],
    columns: [
      { key: 'amount', visible: true, order: 0, pin: 'left' as const },
      { key: 'name', visible: false, order: 1 },
    ],
    pageSize: 100,
  };

  it('snapshotConfig captures the default state', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    const snap = result.current.snapshotConfig();
    expect(snap.filters).toEqual([]);
    expect(snap.sort).toEqual([]);
    expect(snap.columns).toEqual([
      { key: 'name', visible: true, order: 0, pin: undefined },
      { key: 'amount', visible: true, order: 1, pin: undefined },
    ]);
    expect(snap.pageSize).toBe(25);
  });

  it('loadConfig applies every facet and snapshotConfig round-trips it', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );

    act(() => {
      result.current.loadConfig(CONFIG);
    });

    expect(result.current.queryParams.filters).toEqual({ groups: CONFIG.filters });
    expect(result.current.queryParams.ordering).toBe('-amount');
    expect(result.current.limit).toBe(100);
    expect(result.current.offset).toBe(0);
    expect(result.current.cols.visibleColumns.map((c) => c.key)).toEqual(['amount']);
    expect(result.current.cols.fixedForKey('amount')).toBe('left');
    expect(result.current.snapshotConfig()).toEqual(CONFIG);
  });

  it('loadConfig with an explicit offset survives the filter-change page reset', async () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );

    act(() => {
      result.current.loadConfig(CONFIG, { offset: 200 });
    });

    expect(result.current.offset).toBe(200);
    expect(result.current.limit).toBe(100);
  });

  it('exposes the table key as tableKey', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'my-table', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    expect(result.current.tableKey).toBe('my-table');
  });
});

// --- Quick search (019) — T005/T027 locks ------------------------------------

describe('useEntityTable quick search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const renderTable = () =>
    renderHook(() => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }), {
      wrapper,
    });

  it('exposes searchQuery and setSearchQuery, echoing keystrokes immediately', () => {
    const { result } = renderTable();
    expect(result.current.searchQuery).toBe('');
    act(() => {
      result.current.setSearchQuery('mu');
    });
    expect(result.current.searchQuery).toBe('mu');
  });

  it('queryParams gains search only after the debounce elapses', () => {
    const { result } = renderTable();
    act(() => {
      result.current.setSearchQuery('muji');
    });
    expect(result.current.queryParams.search).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.queryParams.search).toBe('muji');
  });

  it('never emits an empty search param (empty and whitespace queries omit the key)', () => {
    const { result } = renderTable();
    expect('search' in result.current.queryParams).toBe(false);
    act(() => {
      result.current.setSearchQuery('   ');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect('search' in result.current.queryParams).toBe(false);

    // Type then clear: the key must vanish again, never `search: ''`.
    act(() => {
      result.current.setSearchQuery('muji');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.queryParams.search).toBe('muji');
    act(() => {
      result.current.setSearchQuery('');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect('search' in result.current.queryParams).toBe(false);
  });

  it('a settled query change resets offset to 0', () => {
    const { result } = renderTable();
    act(() => {
      result.current.setOffset(50);
    });
    expect(result.current.offset).toBe(50);
    act(() => {
      result.current.setSearchQuery('muji');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.offset).toBe(0);
  });

  it('snapshotConfig contains no search key and loadConfig leaves the query untouched', () => {
    const { result } = renderTable();
    act(() => {
      result.current.setSearchQuery('muji');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(Object.keys(result.current.snapshotConfig())).toEqual([
      'filters',
      'sort',
      'columns',
      'pageSize',
    ]);
    act(() => {
      result.current.loadConfig({
        filters: [],
        sort: [],
        columns: COLS.map((c) => ({ key: c.key, visible: true, order: c.order })),
        pageSize: 50,
      });
    });
    expect(result.current.searchQuery).toBe('muji');
  });

  // T027 (US4): a continuous burst produces exactly ONE params transition
  // carrying the final string — never an intermediate prefix.
  it('a 10-keystroke burst produces one search transition with the final text', () => {
    const { result } = renderTable();
    const seen: Array<string | undefined> = [];
    const record = () => {
      const s = result.current.queryParams.search;
      if (seen.length === 0 || seen[seen.length - 1] !== s) seen.push(s);
    };
    record();
    const text = '0123456789';
    for (let i = 1; i <= text.length; i += 1) {
      act(() => {
        result.current.setSearchQuery(text.slice(0, i));
      });
      act(() => {
        vi.advanceTimersByTime(50); // faster than the 300ms debounce
      });
      record();
      expect(result.current.searchQuery).toBe(text.slice(0, i)); // responsive echo
    }
    act(() => {
      vi.advanceTimersByTime(300);
    });
    record();
    expect(seen).toEqual([undefined, '0123456789']);
  });

  // T027 (US4): typing then clearing before the debounce fires never emits.
  it('typing then clearing within the debounce window never emits a search param', () => {
    const { result } = renderTable();
    act(() => {
      result.current.setSearchQuery('muji');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      result.current.setSearchQuery('');
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect('search' in result.current.queryParams).toBe(false);
  });
});
