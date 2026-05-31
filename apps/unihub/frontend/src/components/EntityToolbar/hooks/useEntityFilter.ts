import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FilterGroup, FilterPayload } from '../types';

const uid = () => crypto.randomUUID();

export interface UseEntityFilterReturn {
  /** Groups being edited in the panel (not yet applied). */
  pendingGroups: FilterGroup[];
  /** Groups currently applied to the query. */
  activeGroups: FilterGroup[];
  /** Commit pendingGroups → activeGroups and encode to ?filters= URL param. */
  apply: () => void;
  /** Discard pending changes and restore activeGroups to the panel. */
  cancel: () => void;
  /** Update the pending groups (called from panel UI). */
  setPendingGroups: (groups: FilterGroup[]) => void;
  /** True when there is at least one non-empty active condition. */
  isActive: boolean;
  /** True when pendingGroups differ from activeGroups (panel has unsaved changes). */
  isDirty: boolean;
  /** Clear all active groups and remove ?filters= from URL. */
  reset: () => void;
  /** Serialise activeGroups for the API filters param, or undefined when empty. */
  toApiParam: () => FilterPayload | undefined;
}

function groupsToPayload(groups: FilterGroup[]): FilterPayload | undefined {
  const filled = groups
    .map((g) => ({
      logic: g.logic,
      conditions: g.conditions
        .filter((c) => c.attr && c.op && c.val !== '')
        .map(({ attr, op, val }) => ({ attr, op, val })),
    }))
    .filter((g) => g.conditions.length > 0);

  return filled.length > 0 ? { groups: filled } : undefined;
}

function payloadToGroups(payload: FilterPayload): FilterGroup[] {
  return payload.groups.map((g) => ({
    id: uid(),
    logic: g.logic,
    conditions: g.conditions.map((c) => ({ id: uid(), ...c })),
  }));
}

function emptyGroup(): FilterGroup {
  return {
    id: uid(),
    logic: 'and',
    conditions: [{ id: uid(), attr: '', op: 'contains', val: '' }],
  };
}

/** Manage filter state, URL encoding, and Apply/Cancel lifecycle. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useEntityFilter(_key: string): UseEntityFilterReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const readFromUrl = useCallback((): FilterGroup[] => {
    const raw = searchParams.get('filters');
    if (!raw) return [];
    try {
      const payload = JSON.parse(raw) as FilterPayload;
      return payloadToGroups(payload);
    } catch {
      return [];
    }
  }, [searchParams]);

  const [activeGroups, setActiveGroups] = useState<FilterGroup[]>(() => readFromUrl());
  const [pendingGroups, setPendingGroups] = useState<FilterGroup[]>(() => {
    const from = readFromUrl();
    return from.length > 0 ? from : [emptyGroup()];
  });

  // Sync activeGroups from URL when URL changes externally.
  useEffect(() => {
    const fromUrl = readFromUrl();
    setActiveGroups(fromUrl);
    setPendingGroups(fromUrl.length > 0 ? fromUrl : [emptyGroup()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('filters')]);

  const apply = useCallback(() => {
    const payload = groupsToPayload(pendingGroups);
    setActiveGroups(pendingGroups);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (payload) {
          next.set('filters', JSON.stringify(payload));
        } else {
          next.delete('filters');
        }
        // Applying a filter always resets offset to 0.
        next.delete('offset');
        return next;
      },
      { replace: true },
    );
  }, [pendingGroups, setSearchParams]);

  const cancel = useCallback(() => {
    setPendingGroups(activeGroups.length > 0 ? activeGroups : [emptyGroup()]);
  }, [activeGroups]);

  const reset = useCallback(() => {
    setActiveGroups([]);
    setPendingGroups([emptyGroup()]);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('filters');
        next.delete('offset');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const toApiParam = useCallback((): FilterPayload | undefined => {
    return groupsToPayload(activeGroups);
  }, [activeGroups]);

  const isActive = activeGroups.some((g) =>
    g.conditions.some((c) => c.attr && c.op && c.val !== ''),
  );

  const isDirty =
    JSON.stringify(groupsToPayload(pendingGroups) ?? null) !==
    JSON.stringify(groupsToPayload(activeGroups) ?? null);

  return {
    pendingGroups,
    activeGroups,
    apply,
    cancel,
    setPendingGroups,
    isActive,
    isDirty,
    reset,
    toApiParam,
  };
}
