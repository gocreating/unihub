/**
 * Tests for makeSortProps — the helper that drives sort visuals from our own
 * activeRules state instead of AntD's internal sorter state.
 *
 * Why this matters:
 *   AntD ProTable's sort indicators (ant-table-column-sort class, caret icons)
 *   only update via its internal onChange callback (user header click). Controlled
 *   sortOrder prop changes — from panel apply/reset — are ignored by AntD's internal
 *   state. makeSortProps bypasses AntD's mechanism by:
 *     1. Adding ant-table-column-sort class via onHeaderCell/onCell (driven by our state)
 *     2. Rendering our own sort icon in column title (driven by our state)
 *     3. Calling handleHeaderClick via onHeaderCell.onClick instead of sorter+onChange
 */
import React from 'react';
import { render } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { makeSortProps } from './makeSortProps';
import type { SortContext } from './makeSortProps';

function makeCtx(overrides: Partial<SortContext> = {}): SortContext {
  return {
    sortOrderForField: () => null,
    activeRules: [],
    handleHeaderClick: vi.fn(),
    ...overrides,
  };
}

describe('makeSortProps', () => {
  // M-01: Sorted column header must carry ant-table-column-sort for background highlight
  it('onHeaderCell returns ant-table-column-sort class when field is sorted ascend', () => {
    const props = makeSortProps('code', 'Code', makeCtx({
      sortOrderForField: (f) => f === 'code' ? 'ascend' : null,
    }));
    expect(props.onHeaderCell!(undefined as never).className).toBe('ant-table-column-sort');
  });

  it('onHeaderCell returns ant-table-column-sort class when field is sorted descend', () => {
    const props = makeSortProps('code', 'Code', makeCtx({
      sortOrderForField: (f) => f === 'code' ? 'descend' : null,
    }));
    expect(props.onHeaderCell!(undefined as never).className).toBe('ant-table-column-sort');
  });

  // M-02: Unsorted column header must NOT have the highlight class
  it('onHeaderCell returns empty className when field is not sorted', () => {
    const props = makeSortProps('code', 'Code', makeCtx({ sortOrderForField: () => null }));
    expect(props.onHeaderCell!(undefined as never).className).toBe('');
  });

  // M-03: Body cells of sorted column get the same highlight class
  it('onCell returns ant-table-column-sort class when field is sorted', () => {
    const props = makeSortProps('code', 'Code', makeCtx({
      sortOrderForField: (f) => f === 'code' ? 'descend' : null,
    }));
    expect(props.onCell!(undefined as never).className).toBe('ant-table-column-sort');
  });

  // M-04: Body cells of unsorted column must NOT have the class
  it('onCell returns empty className when field is not sorted', () => {
    const props = makeSortProps('code', 'Code', makeCtx({ sortOrderForField: () => null }));
    expect(props.onCell!(undefined as never).className).toBe('');
  });

  // M-05: Header click calls handleHeaderClick with the exact field — this is the
  // click-to-sort mechanism replacing AntD's onChange-based approach
  it('onHeaderCell.onClick calls handleHeaderClick with the field', () => {
    const handleHeaderClick = vi.fn();
    const props = makeSortProps('code', 'Code', makeCtx({ handleHeaderClick }));
    props.onHeaderCell!(undefined as never).onClick?.({} as never);
    expect(handleHeaderClick).toHaveBeenCalledWith('code');
    expect(handleHeaderClick).toHaveBeenCalledTimes(1);
  });

  it('onHeaderCell.onClick calls handleHeaderClick with the correct field (not another field)', () => {
    const handleHeaderClick = vi.fn();
    const props = makeSortProps('amount', 'Amount', makeCtx({ handleHeaderClick }));
    props.onHeaderCell!(undefined as never).onClick?.({} as never);
    expect(handleHeaderClick).toHaveBeenCalledWith('amount');
  });

  // M-06: Title always renders both caret icons (AntD style — both shown, active one highlighted)
  it('title always renders both caret-up and caret-down icons for sortable column', () => {
    // Unsorted
    const unsorted = makeSortProps('code', 'Code', makeCtx({ sortOrderForField: () => null }));
    const { container: cu } = render(unsorted.title as React.ReactElement);
    expect(cu.querySelector('.anticon-caret-up')).toBeTruthy();
    expect(cu.querySelector('.anticon-caret-down')).toBeTruthy();

    // Sorted ascend
    const sorted = makeSortProps('code', 'Code', makeCtx({
      sortOrderForField: (f) => f === 'code' ? 'ascend' : null,
      activeRules: [{ field: 'code', direction: 'asc' }],
    }));
    const { container: ca } = render(sorted.title as React.ReactElement);
    expect(ca.querySelector('.anticon-caret-up')).toBeTruthy();
    expect(ca.querySelector('.anticon-caret-down')).toBeTruthy();
  });

  // M-07: Active caret gets primary color; inactive caret is muted — matches AntD's indicator style
  it('title highlights up caret when sorted ascend and down caret when sorted descend', () => {
    const ascendProps = makeSortProps('code', 'Code', makeCtx({
      sortOrderForField: (f) => f === 'code' ? 'ascend' : null,
      activeRules: [{ field: 'code', direction: 'asc' }],
    }));
    const { container: asc } = render(ascendProps.title as React.ReactElement);
    const upIcon = asc.querySelector<HTMLElement>('.anticon-caret-up');
    const downIcon = asc.querySelector<HTMLElement>('.anticon-caret-down');
    expect(upIcon?.style.color).toBe('rgb(22, 119, 255)');
    expect(downIcon?.style.color).not.toBe('rgb(22, 119, 255)');

    const descendProps = makeSortProps('code', 'Code', makeCtx({
      sortOrderForField: (f) => f === 'code' ? 'descend' : null,
      activeRules: [{ field: 'code', direction: 'desc' }],
    }));
    const { container: desc } = render(descendProps.title as React.ReactElement);
    const downIcon2 = desc.querySelector<HTMLElement>('.anticon-caret-down');
    const upIcon2 = desc.querySelector<HTMLElement>('.anticon-caret-up');
    expect(downIcon2?.style.color).toBe('rgb(22, 119, 255)');
    expect(upIcon2?.style.color).not.toBe('rgb(22, 119, 255)');
  });

  // M-08: Unsorted — both carets are muted (not primary color)
  it('title renders both carets muted when field is not sorted', () => {
    const props = makeSortProps('code', 'Code', makeCtx({ sortOrderForField: () => null }));
    const { container } = render(props.title as React.ReactElement);
    const upIcon = container.querySelector<HTMLElement>('.anticon-caret-up');
    const downIcon = container.querySelector<HTMLElement>('.anticon-caret-down');
    expect(upIcon?.style.color).not.toBe('rgb(22, 119, 255)');
    expect(downIcon?.style.color).not.toBe('rgb(22, 119, 255)');
  });

  // M-09: Title renders label text in all cases
  it('title renders the label text', () => {
    const props = makeSortProps('code', 'Code', makeCtx());
    const { container } = render(props.title as React.ReactElement);
    expect(container.textContent).toContain('Code');
  });

  // M-10: Priority badge shown when multiple rules active (shows priority number)
  it('title renders priority badge when multiple sort rules are active', () => {
    const props = makeSortProps('amount', 'Amount', makeCtx({
      sortOrderForField: (f) => f === 'amount' ? 'descend' : (f === 'name' ? 'ascend' : null),
      activeRules: [{ field: 'name', direction: 'asc' }, { field: 'amount', direction: 'desc' }],
    }));
    const { container } = render(props.title as React.ReactElement);
    // 'amount' is at index 1, so priority badge = 2
    expect(container.textContent).toContain('2');
  });

  // M-11: Priority badge NOT shown for single sort rule
  it('title renders no priority badge when only one sort rule is active', () => {
    const props = makeSortProps('name', 'Name', makeCtx({
      sortOrderForField: (f) => f === 'name' ? 'ascend' : null,
      activeRules: [{ field: 'name', direction: 'asc' }],
    }));
    const { container } = render(props.title as React.ReactElement);
    // textContent should be just "Name" with no digit
    expect(container.textContent).not.toMatch(/\d/);
  });

  // M-12: onHeaderCell has cursor:pointer so user sees the column is clickable
  it('onHeaderCell.style has cursor pointer', () => {
    const props = makeSortProps('code', 'Code', makeCtx());
    expect(props.onHeaderCell!(undefined as never).style?.cursor).toBe('pointer');
  });
});
