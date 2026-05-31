import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnConfig } from './useColumnConfig';
import type { ColumnDef, ColumnState } from '../types';

function makeColumns(overrides: Partial<ColumnDef>[] = []): ColumnDef[] {
  const defaults: ColumnDef[] = [
    { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0 },
    { key: 'amount', label: 'Amount', dataType: 'number', visible: true, order: 1 },
    { key: 'notes', label: 'Notes', dataType: 'long_text', visible: false, order: 2 },
  ];
  return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
}

describe('useColumnConfig', () => {
  // C-01: init — visibleColumns respects order and visibility
  it('initialises visibleColumns with only visible columns in order', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    expect(result.current.visibleColumns).toHaveLength(2);
    expect(result.current.visibleColumns[0].key).toBe('name');
    expect(result.current.visibleColumns[1].key).toBe('amount');
  });

  // C-02: isDirty is false on init
  it('isDirty is false on initialisation', () => {
    const { result } = renderHook(() => useColumnConfig(makeColumns()));
    expect(result.current.isDirty).toBe(false);
  });

  // C-03: isDirty is true after changing pendingState
  it('isDirty becomes true after setPendingState', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.setPendingState({
        ...result.current.pendingState,
        stickyLeft: true,
      });
    });

    expect(result.current.isDirty).toBe(true);
  });

  // C-04: apply() commits pendingState → activeState; isDirty becomes false
  it('apply() commits pendingState and clears isDirty', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    const newState: ColumnState = {
      ...result.current.pendingState,
      stickyLeft: true,
    };

    act(() => {
      result.current.setPendingState(newState);
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.apply();
    });

    expect(result.current.activeState.stickyLeft).toBe(true);
    expect(result.current.isDirty).toBe(false);
  });

  // C-05: cancel() restores pendingState from activeState
  it('cancel() restores pendingState from activeState', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.setPendingState({
        ...result.current.pendingState,
        stickyRight: true,
      });
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.pendingState.stickyRight).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  // C-06: column reordering — apply() updates visibleColumns order
  it('visibleColumns reflects new order after reordering and applying', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    // Swap the order values for 'name' and 'amount'
    const reordered: ColumnState = {
      ...result.current.pendingState,
      columns: result.current.pendingState.columns.map((c) => {
        if (c.key === 'name') return { ...c, order: 1 };
        if (c.key === 'amount') return { ...c, order: 0 };
        return c;
      }),
    };

    act(() => {
      result.current.setPendingState(reordered);
    });

    act(() => {
      result.current.apply();
    });

    expect(result.current.visibleColumns[0].key).toBe('amount');
    expect(result.current.visibleColumns[1].key).toBe('name');
  });

  // C-07: firstColumnFixed returns 'left' when stickyLeft is active
  it('firstColumnFixed returns "left" when stickyLeft is true', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.setPendingState({ ...result.current.pendingState, stickyLeft: true });
    });

    act(() => {
      result.current.apply();
    });

    expect(result.current.firstColumnFixed).toBe('left');
  });

  // C-08: lastColumnFixed returns 'right' when stickyRight is active
  it('lastColumnFixed returns "right" when stickyRight is true', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.setPendingState({ ...result.current.pendingState, stickyRight: true });
    });

    act(() => {
      result.current.apply();
    });

    expect(result.current.lastColumnFixed).toBe('right');
  });

  // C-09: firstColumnFixed and lastColumnFixed are undefined when flags are false
  it('firstColumnFixed and lastColumnFixed are undefined by default', () => {
    const { result } = renderHook(() => useColumnConfig(makeColumns()));
    expect(result.current.firstColumnFixed).toBeUndefined();
    expect(result.current.lastColumnFixed).toBeUndefined();
  });

  // C-10: isCustomised is false on init, true after applying a change
  it('isCustomised is false on init, true after applying a change', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    expect(result.current.isCustomised).toBe(false);

    act(() => {
      result.current.setPendingState({ ...result.current.pendingState, stickyLeft: true });
    });

    // Still false until apply
    expect(result.current.isCustomised).toBe(false);

    act(() => {
      result.current.apply();
    });

    expect(result.current.isCustomised).toBe(true);
  });
});
