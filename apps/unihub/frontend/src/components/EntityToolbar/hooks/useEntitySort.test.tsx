import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntitySort, rulesToOrdering, orderingToRules } from './useEntitySort';


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

  // P-01: panelApplyCount starts at 0
  it('panelApplyCount starts at 0', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    expect(result.current.panelApplyCount).toBe(0);
  });

  // P-02: apply() increments panelApplyCount on each call — used by pages to force ProTable remount
  it('apply() increments panelApplyCount on each call', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.panelApplyCount).toBe(1);

    act(() => { result.current.setPendingRules([{ field: 'amount', direction: 'desc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.panelApplyCount).toBe(2);
  });

  // P-03: handleHeaderClick does NOT increment panelApplyCount (header clicks update normally via props)
  it('handleHeaderClick does not increment panelApplyCount', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => { result.current.handleHeaderClick('name'); });
    expect(result.current.panelApplyCount).toBe(0);

    act(() => { result.current.handleHeaderClick('name'); });
    expect(result.current.panelApplyCount).toBe(0);
  });

  // P-04: cancel() does not increment panelApplyCount
  it('cancel() does not increment panelApplyCount', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.cancel(); });
    expect(result.current.panelApplyCount).toBe(0);
  });

  // P-05: reset() DOES increment panelApplyCount — panel reset changes active sort so ProTable must remount
  it('reset() increments panelApplyCount for ProTable remount to clear sort indicators', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.panelApplyCount).toBe(1);
    expect(result.current.isActive).toBe(true);

    act(() => { result.current.reset(); });
    expect(result.current.panelApplyCount).toBe(2); // incremented — forces remount to clear indicators
    expect(result.current.isActive).toBe(false);
    expect(result.current.sortOrderForField('name')).toBeNull();
  });

  // D-01: isDirty is true when nulls changes — nulls is a distinct part of the sort spec
  it('isDirty is true when pending nulls differs from active nulls', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    // Apply sort without nulls preference
    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.isDirty).toBe(false);

    // Switching nulls radio to 'first' must make panel dirty
    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc', nulls: 'first' }]); });
    expect(result.current.isDirty).toBe(true);
  });

  // D-02: isDirty is false when pending matches active including nulls
  it('isDirty is false when pending matches active including nulls', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc', nulls: 'last' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.isDirty).toBe(false);

    // Pending set to exact same values — must stay clean
    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc', nulls: 'last' }]); });
    expect(result.current.isDirty).toBe(false);
  });

  // D-03: isDirty is true when nulls changes from a set value back to undefined
  it('isDirty is true when pending nulls is cleared after being set', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc', nulls: 'first' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.isDirty).toBe(false);

    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    expect(result.current.isDirty).toBe(true);
  });

  // DF-01: isDefault is true when active matches initialActiveRules (default = empty)
  it('isDefault is true on init with no initialActiveRules', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    expect(result.current.isDefault).toBe(true);
  });

  it('isDefault is false when active sort differs from initialActiveRules', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.isDefault).toBe(false);
  });

  // DF-02: isDefault with non-empty initialActiveRules — balance-sheets use case
  it('isDefault is true when active matches non-empty initialActiveRules', () => {
    const { result } = renderHook(() =>
      useEntitySort('bs', [{ field: 'date', direction: 'desc' }]),
    );
    expect(result.current.isDefault).toBe(true);

    act(() => { result.current.setPendingRules([{ field: 'date', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.isDefault).toBe(false);
  });

  // DF-03: reset() with initialActiveRules restores to those rules, not to empty
  it('reset() restores to initialActiveRules and isDefault becomes true', () => {
    const { result } = renderHook(() =>
      useEntitySort('bs', [{ field: 'date', direction: 'desc' }]),
    );
    // Apply a different sort
    act(() => { result.current.setPendingRules([{ field: 'date', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.sortOrderForField('date')).toBe('ascend');
    expect(result.current.isDefault).toBe(false);

    // Reset — should restore to initialActiveRules, not empty
    act(() => { result.current.reset(); });
    expect(result.current.sortOrderForField('date')).toBe('descend');
    expect(result.current.isActive).toBe(true);
    expect(result.current.isDefault).toBe(true);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.toOrderingParam()).toBe('-date');
  });

  // DF-04: reset() with no initialActiveRules still clears to empty (backward compat)
  it('reset() clears to empty when initialActiveRules is empty', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    act(() => { result.current.reset(); });
    expect(result.current.isActive).toBe(false);
    expect(result.current.isDefault).toBe(true);
    expect(result.current.toOrderingParam()).toBeUndefined();
  });

  // N-01: nulls suffix is encoded in toOrderingParam — required for backend NULLS FIRST/LAST
  it('toOrderingParam encodes nulls:first as __nullsfirst suffix', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc', nulls: 'first' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.toOrderingParam()).toBe('name__nullsfirst');
  });

  it('toOrderingParam encodes nulls:last as __nullslast suffix', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'desc', nulls: 'last' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.toOrderingParam()).toBe('-name__nullslast');
  });

  it('toOrderingParam omits nulls suffix when nulls is undefined', () => {
    const { result } = renderHook(() => useEntitySort('test'));
    act(() => { result.current.setPendingRules([{ field: 'name', direction: 'asc' }]); });
    act(() => { result.current.apply(); });
    expect(result.current.toOrderingParam()).toBe('name');
  });

  it('rulesToOrdering encodes nulls in multi-field sort', () => {
    expect(rulesToOrdering([
      { field: 'name', direction: 'asc', nulls: 'first' },
      { field: 'amount', direction: 'desc', nulls: 'last' },
    ])).toBe('name__nullsfirst,-amount__nullslast');
  });

  // I-01: initialActiveRules seeds both activeRules and pendingRules
  it('initialActiveRules seeds activeRules and pendingRules on mount', () => {
    const { result } = renderHook(() =>
      useEntitySort('balance-sheets', [{ field: 'date', direction: 'desc' }]),
    );
    expect(result.current.activeRules).toHaveLength(1);
    expect(result.current.activeRules[0]!.field).toBe('date');
    expect(result.current.activeRules[0]!.direction).toBe('desc');
    expect(result.current.isActive).toBe(true);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.toOrderingParam()).toBe('-date');
  });

  it('initialActiveRules: sortOrderForField reflects initial rules immediately', () => {
    const { result } = renderHook(() =>
      useEntitySort('balance-sheets', [{ field: 'date', direction: 'desc' }]),
    );
    expect(result.current.sortOrderForField('date')).toBe('descend');
    expect(result.current.sortOrderForField('name')).toBeNull();
  });

  // ── orderingToRules ──────────────────────────────────────────────────────────

  // OTR-01: basic asc — plain field name → single asc rule
  it('orderingToRules: plain field name produces asc rule', () => {
    expect(orderingToRules('name')).toEqual([{ field: 'name', direction: 'asc' }]);
  });

  // OTR-02: basic desc — leading dash → single desc rule
  it('orderingToRules: leading dash produces desc rule', () => {
    expect(orderingToRules('-amount')).toEqual([{ field: 'amount', direction: 'desc' }]);
  });

  // OTR-03: nullsfirst suffix — asc with nulls:first
  it('orderingToRules: __nullsfirst suffix sets nulls:first on asc rule', () => {
    expect(orderingToRules('close_datetime__nullsfirst')).toEqual([
      { field: 'close_datetime', direction: 'asc', nulls: 'first' },
    ]);
  });

  // OTR-04: nullslast suffix on desc — desc with nulls:last
  it('orderingToRules: __nullslast suffix on desc field sets nulls:last', () => {
    expect(orderingToRules('-date__nullslast')).toEqual([
      { field: 'date', direction: 'desc', nulls: 'last' },
    ]);
  });

  // OTR-05: round-trip identity — rulesToOrdering → orderingToRules preserves all fields
  it('orderingToRules round-trips through rulesToOrdering for multi-rule with nulls', () => {
    const rules = [
      { field: 'name', direction: 'asc' as const, nulls: 'first' as const },
      { field: 'amount', direction: 'desc' as const, nulls: 'last' as const },
    ];
    expect(orderingToRules(rulesToOrdering(rules)!)).toEqual(rules);
  });

  // OTR-06: empty string → empty array
  it('orderingToRules: empty string returns empty array', () => {
    expect(orderingToRules('')).toEqual([]);
  });

  // ── handleHeaderClick pendingRules sync ──────────────────────────────────────

  // HC-01: handleHeaderClick syncs pendingRules to match new activeRules
  it('handleHeaderClick syncs pendingRules to reflect updated activeRules', () => {
    const { result } = renderHook(() => useEntitySort('test'));

    // First click → asc; pendingRules must reflect name:asc
    act(() => {
      result.current.handleHeaderClick('name');
    });
    expect(result.current.pendingRules[0]!.field).toBe('name');
    expect(result.current.pendingRules[0]!.direction).toBe('asc');

    // Second click → desc; pendingRules must reflect name:desc
    act(() => {
      result.current.handleHeaderClick('name');
    });
    expect(result.current.pendingRules[0]!.direction).toBe('desc');

    // Third click → removed; pendingRules resets to empty placeholder
    act(() => {
      result.current.handleHeaderClick('name');
    });
    expect(result.current.pendingRules[0]!.field).toBe('');
  });
});

describe('useEntitySort loadRules (016 entity views)', () => {
  it('sets active+pending clean and bumps panelApplyCount for the remount key', () => {
    const { result } = renderHook(() => useEntitySort('t'));
    const before = result.current.panelApplyCount;

    act(() => {
      result.current.loadRules([{ field: 'name', direction: 'desc', nulls: 'first' }]);
    });

    expect(result.current.activeRules).toEqual([
      { field: 'name', direction: 'desc', nulls: 'first' },
    ]);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.panelApplyCount).toBe(before + 1);
  });

  it('loading empty rules clears active and leaves the pending placeholder', () => {
    const { result } = renderHook(() => useEntitySort('t', [{ field: 'name', direction: 'asc' }]));

    act(() => {
      result.current.loadRules([]);
    });

    expect(result.current.activeRules).toEqual([]);
    expect(result.current.pendingRules).toHaveLength(1);
    expect(result.current.pendingRules[0]!.field).toBe('');
    expect(result.current.isDirty).toBe(false);
  });
});
