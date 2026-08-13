/**
 * useViewTabsState — the raw open-tab state for one entity table.
 *
 * Round 5: tabs are PER-VISIT state (FR-018). Nothing is persisted — every page
 * load starts from a single default tab, and `useEntityViews` rebuilds the row
 * from the account's pinned views plus the view the URL addresses.
 *
 * Round 13 removed the last persisted field. The view row used to auto-hide
 * behind a reveal affordance whose "revealed" preference survived a reload; the
 * row is now always shown (FR-025 withdrawn), so this hook keeps no storage of
 * any kind.
 */
import { useState } from 'react';
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
  /** What "Reset changes" restores on a tab with NO stored view: the config it
   *  was CREATED with (blank for "Add empty view", the source's for Duplicate,
   *  the URL's for an inline restoration). Stored views need none — theirs is
   *  the saved config. In-memory only; tabs are never persisted (round 5). */
  baseline?: ViewConfig;
  /** Quick search (019): the tab's transient query, snapshotted on switch-away
   *  and restored on switch-to. NOT part of ViewConfig — invisible to dirty
   *  compare, URL serialization, and saved views; per-visit only (this hook
   *  persists nothing). New tabs start empty; "Reset changes" leaves it alone
   *  (reset restores stored CONFIG, and search is not config). */
  search?: string;
}

function defaultTab(defaultConfig: ViewConfig): InternalTab {
  return { tabId: DEFAULT_TAB_ID, kind: 'default', name: '', config: defaultConfig };
}

export interface UseViewTabsStateReturn {
  tabs: InternalTab[];
  setTabs: React.Dispatch<React.SetStateAction<InternalTab[]>>;
  activeTabId: string;
  setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
}

export function useViewTabsState(defaultConfig: ViewConfig): UseViewTabsStateReturn {
  // This visit only — no restore, no persist.
  const [tabs, setTabs] = useState<InternalTab[]>(() => [defaultTab(defaultConfig)]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_ID);

  return { tabs, setTabs, activeTabId, setActiveTabId };
}
