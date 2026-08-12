// 016 round 12 — the shared page baseline for view tabs (FR-039).
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { viewConfigFromColumns } from './viewConfig';
import { useEntityTable, DEFAULT_PAGE_SIZE } from './useEntityTable';
import type { ColumnDef } from './types';

const COLS: ColumnDef[] = [
  { key: 'caret', label: 'Toggle', dataType: 'text', visible: true, order: -1, pin: 'left' },
  { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0 },
  { key: 'hidden', label: 'Hidden', dataType: 'text', visible: false, order: 1 },
  { key: 'actions', label: 'Actions', dataType: 'text', visible: true, order: 99, pin: 'right' },
];

describe('viewConfigFromColumns', () => {
  it('contributes columns only — no filter, no sorting', () => {
    const config = viewConfigFromColumns(COLS);
    expect(config.filters).toEqual([]);
    expect(config.sort).toEqual([]);
  });

  it('carries each column key, visibility, order and pin verbatim', () => {
    expect(viewConfigFromColumns(COLS).columns).toEqual([
      { key: 'caret', visible: true, order: -1, pin: 'left' },
      { key: 'name', visible: true, order: 0, pin: undefined },
      { key: 'hidden', visible: false, order: 1, pin: undefined },
      { key: 'actions', visible: true, order: 99, pin: 'right' },
    ]);
  });

  it('agrees with the page size the table actually starts at', () => {
    // The point of the helper: a baseline that says 25 while the table opens
    // at 50 is an unsaved indicator on a view nobody touched (round 11).
    const { result } = renderHook(() =>
      useEntityTable({ key: 'tbl', filterableAttrs: [], columnDefs: COLS }),
    );
    expect(viewConfigFromColumns(COLS).pageSize).toBe(result.current.limit);
    expect(viewConfigFromColumns(COLS).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });
});
