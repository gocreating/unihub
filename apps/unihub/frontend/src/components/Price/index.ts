/**
 * Barrel for the shared pricing surface (constitution XIII): the component and
 * the pure normalizers the charts reuse. A plain `.ts` barrel keeps
 * react-refresh happy — a `.tsx` file may export only components.
 */
export { Price } from './Price';
export type { PriceProps } from './Price';
export {
  COST_COLOR,

  INCOME_COLOR,
  NEUTRAL_COLOR,
  directionColor,
  formatMoney,
  formatParts,
  moneyFormatter,
  normalizeAmount,
  splitParts,
  trimDecimal,
} from './format';
export type { NormalizeOptions, PriceParts, SplitParts } from './format';
export { chartTooltipHtml, pinnedAxisTooltip, seriesMarker } from './chartTooltip';
export type { ChartTooltipRow } from './chartTooltip';
