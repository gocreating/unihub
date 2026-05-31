import { useCallback, useState } from 'react';
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

  const apply = useCallback(() => {
    setActiveState(pendingState);
  }, [pendingState]);

  const cancel = useCallback(() => {
    setPendingState(activeState);
  }, [activeState]);

  const visible = sortedVisible(activeState);

  return {
    pendingState,
    activeState,
    apply,
    cancel,
    setPendingState,
    visibleColumns: visible,
    firstColumnFixed: activeState.stickyLeft && visible.length > 0 ? 'left' : undefined,
    lastColumnFixed: activeState.stickyRight && visible.length > 0 ? 'right' : undefined,
    isCustomised: !statesEqual(activeState, initial),
  };
}
