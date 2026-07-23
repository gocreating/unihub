import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnConfig } from './useColumnConfig';
import type { ColumnDef, ColumnState, PinSide } from '../types';

function makeColumns(overrides: Partial<ColumnDef>[] = []): ColumnDef[] {
  const defaults: ColumnDef[] = [
    { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0 },
    { key: 'amount', label: 'Amount', dataType: 'number', visible: true, order: 1 },
    { key: 'notes', label: 'Notes', dataType: 'long_text', visible: false, order: 2 },
  ];
  return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
}

/** Wider fixture for pin-grouping tests: five visible columns a..e in order. */
function makeWideColumns(): ColumnDef[] {
  return ['a', 'b', 'c', 'd', 'e'].map((k, i) => ({
    key: k,
    label: k.toUpperCase(),
    dataType: 'text' as const,
    visible: true,
    order: i,
  }));
}

/** Panel-style pending update: set/clear one column's pin. */
function withPin(state: ColumnState, key: string, pin: PinSide | undefined): ColumnState {
  return {
    ...state,
    columns: state.columns.map((c) => (c.key === key ? { ...c, pin } : c)),
  };
}

/** Panel-style pending update: toggle one column's visibility. */
function withVisible(state: ColumnState, key: string, visible: boolean): ColumnState {
  return {
    ...state,
    columns: state.columns.map((c) => (c.key === key ? { ...c, visible } : c)),
  };
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

  // C-03: isDirty is true after a pin-only change to pendingState
  it('isDirty becomes true after a pin change in pendingState', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'name', 'left'));
    });

    expect(result.current.isDirty).toBe(true);
  });

  // C-04: apply() commits pendingState → activeState; isDirty becomes false
  it('apply() commits a pending pin and clears isDirty', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'name', 'left'));
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.apply();
    });

    expect(result.current.activeState.columns.find((c) => c.key === 'name')?.pin).toBe('left');
    expect(result.current.isDirty).toBe(false);
  });

  // C-05: cancel() restores pendingState from activeState
  it('cancel() restores pendingState from activeState', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'amount', 'right'));
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.pendingState.columns.find((c) => c.key === 'amount')?.pin).toBeUndefined();
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

  // C-10: isCustomised is false on init, true after applying a pin change
  it('isCustomised is false on init, true after applying a change', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    expect(result.current.isCustomised).toBe(false);

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'name', 'left'));
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

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'name', 'left'));
    });
    act(() => { result.current.apply(); });
    expect(result.current.isCustomised).toBe(true);

    act(() => { result.current.reset(); });

    expect(result.current.activeState.columns.find((c) => c.key === 'name')?.pin).toBeUndefined();
    expect(result.current.pendingState.columns.find((c) => c.key === 'name')?.pin).toBeUndefined();
    expect(result.current.isCustomised).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  // L-01: When initialColumns labels change (e.g. async currency loads), the column
  // panel must show the updated label — visibility, order AND pin must be preserved.
  it('syncs updated labels from initialColumns without resetting visibility, order, or pin', () => {
    const initial = makeColumns();
    const { result, rerender } = renderHook(
      ({ cols }) => useColumnConfig(cols),
      { initialProps: { cols: initial } },
    );

    // User hides 'amount' and pins 'name' left before the label update arrives
    act(() => {
      result.current.setPendingState(
        withPin(withVisible(result.current.pendingState, 'amount', false), 'name', 'left'),
      );
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

    // User's visibility choice (amount hidden) and pin (name left) must be preserved
    expect(result.current.visibleColumns.some((c) => c.key === 'amount')).toBe(false);
    expect(result.current.activeState.columns.find((c) => c.key === 'name')?.pin).toBe('left');
    // isDirty must be unaffected by the label update
    expect(result.current.isDirty).toBe(false);
  });
});

// Iteration 48 (017-multiple-sticky-columns): per-column pin state.
describe('useColumnConfig per-column pins', () => {
  // P-01: display order groups left-pinned first, right-pinned last
  it('visibleColumns orders left group, unpinned middle, right group', () => {
    const { result } = renderHook(() => useColumnConfig(makeWideColumns()));

    act(() => {
      let s = result.current.pendingState;
      s = withPin(s, 'c', 'left');
      s = withPin(s, 'a', 'right');
      s = withPin(s, 'e', 'left');
      result.current.setPendingState(s);
    });
    act(() => { result.current.apply(); });

    // Left group keeps relative order (c before e by order), middle b,d, right a.
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['c', 'e', 'b', 'd', 'a']);
  });

  // P-02: pinning never mutates `order` — unpinning returns the column home
  it('unpinning returns a column to its natural position', () => {
    const { result } = renderHook(() => useColumnConfig(makeWideColumns()));

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'd', 'left'));
    });
    act(() => { result.current.apply(); });
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['d', 'a', 'b', 'c', 'e']);

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'd', undefined));
    });
    act(() => { result.current.apply(); });
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  // P-03: fixedForKey — side for visible pinned, undefined otherwise
  it('fixedForKey returns the pinned side for visible columns only', () => {
    const { result } = renderHook(() => useColumnConfig(makeWideColumns()));

    act(() => {
      let s = result.current.pendingState;
      s = withPin(s, 'a', 'left');
      s = withPin(s, 'b', 'right');
      s = withVisible(withPin(s, 'c', 'left'), 'c', false); // hidden pinned
      result.current.setPendingState(s);
    });
    act(() => { result.current.apply(); });

    expect(result.current.fixedForKey('a')).toBe('left');
    expect(result.current.fixedForKey('b')).toBe('right');
    expect(result.current.fixedForKey('c')).toBeUndefined(); // hidden
    expect(result.current.fixedForKey('d')).toBeUndefined(); // unpinned
    expect(result.current.fixedForKey('nope')).toBeUndefined(); // unknown
  });

  // P-04: pinFingerprint — display-ordered key:side pairs of VISIBLE pins
  it('pinFingerprint lists visible pins in display order and ignores unpinned changes', () => {
    const { result } = renderHook(() => useColumnConfig(makeWideColumns()));
    expect(result.current.pinFingerprint).toBe('');

    act(() => {
      let s = result.current.pendingState;
      s = withPin(s, 'c', 'left');
      s = withPin(s, 'a', 'left');
      s = withPin(s, 'e', 'right');
      result.current.setPendingState(s);
    });
    act(() => { result.current.apply(); });
    expect(result.current.pinFingerprint).toBe('a:left|c:left|e:right');

    // Hiding a pinned column removes it from the fingerprint (pin retained).
    act(() => {
      result.current.setPendingState(withVisible(result.current.pendingState, 'c', false));
    });
    act(() => { result.current.apply(); });
    expect(result.current.pinFingerprint).toBe('a:left|e:right');
    expect(result.current.activeState.columns.find((c) => c.key === 'c')?.pin).toBe('left');

    // Visibility changes of UNPINNED columns must not affect the fingerprint.
    act(() => {
      result.current.setPendingState(withVisible(result.current.pendingState, 'b', false));
    });
    act(() => { result.current.apply(); });
    expect(result.current.pinFingerprint).toBe('a:left|e:right');
  });

  // P-05: a column pins to at most one side — setting the other side swaps
  it('setting the opposite side swaps the pin (mutual exclusion)', () => {
    const { result } = renderHook(() => useColumnConfig(makeWideColumns()));

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'b', 'left'));
    });
    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'b', 'right'));
    });
    act(() => { result.current.apply(); });

    expect(result.current.fixedForKey('b')).toBe('right');
    expect(result.current.pinFingerprint).toBe('b:right');
  });

  // P-06: hiding a pinned column retains its pin; re-showing rejoins its group (FR-010)
  it('re-showing a hidden pinned column restores it to its pin group', () => {
    const { result } = renderHook(() => useColumnConfig(makeWideColumns()));

    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'd', 'left'));
    });
    act(() => { result.current.apply(); });

    act(() => {
      result.current.setPendingState(withVisible(result.current.pendingState, 'd', false));
    });
    act(() => { result.current.apply(); });
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['a', 'b', 'c', 'e']);

    act(() => {
      result.current.setPendingState(withVisible(result.current.pendingState, 'd', true));
    });
    act(() => { result.current.apply(); });
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(result.current.fixedForKey('d')).toBe('left');
  });
});

// Default pins ride on the page's ColumnDef seeds (replaces the defaultSticky option).
describe('useColumnConfig default pin seeds', () => {
  const seeded = (): ColumnDef[] => [
    { key: 'caret', label: 'Toggle', dataType: 'text', visible: true, order: -1, pin: 'left' },
    { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0 },
    { key: 'actions', label: 'Actions', dataType: 'text', visible: true, order: 99, pin: 'right' },
  ];

  it('seeds pins from initialColumns and keeps them across async merges', () => {
    const { result, rerender } = renderHook(
      ({ cols }) => useColumnConfig(cols),
      { initialProps: { cols: seeded() } },
    );
    expect(result.current.fixedForKey('caret')).toBe('left');
    expect(result.current.fixedForKey('actions')).toBe('right');
    expect(result.current.pinFingerprint).toBe('caret:left|actions:right');
    // A seeded default is the default — not a user customisation.
    expect(result.current.isCustomised).toBe(false);
    // Async column merge (label patch) must not clobber the seeded pins.
    const relabelled = seeded().map((c) => (c.key === 'name' ? { ...c, label: 'Name2' } : c));
    rerender({ cols: relabelled });
    expect(result.current.fixedForKey('caret')).toBe('left');
    expect(result.current.fixedForKey('actions')).toBe('right');
  });

  it('user unpin wins over the seed; reset() restores the seeded default', () => {
    const { result } = renderHook(() => useColumnConfig(seeded()));
    act(() => {
      result.current.setPendingState(withPin(result.current.pendingState, 'caret', undefined));
    });
    act(() => {
      result.current.apply();
    });
    expect(result.current.fixedForKey('caret')).toBeUndefined();
    expect(result.current.isCustomised).toBe(true);
    act(() => {
      result.current.reset();
    });
    expect(result.current.fixedForKey('caret')).toBe('left');
    expect(result.current.isCustomised).toBe(false);
  });
});

// Iteration 14: async columns (attribute definitions) merge without disturbing config.
describe('useColumnConfig async column merging', () => {
  it('appends new keys and drops removed keys, preserving existing config and pins', () => {
    const initial = [
      { key: 'a', label: 'A', dataType: 'text' as const, visible: true, order: 0 },
      { key: 'b', label: 'B', dataType: 'text' as const, visible: true, order: 1 },
    ];
    const { result, rerender } = renderHook(
      ({ cols }) => useColumnConfig(cols),
      { initialProps: { cols: initial } },
    );
    // User hides column b and pins a to the right.
    act(() =>
      result.current.setPendingState(
        withPin(withVisible(result.current.pendingState, 'b', false), 'a', 'right'),
      ),
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
    // Label patched; appended column stays hidden; the user's pin survives.
    expect(result.current.activeState.columns[0]?.label).toBe('A2');
    expect(result.current.activeState.columns[0]?.pin).toBe('right');
    expect(result.current.activeState.columns[1]?.visible).toBe(false);
  });

  it('returns referentially-equal state when the merge changes nothing', () => {
    const initial = makeColumns();
    const { result, rerender } = renderHook(
      ({ cols }) => useColumnConfig(cols),
      { initialProps: { cols: initial } },
    );
    const before = result.current.activeState;
    rerender({ cols: makeColumns() });
    expect(result.current.activeState).toBe(before);
  });
});

describe('useColumnConfig loadState (016 entity views)', () => {
  it('hydrates active+pending from ViewColumns, reconciling drift against runtime columns', () => {
    const cols = makeColumns();
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.loadState([
        { key: 'amount', visible: true, order: 0, pin: 'left' },
        { key: 'attr:deleted99', visible: true, order: 1 }, // stale — dropped (FR-021)
        { key: 'name', visible: false, order: 2 },
      ]);
    });

    const state = result.current.activeState;
    // stale key dropped; missing runtime column (notes) appended with its default visibility
    expect(state.columns.map((c) => c.key)).toEqual(['amount', 'name', 'notes']);
    expect(state.columns.map((c) => c.visible)).toEqual([true, false, false]);
    expect(state.columns.map((c) => c.order)).toEqual([0, 1, 2]);
    // labels/dataTypes come from runtime definitions, never from the stored config
    expect(state.columns[0]!.label).toBe('Amount');
    expect(state.columns[0]!.dataType).toBe('number');
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['amount']);
    // v2: the listed column's stored per-column pin applies verbatim.
    expect(result.current.fixedForKey('amount')).toBe('left');
    expect(result.current.pinFingerprint).toBe('amount:left');
    expect(result.current.isDirty).toBe(false);
  });

  it('appended missing runtime columns keep their default visibility', () => {
    const cols = makeColumns(); // notes is hidden by default, amount visible
    const { result } = renderHook(() => useColumnConfig(cols));

    act(() => {
      result.current.loadState([{ key: 'name', visible: true, order: 0 }]);
    });

    const keys = result.current.activeState.columns.map((c) => c.key);
    expect(keys).toEqual(['name', 'amount', 'notes']);
    const visible = result.current.activeState.columns.map((c) => c.visible);
    expect(visible).toEqual([true, true, false]);
  });
});
