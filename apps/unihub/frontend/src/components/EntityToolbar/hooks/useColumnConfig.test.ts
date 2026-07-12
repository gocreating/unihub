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
    expect(result.current.visibleColumns[0]!.key).toBe('name');
    expect(result.current.visibleColumns[1]!.key).toBe('amount');
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

    expect(result.current.visibleColumns[0]!.key).toBe('amount');
    expect(result.current.visibleColumns[1]!.key).toBe('name');
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

    expect(result.current.isCustomised).toBe(false);

    act(() => {
      result.current.apply();
    });

    expect(result.current.isCustomised).toBe(true);
  });

  // C-11: reset() restores both activeState and pendingState to the initial defaults
  it('reset() restores both states to initial and clears isCustomised', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    // Apply a customisation
    act(() => {
      result.current.setPendingState({ ...result.current.pendingState, stickyLeft: true });
    });
    act(() => { result.current.apply(); });
    expect(result.current.isCustomised).toBe(true);

    act(() => { result.current.reset(); });

    expect(result.current.activeState.stickyLeft).toBe(false);
    expect(result.current.pendingState.stickyLeft).toBe(false);
    expect(result.current.isCustomised).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  // L-01: When initialColumns labels change (e.g. async currency loads), the column
  // panel must show the updated label — visibility and order must be preserved.
  it('syncs updated labels from initialColumns without resetting visibility or order', () => {
    const initial = makeColumns();
    const { result, rerender } = renderHook(
      ({ cols }) => useColumnConfig(cols),
      { initialProps: { cols: initial } },
    );

    // User hides 'amount' before the label update arrives
    act(() => {
      result.current.setPendingState({
        ...result.current.pendingState,
        columns: result.current.pendingState.columns.map((c) =>
          c.key === 'amount' ? { ...c, visible: false } : c,
        ),
      });
    });
    act(() => { result.current.apply(); });
    expect(result.current.visibleColumns.some((c) => c.key === 'amount')).toBe(false);

    // Parent re-renders with updated label for 'amount' (e.g. baseCurrency loaded)
    const updated = makeColumns([{}, { label: 'Amount (TWD)' }]);
    rerender({ cols: updated });

    // Label must update in both active and pending state
    const activeAmount = result.current.activeState.columns.find((c) => c.key === 'amount');
    const pendingAmount = result.current.pendingState.columns.find((c) => c.key === 'amount');
    expect(activeAmount?.label).toBe('Amount (TWD)');
    expect(pendingAmount?.label).toBe('Amount (TWD)');

    // User's visibility choice (amount hidden) must be preserved
    expect(result.current.visibleColumns.some((c) => c.key === 'amount')).toBe(false);
    // isDirty must be unaffected by the label update
    expect(result.current.isDirty).toBe(false);
  });
});

// Iteration 14: async columns (attribute definitions) merge without disturbing config.
describe('useColumnConfig async column merging', () => {
  it('appends new keys and drops removed keys, preserving existing config', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const initial = [
      { key: 'a', label: 'A', dataType: 'text' as const, visible: true, order: 0 },
      { key: 'b', label: 'B', dataType: 'text' as const, visible: true, order: 1 },
    ];
    const { result, rerender } = renderHook(
      ({ cols }) => useColumnConfig(cols),
      { initialProps: { cols: initial } },
    );
    // User hides column b.
    act(() =>
      result.current.setPendingState({
        ...result.current.pendingState,
        columns: result.current.pendingState.columns.map((c) =>
          c.key === 'b' ? { ...c, visible: false } : c,
        ),
      }),
    );
    act(() => result.current.apply());
    // Async definitions arrive: b removed, attr:x appended (hidden).
    rerender({
      cols: [
        { key: 'a', label: 'A2', dataType: 'text' as const, visible: true, order: 0 },
        { key: 'attr:x', label: 'X', dataType: 'text' as const, visible: false, order: 2 },
      ],
    });
    const keys = result.current.activeState.columns.map((c) => c.key);
    expect(keys).toEqual(['a', 'attr:x']);
    // Label patched; appended column stays hidden.
    expect(result.current.activeState.columns[0]?.label).toBe('A2');
    expect(result.current.activeState.columns[1]?.visible).toBe(false);
  });
});
