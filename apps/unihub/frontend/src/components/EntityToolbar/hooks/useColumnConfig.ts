import { useCallback, useEffect, useState } from 'react';
import type { ColumnDef, ColumnState } from '../types';

export interface UseColumnConfigReturn {
  /** Column state being edited in the panel (not yet applied). */
  pendingState: ColumnState;
  /** Column state currently applied to the table. */
  activeState: ColumnState;
  /** Commit pendingState → activeState. */
  apply: () => void;
  /** Discard pending changes and restore activeState to the panel. */
  cancel: () => void;
  /** Reset both pendingState and activeState back to the initial default. */
  reset: () => void;
  /** Update the pending state (called from panel UI). */
  setPendingState: (state: ColumnState) => void;
  /** Ordered visible columns derived from activeState. */
  visibleColumns: ColumnDef[];
  /** `'left'` when stickyLeft is active, otherwise undefined. */
  firstColumnFixed: 'left' | undefined;
  /** `'right'` when stickyRight is active, otherwise undefined. */
  lastColumnFixed: 'right' | undefined;
  /** True when the column config differs from the initial default state. */
  isCustomised: boolean;
  /** True when pendingState differs from activeState (panel has unsaved changes). */
  isDirty: boolean;
}

function sortedVisible(state: ColumnState): ColumnDef[] {
  return [...state.columns]
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order);
}

function statesEqual(a: ColumnState, b: ColumnState): boolean {
  if (a.stickyLeft !== b.stickyLeft || a.stickyRight !== b.stickyRight) return false;
  if (a.columns.length !== b.columns.length) return false;
  return a.columns.every((ac, i) => {
    const bc = b.columns[i];
    return ac.key === bc?.key && ac.visible === bc.visible && ac.order === bc.order;
  });
}

/** Manage column visibility, display order, and sticky-pinning state. */
export function useColumnConfig(initialColumns: ColumnDef[]): UseColumnConfigReturn {
  const initial: ColumnState = { columns: initialColumns, stickyLeft: false, stickyRight: false };

  const [activeState, setActiveState] = useState<ColumnState>(initial);
  const [pendingState, setPendingState] = useState<ColumnState>(initial);

  // When a parent re-renders with updated columns (e.g. async currency labels,
  // or attribute-definition columns loading after mount — iteration 14):
  //   - patch labels of existing columns without disturbing visibility/order,
  //   - append columns whose key is new (e.g. a freshly created parameter),
  //   - drop columns whose key no longer exists (e.g. a deleted parameter).
  // Only updates state when something actually changed to avoid re-renders.
  useEffect(() => {
    const byKey = new Map(initialColumns.map((c) => [c.key, c]));
    const patch = (state: ColumnState): ColumnState => {
      const kept = state.columns.filter((c) => byKey.has(c.key));
      const patched = kept.map((c) => {
        const incoming = byKey.get(c.key)!;
        return incoming.label !== c.label ? { ...c, label: incoming.label } : c;
      });
      const seen = new Set(state.columns.map((c) => c.key));
      const appended = initialColumns.filter((c) => !seen.has(c.key));
      const changed =
        kept.length !== state.columns.length ||
        appended.length > 0 ||
        patched.some((c, i) => c !== kept[i]);
      return changed ? { ...state, columns: [...patched, ...appended] } : state;
    };
    setActiveState(patch);
    setPendingState(patch);
  }, [initialColumns]);

  const apply = useCallback(() => {
    setActiveState(pendingState);
  }, [pendingState]);

  const cancel = useCallback(() => {
    setPendingState(activeState);
  }, [activeState]);

  const reset = useCallback(() => {
    const defaultState: ColumnState = { columns: initialColumns, stickyLeft: false, stickyRight: false };
    setActiveState(defaultState);
    setPendingState(defaultState);
  }, [initialColumns]);

  const visible = sortedVisible(activeState);

  return {
    pendingState,
    activeState,
    apply,
    cancel,
    reset,
    setPendingState,
    visibleColumns: visible,
    firstColumnFixed: activeState.stickyLeft && visible.length > 0 ? 'left' : undefined,
    lastColumnFixed: activeState.stickyRight && visible.length > 0 ? 'right' : undefined,
    isCustomised: !statesEqual(activeState, initial),
    isDirty: !statesEqual(pendingState, activeState),
  };
}
