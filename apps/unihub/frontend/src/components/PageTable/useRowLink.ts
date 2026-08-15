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

/**
 * Returns a factory: give it the row's detail URL and spread the result from
 * the table's `onRow`. A nullish URL yields `{}` — a row with no detail page
 * must not look or behave clickable.
 */
export function useRowLink(): (url: string | null | undefined) => RowLinkProps {
  const navigate = useNavigate();

  return useCallback(
    (url: string | null | undefined): RowLinkProps => {
      if (!url) return {};
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
    },
    [navigate],
  );
}
