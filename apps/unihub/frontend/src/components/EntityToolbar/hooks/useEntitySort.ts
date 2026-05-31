import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortRule, SortState } from '../types';

const EMPTY_RULE: SortRule = { field: '', direction: 'asc' };

export interface UseEntitySortReturn {
  /** Rules being edited in the panel (not yet applied). */
  pendingRules: SortRule[];
  /** Rules currently applied to the query. */
  activeRules: SortRule[];
  /** Commit pendingRules → activeRules and encode to ?ordering= URL param. */
  apply: () => void;
  /** Discard pending changes and restore activeRules to the panel. */
  cancel: () => void;
  /** Update the pending rules (called from panel UI). */
  setPendingRules: (rules: SortRule[]) => void;
  /**
   * Immediately cycle the sort state for a column header click
   * (no Apply needed). Cycle: no-sort → asc → desc → no-sort.
   * Also resets pagination to first page.
   */
  handleHeaderClick: (field: string) => void;
  /** Return the Ant Design sortOrder value for a given field. */
  sortOrderForField: (field: string) => 'ascend' | 'descend' | null;
  /** Serialise activeRules to DRF ordering string, or undefined when empty. */
  toOrderingParam: () => string | undefined;
  /** True when there is at least one active sort rule. */
  isActive: boolean;
  /** True when pendingRules differ from activeRules (panel has unsaved changes). */
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

/** Initial pending rules: active rules, or one empty placeholder when there are none. */
function initialPending(active: SortState): SortState {
  return active.length > 0 ? active : [EMPTY_RULE];
}

/** Manage sort state, URL sync, and bidirectional header-click handling. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useEntitySort(_key: string): UseEntitySortReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const readFromUrl = useCallback((): SortState => {
    const raw = searchParams.get('ordering');
    return raw ? orderingToRules(raw) : [];
  }, [searchParams]);

  const [activeRules, setActiveRules] = useState<SortState>(() => readFromUrl());
  const [pendingRules, setPendingRules] = useState<SortState>(() =>
    initialPending(readFromUrl()),
  );

  // Sync activeRules from URL when URL changes externally.
  useEffect(() => {
    const fromUrl = readFromUrl();
    setActiveRules(fromUrl);
    setPendingRules(initialPending(fromUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('ordering')]);

  const writeToUrl = useCallback(
    (rules: SortState) => {
      const ordering = rulesToOrdering(rules);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (ordering) {
            next.set('ordering', ordering);
          } else {
            next.delete('ordering');
          }
          next.delete('offset');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const apply = useCallback(() => {
    // Filter out empty-field placeholder rules before committing.
    const filled = pendingRules.filter((r) => r.field);
    setActiveRules(filled);
    setPendingRules(filled.length > 0 ? filled : [EMPTY_RULE]);
    writeToUrl(filled);
  }, [pendingRules, writeToUrl]);

  const cancel = useCallback(() => {
    setPendingRules(initialPending(activeRules));
  }, [activeRules]);

  const handleHeaderClick = useCallback(
    (field: string) => {
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
        writeToUrl(next);
        return next;
      });
    },
    [writeToUrl],
  );

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
    setPendingRules,
    handleHeaderClick,
    sortOrderForField,
    toOrderingParam,
    isActive: activeRules.length > 0,
    isDirty,
  };
}
