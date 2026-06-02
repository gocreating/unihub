import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntitySort } from './useEntitySort';


describe('useEntitySort', () => {
  // S-01: initialises with one empty pending rule, activeRules is empty
  it('initialises with one empty pending rule and empty activeRules', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    expect(result.current.activeRules).toHaveLength(0);
    expect(result.current.pendingRules).toHaveLength(1);
    expect(result.current.pendingRules[0]!.field).toBe('');
    expect(result.current.pendingRules[0]!.direction).toBe('asc');
  });

  // S-02: isActive is false with no active rules
  it('isActive is false when there are no active rules', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    expect(result.current.isActive).toBe(false);
  });

  // S-03: isDirty is false with only empty placeholder pending rule
  it('isDirty is false when pendingRules only has an empty placeholder', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    expect(result.current.isDirty).toBe(false);
  });

  // S-04: isDirty is true when pending has a rule with a real field value
  it('isDirty is true when pending contains a rule with a real field', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => {
      result.current.setPendingRules([{ field: 'name', direction: 'asc' }]);
    });

    expect(result.current.isDirty).toBe(true);
  });

  // S-05: apply() with only empty-field rules → activeRules remains empty
  it('apply() with empty-field rules leaves activeRules empty', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => {
      result.current.apply();
    });

    expect(result.current.activeRules).toHaveLength(0);
    expect(result.current.isActive).toBe(false);
  });

  // S-06: apply() with real rules → commits those rules, isActive becomes true
  it('apply() with real rules commits them and sets isActive to true', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => {
      result.current.setPendingRules([{ field: 'name', direction: 'asc' }]);
    });

    act(() => {
      result.current.apply();
    });

    expect(result.current.activeRules).toHaveLength(1);
    expect(result.current.activeRules[0]!.field).toBe('name');
    expect(result.current.activeRules[0]!.direction).toBe('asc');
    expect(result.current.isActive).toBe(true);
    expect(result.current.isDirty).toBe(false);
  });

  // S-07: cancel() restores pendingRules from activeRules
  it('cancel() restores pendingRules from activeRules', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    // First apply a real rule so activeRules has content
    act(() => {
      result.current.setPendingRules([{ field: 'amount', direction: 'desc' }]);
    });
    act(() => {
      result.current.apply();
    });

    // Now change pending to something different
    act(() => {
      result.current.setPendingRules([{ field: 'name', direction: 'asc' }]);
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.pendingRules[0]!.field).toBe('amount');
    expect(result.current.pendingRules[0]!.direction).toBe('desc');
    expect(result.current.isDirty).toBe(false);
  });

  // S-08: cancel() adds placeholder when activeRules is empty
  it('cancel() adds empty placeholder when activeRules is empty', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => {
      result.current.setPendingRules([{ field: 'name', direction: 'asc' }]);
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.pendingRules).toHaveLength(1);
    expect(result.current.pendingRules[0]!.field).toBe('');
  });

  // S-09: handleHeaderClick cycles null → ascend → descend → null
  it('handleHeaderClick cycles sort order: none → asc → desc → none', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    // null (no sort)
    expect(result.current.sortOrderForField('name')).toBeNull();

    // → ascend
    act(() => {
      result.current.handleHeaderClick('name');
    });
    expect(result.current.sortOrderForField('name')).toBe('ascend');

    // → descend
    act(() => {
      result.current.handleHeaderClick('name');
    });
    expect(result.current.sortOrderForField('name')).toBe('descend');

    // → null
    act(() => {
      result.current.handleHeaderClick('name');
    });
    expect(result.current.sortOrderForField('name')).toBeNull();
  });

  // S-10: handleHeaderClick on a new field appends it (lowest priority)
  it('handleHeaderClick on a new field appends it at lowest priority', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => {
      result.current.handleHeaderClick('name');
    });
    act(() => {
      result.current.handleHeaderClick('amount');
    });

    expect(result.current.activeRules).toHaveLength(2);
    expect(result.current.activeRules[0]!.field).toBe('name');
    expect(result.current.activeRules[1]!.field).toBe('amount');
  });

  // S-11: sortOrderForField returns null for unsorted fields
  it('sortOrderForField returns null for fields with no sort rule', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    expect(result.current.sortOrderForField('unknown')).toBeNull();
  });

  // S-12: sortOrderForField returns correct value for sorted fields
  it('sortOrderForField returns ascend/descend for sorted fields', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => {
      result.current.handleHeaderClick('date');
    });
    expect(result.current.sortOrderForField('date')).toBe('ascend');

    act(() => {
      result.current.handleHeaderClick('date');
    });
    expect(result.current.sortOrderForField('date')).toBe('descend');
  });

  // S-13: toOrderingParam returns undefined when no active rules
  it('toOrderingParam returns undefined when there are no active rules', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    expect(result.current.toOrderingParam()).toBeUndefined();
  });

  // S-14: toOrderingParam returns correct DRF ordering string
  it('toOrderingParam returns correct ordering string after applying rules', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => {
      result.current.setPendingRules([
        { field: 'name', direction: 'asc' },
        { field: 'amount', direction: 'desc' },
      ]);
    });

    act(() => {
      result.current.apply();
    });

    expect(result.current.toOrderingParam()).toBe('name,-amount');
  });

  // S-15: reset() clears both active and pending rules
  it('reset() clears activeRules and resets pendingRules to empty placeholder', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.isActive).toBe(true);

    act(() => { result.current.reset(); });

    expect(result.current.activeRules).toHaveLength(0);
    expect(result.current.isActive).toBe(false);
    expect(result.current.pendingRules[0]!.field).toBe('');
    expect(result.current.isDirty).toBe(false);
  });
});
