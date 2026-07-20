import { useCallback, useRef, useState } from 'react';
import type { SortRule, SortState } from '../types';

const EMPTY_RULE: SortRule = { field: '', direction: 'asc' };

export interface UseEntitySortReturn {
  pendingRules: SortRule[];
  activeRules: SortRule[];
  apply: () => void;
  cancel: () => void;
  reset: () => void;
  setPendingRules: (rules: SortRule[]) => void;
  handleHeaderClick: (field: string) => void;
  sortOrderForField: (field: string) => 'ascend' | 'descend' | null;
  toOrderingParam: () => string | undefined;
  isActive: boolean;
  isDirty: boolean;
  /** Increments each time apply() is called from the panel. Pages include this in the
   *  ProTable `key` to force a remount — AntD only updates sort indicators via its own
   *  onChange; a prop-only change (panel apply) is invisible to its internal state. */
  panelApplyCount: number;
  /** True when activeRules matches the initial default rules passed to the hook.
   *  Used to: disable the Reset button (nothing to reset to), and decide whether
   *  to highlight the Sort toolbar button (primary when NOT at default). */
  isDefault: boolean;
  /** Load a whole sort state (016 views): sets active AND pending clean and
   *  bumps panelApplyCount so the ProTable remount-key pattern fires. */
  loadRules: (rules: SortRule[]) => void;
}

function rulesToOrdering(rules: SortState): string | undefined {
  const filled = rules.filter((r) => r.field);
  if (filled.length === 0) return undefined;
  return filled.map((r) => {
    const prefix = r.direction === 'desc' ? '-' : '';
    const nullsSuffix = r.nulls ? `__nulls${r.nulls}` : '';
    return `${prefix}${r.field}${nullsSuffix}`;
  }).join(',');
}

/** Serialize filled rules for dirty comparison — includes nulls which rulesToOrdering omits. */
function serializeForDirty(rules: SortState): string {
  return JSON.stringify(
    rules
      .filter((r) => r.field)
      .map((r) => ({ f: r.field, d: r.direction, n: r.nulls ?? null })),
  );
}

function orderingToRules(ordering: string): SortState {
  return ordering
    .split(',')
    .filter(Boolean)
    .map((f) => {
      const desc = f.startsWith('-');
      let field = desc ? f.slice(1) : f;
      let nulls: 'first' | 'last' | undefined;
      if (field.endsWith('__nullsfirst')) { field = field.slice(0, -'__nullsfirst'.length); nulls = 'first'; }
      else if (field.endsWith('__nullslast')) { field = field.slice(0, -'__nullslast'.length); nulls = 'last'; }
      return { field, direction: desc ? 'desc' : 'asc', ...(nulls ? { nulls } : {}) } as SortRule;
    });
}

function initialPending(active: SortState): SortState {
  return active.length > 0 ? active : [EMPTY_RULE];
}

export function useEntitySort(_key: string, initialActiveRules: SortRule[] = []): UseEntitySortReturn {
  const defaultRulesRef = useRef(initialActiveRules);
  const [activeRules, setActiveRules] = useState<SortState>(initialActiveRules);
  const [pendingRules, setPendingRules] = useState<SortState>(
    initialActiveRules.length > 0 ? initialActiveRules : [EMPTY_RULE],
  );
  const [panelApplyCount, setPanelApplyCount] = useState(0);

  const apply = useCallback(() => {
    const filled = pendingRules.filter((r) => r.field);
    setActiveRules(filled);
    setPendingRules(filled.length > 0 ? filled : [EMPTY_RULE]);
    setPanelApplyCount((c) => c + 1);
  }, [pendingRules]);

  const cancel = useCallback(() => {
    setPendingRules(initialPending(activeRules));
  }, [activeRules]);

  const reset = useCallback(() => {
    const defaults = defaultRulesRef.current;
    setActiveRules(defaults);
    setPendingRules(defaults.length > 0 ? defaults : [EMPTY_RULE]);
    setPanelApplyCount((c) => c + 1);
  }, []);

  const loadRules = useCallback((rules: SortRule[]) => {
    const filled = rules.filter((r) => r.field);
    setActiveRules(filled);
    setPendingRules(filled.length > 0 ? filled : [EMPTY_RULE]);
    setPanelApplyCount((c) => c + 1);
  }, []);

  const handleHeaderClick = useCallback((field: string) => {
    setActiveRules((prev) => {
      const existing = prev.find((r) => r.field === field);
      let next: SortState;
      if (!existing) {
        next = [...prev, { field, direction: 'asc' }];
      } else if (existing.direction === 'asc') {
        next = prev.map((r) => (r.field === field ? { ...r, direction: 'desc' } : r));
      } else {
        next = prev.filter((r) => r.field !== field);
      }
      setPendingRules(initialPending(next));
      return next;
    });
  }, []);

  const sortOrderForField = useCallback(
    (field: string): 'ascend' | 'descend' | null => {
      const rule = activeRules.find((r) => r.field === field);
      if (!rule) return null;
      return rule.direction === 'asc' ? 'ascend' : 'descend';
    },
    [activeRules],
  );

  const toOrderingParam = useCallback(
    (): string | undefined => rulesToOrdering(activeRules),
    [activeRules],
  );

  const isDirty = serializeForDirty(pendingRules) !== serializeForDirty(activeRules);
  const isDefault = serializeForDirty(activeRules) === serializeForDirty(defaultRulesRef.current);

  return {
    pendingRules,
    activeRules,
    apply,
    cancel,
    reset,
    setPendingRules,
    handleHeaderClick,
    sortOrderForField,
    toOrderingParam,
    isActive: activeRules.length > 0,
    isDirty,
    panelApplyCount,
    isDefault,
    loadRules,
  };
}

export { orderingToRules, rulesToOrdering };
