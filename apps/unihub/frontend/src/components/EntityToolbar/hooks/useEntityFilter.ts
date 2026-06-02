import { useCallback, useState } from 'react';
import type { FilterCondition, FilterGroup, FilterGroupItem, FilterItem, FilterPayload, FilterRuleItem } from '../types';
import { isFilterGroup } from '../types';

const uid = () => crypto.randomUUID();

const NO_VALUE_OPS = ['is_empty', 'is_not_empty'];

// ── Tree helpers ──────────────────────────────────────────────────────────────

export function emptyRule(): FilterRuleItem {
  return { id: uid(), attr: '', op: 'contains', val: '' };
}

export function emptyRoot(): FilterGroupItem {
  return { id: uid(), type: 'group', logic: 'and', rules: [emptyRule()] };
}

/** Flatten tree into FilterGroup[] for the backend. */
function treeToGroups(root: FilterGroupItem): FilterGroup[] {
  const groups: FilterGroup[] = [];

  const collect = (node: FilterGroupItem) => {
    const conditions: FilterCondition[] = [];
    for (const item of node.rules) {
      if (isFilterGroup(item)) {
        if (conditions.length > 0) {
          groups.push({ id: uid(), logic: node.logic, conditions: [...conditions] });
          conditions.length = 0;
        }
        collect(item);
      } else {
        conditions.push({ id: item.id, attr: item.attr, op: item.op, val: item.val });
      }
    }
    if (conditions.length > 0) {
      groups.push({ id: uid(), logic: node.logic, conditions });
    }
  };

  collect(root);
  return groups.length > 0
    ? groups
    : [{ id: uid(), logic: 'and', conditions: [{ id: uid(), attr: '', op: 'contains', val: '' }] }];
}

/** Build a tree from FilterGroup[] (inverse of treeToGroups). */
function groupsToTree(groups: FilterGroup[]): FilterGroupItem {
  if (groups.length === 0) return emptyRoot();
  if (groups.length === 1) {
    const g = groups[0]!;
    const rules: FilterItem[] = g.conditions.map((c) => ({ id: c.id, attr: c.attr, op: c.op, val: c.val }));
    return { id: g.id, type: 'group', logic: g.logic, rules: rules.length > 0 ? rules : [emptyRule(), emptyRule()] };
  }
  return {
    id: uid(),
    type: 'group',
    logic: 'and',
    rules: groups.map((g): FilterGroupItem => ({
      id: g.id,
      type: 'group',
      logic: g.logic,
      rules: g.conditions.length > 0
        ? g.conditions.map((c): FilterRuleItem => ({ id: c.id, attr: c.attr, op: c.op, val: c.val }))
        : [emptyRule()],
    })),
  };
}

function groupsToPayload(groups: FilterGroup[]): FilterPayload | undefined {
  const filled = groups
    .map((g) => ({
      logic: g.logic,
      conditions: g.conditions
        .filter((c) => c.attr && c.op && (NO_VALUE_OPS.includes(c.op) || c.val !== ''))
        .map(({ attr, op, val }) => ({ attr, op, val })),
    }))
    .filter((g) => g.conditions.length > 0);

  return filled.length > 0 ? { groups: filled } : undefined;
}

function treeToPayload(root: FilterGroupItem): FilterPayload | undefined {
  return groupsToPayload(treeToGroups(root));
}

function payloadToGroups(payload: FilterPayload): FilterGroup[] {
  return payload.groups.map((g) => ({
    id: uid(),
    logic: g.logic,
    conditions: g.conditions.map((c) => ({ id: uid(), ...c })),
  }));
}

function emptyGroup(): FilterGroup {
  return { id: uid(), logic: 'and', conditions: [{ id: uid(), attr: '', op: 'contains', val: '' }] };
}


// ── Hook interface ────────────────────────────────────────────────────────────

export interface UseEntityFilterReturn {
  pendingRoot: FilterGroupItem;
  setPendingRoot: (root: FilterGroupItem) => void;
  pendingGroups: FilterGroup[];
  activeGroups: FilterGroup[];
  setPendingGroups: (groups: FilterGroup[]) => void;
  apply: () => void;
  cancel: () => void;
  isActive: boolean;
  isDirty: boolean;
  reset: () => void;
  toApiParam: () => FilterPayload | undefined;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useEntityFilter(_key: string): UseEntityFilterReturn {
  const [activeGroups, setActiveGroups] = useState<FilterGroup[]>([]);
  const [pendingGroups, setPendingGroupsState] = useState<FilterGroup[]>([emptyGroup()]);
  const [pendingRoot, setPendingRootState] = useState<FilterGroupItem>(emptyRoot);

  const setPendingGroups = useCallback((groups: FilterGroup[]) => {
    setPendingGroupsState(groups);
    setPendingRootState(groupsToTree(groups));
  }, []);

  const setPendingRoot = useCallback((root: FilterGroupItem) => {
    setPendingRootState(root);
    setPendingGroupsState(treeToGroups(root));
  }, []);

  const apply = useCallback(() => {
    const groups = treeToGroups(pendingRoot);
    setActiveGroups(groups);
  }, [pendingRoot]);

  const cancel = useCallback(() => {
    const groups = activeGroups.length > 0 ? activeGroups : [emptyGroup()];
    setPendingGroupsState(groups);
    setPendingRootState(activeGroups.length > 0 ? groupsToTree(activeGroups) : emptyRoot());
  }, [activeGroups]);

  const reset = useCallback(() => {
    setActiveGroups([]);
    setPendingGroupsState([emptyGroup()]);
    setPendingRootState(emptyRoot());
  }, []);

  const toApiParam = useCallback((): FilterPayload | undefined => {
    return groupsToPayload(activeGroups);
  }, [activeGroups]);

  const isActive = activeGroups.some((g) =>
    g.conditions.some((c) => c.attr && c.op && (NO_VALUE_OPS.includes(c.op) || c.val !== '')),
  );

  const isDirty =
    JSON.stringify(treeToPayload(pendingRoot) ?? null) !==
    JSON.stringify(groupsToPayload(activeGroups) ?? null);

  return {
    pendingRoot,
    setPendingRoot,
    pendingGroups,
    activeGroups,
    setPendingGroups,
    apply,
    cancel,
    isActive,
    isDirty,
    reset,
    toApiParam,
  };
}

// Keep these for backward compat with any code that imports them directly
export { payloadToGroups };
