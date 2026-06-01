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

  it('handleTableSorterChange calls sort.handleHeaderClick with the field', () => {
    const { result } = renderHook(
      () => useEntityTable({ key: 'test', filterableAttrs: ATTRS, columnDefs: COLS }),
      { wrapper },
    );
    act(() => {
      result.current.handleTableSorterChange({ field: 'name', order: 'ascend', column: {} } as never);
    });
    expect(result.current.sort.sortOrderForField('name')).toBe('ascend');
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
});
