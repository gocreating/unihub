import { useCallback, useState } from 'react';
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
}

function rulesToOrdering(rules: SortState): string | undefined {
  const filled = rules.filter((r) => r.field);
  if (filled.length === 0) return undefined;
  return filled.map((r) => (r.direction === 'desc' ? `-${r.field}` : r.field)).join(',');
}

function orderingToRules(ordering: string): SortState {
  return ordering
    .split(',')
    .filter(Boolean)
    .map((f) => {
      const desc = f.startsWith('-');
      return { field: desc ? f.slice(1) : f, direction: desc ? 'desc' : 'asc' } as SortRule;
    });
}

function initialPending(active: SortState): SortState {
  return active.length > 0 ? active : [EMPTY_RULE];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useEntitySort(_key: string): UseEntitySortReturn {
  const [activeRules, setActiveRules] = useState<SortState>([]);
  const [pendingRules, setPendingRules] = useState<SortState>([EMPTY_RULE]);

  const apply = useCallback(() => {
    const filled = pendingRules.filter((r) => r.field);
    setActiveRules(filled);
    setPendingRules(filled.length > 0 ? filled : [EMPTY_RULE]);
  }, [pendingRules]);

  const cancel = useCallback(() => {
    setPendingRules(initialPending(activeRules));
  }, [activeRules]);

  const reset = useCallback(() => {
    setActiveRules([]);
    setPendingRules([EMPTY_RULE]);
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

  const isDirty =
    JSON.stringify(rulesToOrdering(pendingRules.filter((r) => r.field)) ?? null) !==
    JSON.stringify(rulesToOrdering(activeRules) ?? null);

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
  };
}

export { orderingToRules, rulesToOrdering };
