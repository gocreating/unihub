// 016 round 5 — the view-row store keeps ONE flag (R37/FR-018): tabs are
// per-visit state, so nothing about them is persisted; only the FR-025
// "row revealed" display preference survives a reload.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewTabsState } from './useViewTabsState';
import type { ViewConfig } from '../EntityToolbar/types';

const DEFAULT_CONFIG: ViewConfig = {
  filters: [],
  sort: [],
  columns: [{ key: 'name', visible: true, order: 0 }],
  pageSize: 25,
};

const KEY = 'unihub.views.tbl';

function stored(): Record<string, unknown> | null {
  const raw = window.sessionStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeEach(() => window.sessionStorage.clear());

describe('useViewTabsState — persistence', () => {
  it('persists ONLY the revealed flag', () => {
    const { result } = renderHook(() => useViewTabsState('tbl', DEFAULT_CONFIG));

    act(() => result.current.setRevealed(true));

    const payload = stored()!;
    expect(payload).toEqual({ revealed: true });
    expect(payload).not.toHaveProperty('tabs');
    expect(payload).not.toHaveProperty('activeTabId');
  });

  it('does not persist tabs even after the list changes', () => {
    const { result } = renderHook(() => useViewTabsState('tbl', DEFAULT_CONFIG));

    act(() =>
      result.current.setTabs((prev) => [
        ...prev,
        { tabId: 'scratch-1', kind: 'anonymous', name: 'New view', config: DEFAULT_CONFIG },
      ]),
    );
    act(() => result.current.setActiveTabId('scratch-1'));

    expect(stored()).toEqual({ revealed: false });
  });

  it('starts every visit with a single default tab, whatever was there before', () => {
    // A stale round-4 payload: the tab list must NOT be resurrected (FR-018).
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        tabs: [
          { tabId: '__default__', kind: 'default', name: '', config: DEFAULT_CONFIG },
          { tabId: 'scratch-9', kind: 'anonymous', name: 'Leftover', config: DEFAULT_CONFIG },
        ],
        activeTabId: 'scratch-9',
        revealed: true,
      }),
    );

    const { result } = renderHook(() => useViewTabsState('tbl', DEFAULT_CONFIG));

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]!.kind).toBe('default');
    expect(result.current.activeTabId).toBe('__default__');
    // …but the display preference inside that stale payload still counts.
    expect(result.current.revealed).toBe(true);
  });

  it('reads a legacy payload tolerantly without throwing', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ tabs: 'not-an-array', revealed: true }));

    const { result } = renderHook(() => useViewTabsState('tbl', DEFAULT_CONFIG));

    expect(result.current.revealed).toBe(true);
    expect(result.current.tabs).toHaveLength(1);
  });

  it('falls back to a hidden row when the payload is corrupt', () => {
    window.sessionStorage.setItem(KEY, '{ not json');

    const { result } = renderHook(() => useViewTabsState('tbl', DEFAULT_CONFIG));

    expect(result.current.revealed).toBe(false);
    expect(result.current.tabs).toHaveLength(1);
  });

  it('keeps the revealed flag across a remount (FR-025)', () => {
    const first = renderHook(() => useViewTabsState('tbl', DEFAULT_CONFIG));
    act(() => first.result.current.setRevealed(true));
    first.unmount();

    const second = renderHook(() => useViewTabsState('tbl', DEFAULT_CONFIG));
    expect(second.result.current.revealed).toBe(true);
  });

  it('scopes the flag per table key', () => {
    const catalog = renderHook(() => useViewTabsState('inventory-catalog', DEFAULT_CONFIG));
    act(() => catalog.result.current.setRevealed(true));

    const accounts = renderHook(() => useViewTabsState('finance-accounts', DEFAULT_CONFIG));
    expect(accounts.result.current.revealed).toBe(false);
  });
});
