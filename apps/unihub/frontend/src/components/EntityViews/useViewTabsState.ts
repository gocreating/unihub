/**
 * useViewTabsState — the raw open-tab state for one entity table.
 *
 * Round 5: tabs are PER-VISIT state (FR-018). Nothing about the tab list is
 * persisted — every page load starts from a single default tab, and
 * `useEntityViews` rebuilds the row from the account's pinned views plus the
 * view the URL addresses. The only thing that survives a reload is the FR-025
 * "row revealed" display preference, which is a property of the row, not a tab.
 *
 * A stale payload from an earlier round (carrying `tabs`/`activeTabId`) is read
 * tolerantly: its `revealed` flag is honoured, everything else ignored.
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

/** The whole persisted footprint of the view row — one display preference. */
interface PersistedViewRowState {
  revealed: boolean;
}

function storageKey(tableKey: string): string {
  return `unihub.views.${tableKey}`;
}

function defaultTab(defaultConfig: ViewConfig): InternalTab {
  return { tabId: DEFAULT_TAB_ID, kind: 'default', name: '', config: defaultConfig };
}

/** Pick `revealed` out of whatever shape the key holds (round-4 payloads
 *  included); anything unreadable means "not revealed". */
function restoreRevealed(tableKey: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(storageKey(tableKey));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { revealed?: unknown };
    return parsed?.revealed === true;
  } catch {
    return false;
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
  // Tabs live for this visit only — no restore, no persist.
  const [tabs, setTabs] = useState<InternalTab[]>(() => [defaultTab(defaultConfig)]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_ID);
  const [revealed, setRevealed] = useState<boolean>(() => restoreRevealed(tableKey));

  useEffect(() => {
    try {
      const payload: PersistedViewRowState = { revealed };
      window.sessionStorage.setItem(storageKey(tableKey), JSON.stringify(payload));
    } catch {
      // Storage full/unavailable — the row simply re-collapses next visit.
    }
  }, [tableKey, revealed]);

  return { tabs, setTabs, activeTabId, setActiveTabId, revealed, setRevealed };
}
