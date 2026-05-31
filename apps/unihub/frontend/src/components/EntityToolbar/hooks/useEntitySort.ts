import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortRule, SortState } from '../types';

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
}

function rulesToOrdering(rules: SortState): string | undefined {
  if (rules.length === 0) return undefined;
  return rules.map((r) => (r.direction === 'desc' ? `-${r.field}` : r.field)).join(',');
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

/** Manage sort state, URL sync, and bidirectional header-click handling. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useEntitySort(_key: string): UseEntitySortReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const readFromUrl = useCallback((): SortState => {
    const raw = searchParams.get('ordering');
    return raw ? orderingToRules(raw) : [];
  }, [searchParams]);

  const [activeRules, setActiveRules] = useState<SortState>(() => readFromUrl());
  const [pendingRules, setPendingRules] = useState<SortState>(() => readFromUrl());

  // Sync activeRules from URL when URL changes externally.
  useEffect(() => {
    const fromUrl = readFromUrl();
    setActiveRules(fromUrl);
    setPendingRules(fromUrl);
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
    setActiveRules(pendingRules);
    writeToUrl(pendingRules);
  }, [pendingRules, writeToUrl]);

  const cancel = useCallback(() => {
    setPendingRules(activeRules);
  }, [activeRules]);

  const handleHeaderClick = useCallback(
    (field: string) => {
      setActiveRules((prev) => {
        const existing = prev.find((r) => r.field === field);
        let next: SortState;
        if (!existing) {
          // non-sorted → ascending (append at lowest priority)
          next = [...prev, { field, direction: 'asc' }];
        } else if (existing.direction === 'asc') {
          // ascending → descending (in-place)
          next = prev.map((r) => (r.field === field ? { ...r, direction: 'desc' } : r));
        } else {
          // descending → remove
          next = prev.filter((r) => r.field !== field);
        }
        // Sync pendingRules to new activeRules so the panel is up to date.
        setPendingRules(next);
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
  };
}
