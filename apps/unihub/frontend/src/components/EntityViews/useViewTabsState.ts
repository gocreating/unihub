/**
 * useViewTabsState — the raw open-tab state for one entity table, persisted
 * in sessionStorage (`unihub.views.<tableKey>`) so tabs survive in-app
 * navigation and reloads WITHIN the browser session but die with it
 * (spec: unpinned/anonymous tabs are session-scoped).
 */
import { useEffect, useState } from 'react';
import type { ViewConfig } from '../EntityToolbar/types';

export const DEFAULT_TAB_ID = '__default__';

export type InternalTabKind = 'default' | 'saved' | 'anonymous';

export interface InternalTab {
  tabId: string;
  kind: InternalTabKind;
  viewId?: string;
  name: string;
  /** Last-known config for INACTIVE tabs; the active tab's live config is the
   *  table state itself. */
  config: ViewConfig;
}

interface PersistedState {
  tabs: InternalTab[];
  activeTabId: string;
  /** Manual view-row reveal (FR-025) — survives reloads within the session. */
  revealed: boolean;
}

function storageKey(tableKey: string): string {
  return `unihub.views.${tableKey}`;
}

function defaultTab(defaultConfig: ViewConfig): InternalTab {
  return { tabId: DEFAULT_TAB_ID, kind: 'default', name: '', config: defaultConfig };
}

function restore(tableKey: string, defaultConfig: ViewConfig): PersistedState {
  const fallback: PersistedState = {
    tabs: [defaultTab(defaultConfig)],
    activeTabId: DEFAULT_TAB_ID,
    revealed: false,
  };
  try {
    const raw = window.sessionStorage.getItem(storageKey(tableKey));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return fallback;
    const tabs = parsed.tabs.filter((tab) => tab && tab.tabId && tab.config);
    if (!tabs.some((tab) => tab.kind === 'default')) tabs.unshift(defaultTab(defaultConfig));
    const activeTabId = tabs.some((tab) => tab.tabId === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0]!.tabId;
    return { tabs, activeTabId, revealed: parsed.revealed === true };
  } catch {
    return fallback;
  }
}

export interface UseViewTabsStateReturn {
  tabs: InternalTab[];
  setTabs: React.Dispatch<React.SetStateAction<InternalTab[]>>;
  activeTabId: string;
  setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
  revealed: boolean;
  setRevealed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useViewTabsState(
  tableKey: string,
  defaultConfig: ViewConfig,
): UseViewTabsStateReturn {
  const [state] = useState(() => restore(tableKey, defaultConfig));
  const [tabs, setTabs] = useState<InternalTab[]>(state.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(state.activeTabId);
  const [revealed, setRevealed] = useState<boolean>(state.revealed);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        storageKey(tableKey),
        JSON.stringify({ tabs, activeTabId, revealed }),
      );
    } catch {
      // Storage full/unavailable — tabs simply won't survive a reload.
    }
  }, [tableKey, tabs, activeTabId, revealed]);

  return { tabs, setTabs, activeTabId, setActiveTabId, revealed, setRevealed };
}
