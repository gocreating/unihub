// 016 round 5 — tabs are per-visit state (R37/FR-018), so nothing about them is
// persisted. Round 13 removed the last persisted field with the view row's
// auto-hide (FR-025 withdrawn): the store now writes NOTHING.
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

beforeEach(() => window.sessionStorage.clear());

describe('useViewTabsState', () => {
  it('starts every visit with a single default tab', () => {
    const { result } = renderHook(() => useViewTabsState(DEFAULT_CONFIG));

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]!.kind).toBe('default');
    expect(result.current.activeTabId).toBe('__default__');
  });

  it('writes nothing to sessionStorage, even as tabs change', () => {
    const { result } = renderHook(() => useViewTabsState(DEFAULT_CONFIG));

    act(() =>
      result.current.setTabs((prev) => [
        ...prev,
        { tabId: 'scratch-1', kind: 'anonymous', name: 'New view', config: DEFAULT_CONFIG },
      ]),
    );
    act(() => result.current.setActiveTabId('scratch-1'));

    expect(window.sessionStorage.length).toBe(0);
  });

  it('ignores a payload left behind by an earlier round', () => {
    // Stale state must never be resurrected — neither the tab list (FR-018)
    // nor the withdrawn "revealed" preference.
    window.sessionStorage.setItem(
      'unihub.views.tbl',
      JSON.stringify({
        tabs: [
          { tabId: '__default__', kind: 'default', name: '', config: DEFAULT_CONFIG },
          { tabId: 'scratch-9', kind: 'anonymous', name: 'Leftover', config: DEFAULT_CONFIG },
        ],
        activeTabId: 'scratch-9',
        revealed: true,
      }),
    );

    const { result } = renderHook(() => useViewTabsState(DEFAULT_CONFIG));

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe('__default__');
  });

  it('starts fresh after a remount', () => {
    const first = renderHook(() => useViewTabsState(DEFAULT_CONFIG));
    act(() => first.result.current.setActiveTabId('scratch-1'));
    first.unmount();

    const second = renderHook(() => useViewTabsState(DEFAULT_CONFIG));
    expect(second.result.current.activeTabId).toBe('__default__');
    expect(second.result.current.tabs).toHaveLength(1);
  });
});

// Quick search (019): `search` rides on InternalTab as transient per-visit
// state — and the hook still persists NOTHING (round-13 rule).
describe('useViewTabsState — quick search field (019)', () => {
  it('the initial default tab carries no search and storage stays empty', () => {
    const { result } = renderHook(() => useViewTabsState(DEFAULT_CONFIG));
    expect(result.current.tabs[0]!.search).toBeUndefined();
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });

  it('a search set on a tab stays in memory only', () => {
    const { result } = renderHook(() => useViewTabsState(DEFAULT_CONFIG));
    act(() => {
      result.current.setTabs((prev) => prev.map((t) => ({ ...t, search: 'muji' })));
    });
    expect(result.current.tabs[0]!.search).toBe('muji');
    expect(window.sessionStorage.length).toBe(0);
  });
});
