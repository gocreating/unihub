import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntityFilter } from './useEntityFilter';
import type { FilterGroup } from '../types';

/** Build a FilterGroup with one filled condition for testing. */
function makeFilledGroup(): FilterGroup {
  return {
    id: 'grp-1',
    logic: 'and',
    conditions: [
      { id: 'cond-1', attr: 'name', op: 'contains', val: 'Alice' },
    ],
  };
}

describe('useEntityFilter', () => {
  // F-01: initialises with one empty pending group, activeGroups is empty
  it('initialises with one empty pending group and empty activeGroups', () => {
    const { result } = renderHook(() => useEntityFilter('test'));

    expect(result.current.activeGroups).toHaveLength(0);
    expect(result.current.pendingGroups).toHaveLength(1);
    expect(result.current.pendingGroups[0]!.conditions).toHaveLength(1);
    expect(result.current.pendingGroups[0]!.conditions[0]!.attr).toBe('');
    expect(result.current.pendingGroups[0]!.conditions[0]!.val).toBe('');
  });

  // F-02: isActive is false on init
  it('isActive is false on initialisation', () => {
    const { result } = renderHook(() => useEntityFilter('test'));
    expect(result.current.isActive).toBe(false);
  });

  // F-03: isDirty is false with only empty pending conditions
  it('isDirty is false when pending only has empty conditions', () => {
    const { result } = renderHook(() => useEntityFilter('test'));
    expect(result.current.isDirty).toBe(false);
  });

  // F-04: isDirty is true when pending has a condition with attr + val filled
  it('isDirty is true when pending contains a filled condition', () => {
    const { result } = renderHook(() => useEntityFilter('test'));

    act(() => {
      result.current.setPendingGroups([makeFilledGroup()]);
    });

    expect(result.current.isDirty).toBe(true);
  });

  // F-05: apply() commits pending to active; isActive becomes true; isDirty becomes false
  it('apply() commits pending groups, sets isActive true, clears isDirty', () => {
    const { result } = renderHook(() => useEntityFilter('test'));

    act(() => {
      result.current.setPendingGroups([makeFilledGroup()]);
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.apply();
    });

    expect(result.current.activeGroups).toHaveLength(1);
    expect(result.current.activeGroups[0]!.conditions[0]!.attr).toBe('name');
    expect(result.current.isActive).toBe(true);
    expect(result.current.isDirty).toBe(false);
  });

  // F-06: cancel() restores pending from active
  it('cancel() restores pendingGroups from activeGroups', () => {
    const { result } = renderHook(() => useEntityFilter('test'));

    // Apply a filled group first
    act(() => {
      result.current.setPendingGroups([makeFilledGroup()]);
    });
    act(() => {
      result.current.apply();
    });

    // Now change pending to something different
    act(() => {
      result.current.setPendingGroups([
        {
          id: 'grp-2',
          logic: 'or',
          conditions: [{ id: 'cond-2', attr: 'amount', op: 'gt', val: '100' }],
        },
      ]);
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.cancel();
    });

    // Pending should reflect the active groups after cancel
    expect(result.current.pendingGroups[0]!.conditions[0]!.attr).toBe('name');
    expect(result.current.isDirty).toBe(false);
  });

  // F-07: cancel() with empty activeGroups adds an empty placeholder group
  it('cancel() adds an empty placeholder group when activeGroups is empty', () => {
    const { result } = renderHook(() => useEntityFilter('test'));

    act(() => {
      result.current.setPendingGroups([makeFilledGroup()]);
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.pendingGroups).toHaveLength(1);
    expect(result.current.pendingGroups[0]!.conditions[0]!.attr).toBe('');
  });

  // F-08: toApiParam() returns undefined when no active conditions
  it('toApiParam() returns undefined when there are no active conditions', () => {
    const { result } = renderHook(() => useEntityFilter('test'));
    expect(result.current.toApiParam()).toBeUndefined();
  });

  // F-09: toApiParam() returns FilterPayload when active conditions exist
  it('toApiParam() returns a FilterPayload when active conditions are present', () => {
    const { result } = renderHook(() => useEntityFilter('test'));

    act(() => {
      result.current.setPendingGroups([makeFilledGroup()]);
    });
    act(() => {
      result.current.apply();
    });

    const param = result.current.toApiParam();
    expect(param).toBeDefined();
    expect(param?.groups).toHaveLength(1);
    expect(param?.groups[0]!.conditions[0]!.attr).toBe('name');
    expect(param?.groups[0]!.conditions[0]!.op).toBe('contains');
    expect(param?.groups[0]!.conditions[0]!.val).toBe('Alice');
  });

  // F-10: reset() clears all active groups, isActive becomes false
  it('reset() clears active groups and sets isActive to false', () => {
    const { result } = renderHook(() => useEntityFilter('test'));

    act(() => {
      result.current.setPendingGroups([makeFilledGroup()]);
    });
    act(() => {
      result.current.apply();
    });

    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.activeGroups).toHaveLength(0);
    expect(result.current.isActive).toBe(false);
    // Pending should have an empty placeholder
    expect(result.current.pendingGroups).toHaveLength(1);
    expect(result.current.pendingGroups[0]!.conditions[0]!.attr).toBe('');
  });

  // F-11: apply() with empty pending conditions leaves activeGroups unchanged (no real conditions)
  it('apply() with only empty conditions does not add active conditions', () => {
    const { result } = renderHook(() => useEntityFilter('test'));

    // pending starts with an empty group — apply without changing anything
    act(() => {
      result.current.apply();
    });

    expect(result.current.activeGroups).toHaveLength(1);
    // The empty group is stored in activeGroups, but isActive is false because
    // no condition has attr+val filled
    expect(result.current.isActive).toBe(false);
  });
});
