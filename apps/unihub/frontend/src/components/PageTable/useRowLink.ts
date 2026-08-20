/**
 * useRowLink — the ONE implementation of whole-row navigation
 * (constitution v1.25.0, Principle VI "Whole-row navigation replaces the
 * View action").
 *
 * A `<tr>` cannot be an `<a>`, so a clickable row has to reproduce the
 * affordances an anchor gives for free. This helper does that in one place so
 * the semantics cannot drift between tables — the constitution requires every
 * table to obtain the behaviour from here rather than hand-rolling `onRow`:
 *
 *   const rowLink = useRowLink();
 *   <PageTable onRow={(record) => rowLink(`/finance/portfolios/${record.id}`)} … />
 *
 * What it guarantees:
 *   - plain click            → in-SPA navigation
 *   - Ctrl/Cmd/Shift + click → new tab (what the anchor would do)
 *   - middle click           → new tab (via `onAuxClick`; `onClick` never
 *                              fires for the auxiliary button in Chrome)
 *   - right click            → untouched, so the context menu still works
 *   - cursor: pointer        → the row looks clickable
 *
 * And what it must NOT do — these two guards are the regressions whole-row
 * navigation classically introduces (SC-008):
 *   - a click on a control inside the row (Delete, a link, an input, an
 *     expand caret) must act on that control only
 *   - a click that ends a text selection must not navigate away from the text
 *     the user just selected
 */
import { useCallback } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Elements that own their own click. `[data-actions-col]` already wraps every
 * actions cell in this codebase, so row actions are covered everywhere without
 * per-page changes; `[data-row-link-ignore]` is the explicit opt-out for
 * bespoke controls such as a tree caret.
 */
const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '.ant-checkbox',
  '.ant-switch',
  '.ant-dropdown-trigger',
  '[data-actions-col]',
  '[data-row-link-ignore]',
].join(',');

function hasTextSelection(): boolean {
  const selection = typeof window !== 'undefined' ? window.getSelection?.() : null;
  if (!selection || selection.isCollapsed) return false;
  return selection.toString().trim() !== '';
}

function shouldIgnore(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target as Element | null;
  if (target?.closest?.(INTERACTIVE_SELECTOR)) return true;
  return hasTextSelection();
}

function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export interface RowLinkProps {
  style?: CSSProperties;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onAuxClick?: (event: MouseEvent<HTMLElement>) => void;
}

export interface RowBehaviour {
  /** Detail page for this row, if it has one. Navigation wins over toggling. */
  url?: string | null;
  /** Toggles this row's expanded state, for a row that owns child rows. */
  onToggle?: (() => void) | null;
}

/**
 * The ONE row-props factory. Give it what the row can do and spread the result
 * from the table's `onRow`:
 *
 *   const rowProps = useRowProps();
 *   onRow={(r) => rowProps({ url: `/finance/portfolios/${r.id}` })}
 *   onRow={(r) => rowProps({ onToggle: () => toggle(r.id) })}
 *
 * A row that can do NEITHER yields `{}` — it must not look or behave
 * clickable. A row that can do BOTH navigates: the row IS the record, and
 * expansion stays on the caret (constitution v1.27.0, Principle VI).
 *
 * Both behaviours share one set of guards deliberately. Their exceptions —
 * interactive controls, active text selections — are identical, and keeping
 * them in one function is what stops the untested one from drifting.
 */
export function useRowProps(): (behaviour: RowBehaviour) => RowLinkProps {
  const navigate = useNavigate();

  return useCallback(
    ({ url, onToggle }: RowBehaviour): RowLinkProps => {
      if (url) {
        return {
          style: { cursor: 'pointer' },
          onClick: (event) => {
            if (shouldIgnore(event)) return;
            if (event.ctrlKey || event.metaKey || event.shiftKey) {
              openInNewTab(url);
              return;
            }
            navigate(url);
          },
          onAuxClick: (event) => {
            if (event.button !== 1) return; // middle button only; right click is the context menu
            if (shouldIgnore(event)) return;
            event.preventDefault();
            openInNewTab(url);
          },
        };
      }

      if (onToggle) {
        return {
          style: { cursor: 'pointer' },
          onClick: (event) => {
            // The caret carries `[data-row-link-ignore]` and toggles itself.
            // Without this guard a caret click would toggle twice and look inert.
            if (shouldIgnore(event)) return;
            onToggle();
          },
        };
      }

      return {};
    },
    [navigate],
  );
}

/**
 * Navigation-only shorthand for the many tables that only navigate.
 * Equivalent to `useRowProps()({ url })`.
 */
export function useRowLink(): (url: string | null | undefined) => RowLinkProps {
  const rowProps = useRowProps();
  return useCallback((url: string | null | undefined) => rowProps({ url }), [rowProps]);
}
