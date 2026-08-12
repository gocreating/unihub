import { useCallback, useEffect, useMemo, useState } from 'react';
import { mergeMissingByDeclaredOrder } from '../columnOrder';
import type { ColumnDef, ColumnState, PinSide, ViewColumn } from '../types';

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
  /** Visible columns in DISPLAY order: left-pinned group, unpinned, right-pinned group. */
  visibleColumns: ColumnDef[];
  /** Pinned edge for a VISIBLE column key (undefined for unpinned/hidden/unknown). */
  fixedForKey: (key: string) => PinSide | undefined;
  /**
   * Remount-key component (constitution XII): display-ordered `key:side` pairs of
   * visible pinned columns joined with '|' — changes exactly when the pin layout does.
   */
  pinFingerprint: string;
  /** True when the column config differs from the initial default state. */
  isCustomised: boolean;
  /** True when pendingState differs from activeState (panel has unsaved changes). */
  isDirty: boolean;
  /** Load a whole column state from a ViewConfig (016 views): sets active AND
   *  pending. Reconciles drift — stale keys dropped, missing runtime columns
   *  slotted at their DECLARED position with their default visibility;
   *  labels/dataTypes stay runtime. */
  loadState: (columns: ViewColumn[]) => void;
}

function pinRank(pin: PinSide | undefined): number {
  return pin === 'left' ? 0 : pin === 'right' ? 2 : 1;
}

/**
 * The single display-order comparator: pin-group-major (left, unpinned, right),
 * `order`-minor. rc-table requires fixed columns to be contiguous at the array
 * edges; deriving the grouped order (instead of mutating `order` on pin) keeps
 * each column's home position for when it is unpinned again. Used by the table
 * (visibleColumns) AND the ColumnPanel row list so the panel is WYSIWYG.
 */
export function compareDisplayOrder(a: ColumnDef, b: ColumnDef): number {
  return pinRank(a.pin) - pinRank(b.pin) || a.order - b.order;
}

function sortedVisible(state: ColumnState): ColumnDef[] {
  return [...state.columns].filter((c) => c.visible).sort(compareDisplayOrder);
}

function statesEqual(a: ColumnState, b: ColumnState): boolean {
  if (a.columns.length !== b.columns.length) return false;
  return a.columns.every((ac, i) => {
    const bc = b.columns[i];
    return (
      ac.key === bc?.key &&
      ac.visible === bc.visible &&
      ac.order === bc.order &&
      ac.pin === bc.pin
    );
  });
}

/**
 * Manage column visibility, display order, and per-column sticky pinning.
 * Default pins ride on `initialColumns[].pin` (a page can ship pinned-by-default
 * columns); user changes still win and Reset restores the seeded defaults.
 */
export function useColumnConfig(initialColumns: ColumnDef[]): UseColumnConfigReturn {
  const initial: ColumnState = { columns: initialColumns };

  const [activeState, setActiveState] = useState<ColumnState>(initial);
  const [pendingState, setPendingState] = useState<ColumnState>(initial);

  // When a parent re-renders with updated columns (e.g. async currency labels,
  // or attribute-definition columns loading after mount — iteration 14):
  //   - patch labels of existing columns without disturbing visibility/order/pin,
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
    const defaultState: ColumnState = { columns: initialColumns };
    setActiveState(defaultState);
    setPendingState(defaultState);
  }, [initialColumns]);

  const loadState = useCallback(
    (viewColumns: ViewColumn[]) => {
      const byKey = new Map(initialColumns.map((c) => [c.key, c]));
      const listed = [...viewColumns]
        .sort((a, b) => a.order - b.order)
        .filter((vc) => byKey.has(vc.key));
      const listedByKey = new Map(listed.map((vc) => [vc.key, vc]));
      const declared = [...initialColumns].sort((a, b) => a.order - b.order);
      // Columns the view does not list are slotted at their DECLARED position,
      // the same rule `reconcileConfig` applies to the stored config. The two
      // MUST agree: the table's live state is compared against that reconciled
      // config, so a different placement here reads as unsaved changes (R47).
      const order = mergeMissingByDeclaredOrder(
        listed.map((vc) => vc.key),
        declared.map((c) => c.key),
      );
      // v2 (016 round 2): listed columns take their stored per-column pin
      // verbatim (undefined = unpinned); runtime columns the view never knew
      // about keep their default visibility/pin from initialColumns.
      const columns: ColumnDef[] = order.map((key, i) => {
        const stored = listedByKey.get(key);
        const base = byKey.get(key)!;
        return stored ? { ...base, visible: stored.visible, order: i, pin: stored.pin } : { ...base, order: i };
      });
      const next: ColumnState = { columns };
      setActiveState(next);
      setPendingState(next);
    },
    [initialColumns],
  );

  const visible = useMemo(() => sortedVisible(activeState), [activeState]);

  const fixedForKey = useCallback(
    (key: string): PinSide | undefined =>
      visible.find((c) => c.key === key)?.pin,
    [visible],
  );

  const pinFingerprint = useMemo(
    () =>
      visible
        .filter((c) => c.pin)
        .map((c) => `${c.key}:${c.pin}`)
        .join('|'),
    [visible],
  );

  return {
    pendingState,
    activeState,
    apply,
    cancel,
    reset,
    setPendingState,
    visibleColumns: visible,
    fixedForKey,
    pinFingerprint,
    isCustomised: !statesEqual(activeState, initial),
    isDirty: !statesEqual(pendingState, activeState),
    loadState,
  };
}
