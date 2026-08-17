/**
 * Shared display constants and helpers for the portfolio views (FR-041).
 *
 * Kept out of the component files so those export only components
 * (react-refresh), and so the palette has ONE definition used by both the
 * table cells and the charts.
 */

/** FR-041 — the semantic palette. */
export const COST_COLOR = '#cf1322'; // red: cost / fee
export const INCOME_COLOR = '#3f8600'; // green: income
export const POSITION_COLOR = '#8c8c8c'; // grey: position

/** Trim the (38,18) zero padding the API sends. */
export function trimDecimal(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}
