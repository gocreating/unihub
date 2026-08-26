/**
 * Money/quantity normalizers — pure, React-free, so ECharts formatters call
 * exactly the same code as the table cells (constitution XIII).
 *
 * There is ONE precision policy here, and it is deliberately not per-call-site:
 * round to a maximum number of decimals, trim the trailing zeros, group the
 * integer part. Money allows 2 decimals, a quantity 8. That single rule
 * replaces the four that grew up around the app (fixed 2dp, max 4dp, 0dp, and
 * trim-only), and it produces `NT$ 168` from `168.000000000000000000` without
 * any currency-specific table.
 *
 * Values arrive as `Decimal(38,18)` strings. Nothing here converts to `Number`
 * before rounding — an 18-decimal wei balance loses digits the moment it
 * becomes a float, and would print in scientific notation besides.
 */
import Decimal from 'decimal.js';
import { getCurrencySymbol } from '@/utils/finance';

/** Decimals kept for a monetary amount before trailing zeros are trimmed. */
export const MONEY_DECIMALS = 2;
/** Decimals kept for an asset quantity — shares, tokens, fractional units. */
export const QUANTITY_DECIMALS = 8;

/** The semantic palette. Red = money out, green = money in, grey = no direction. */
export const COST_COLOR = '#cf1322';
export const INCOME_COLOR = '#3f8600';
export const NEUTRAL_COLOR = '#8c8c8c';

export interface PriceParts {
  /** '+' or '−' when the value denotes a change; '' when it denotes a balance. */
  sign: string;
  /** Currency symbol, or the code when no symbol is known, or '' for a quantity. */
  unit: string;
  /** Rounded, grouped, zero-trimmed magnitude (never carries the sign). */
  magnitude: string;
  /** Full-precision, zero-trimmed value — what the tooltip shows. */
  exact: string;
  /** True when `magnitude` is a rounded form of `exact`. Gates the tooltip. */
  rounded: boolean;
  negative: boolean;
  zero: boolean;
}

/** Strip the (38,18) zero padding the API sends: "419.000000000000000000" → "419". */
export function trimDecimal(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}

/** Thousands separators on the integer part only. */
function group(magnitude: string): string {
  const [whole, frac] = magnitude.split('.');
  const grouped = (whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export interface NormalizeOptions {
  /** Currency code — resolves the unit and selects the money precision. */
  currency?: string | null;
  /** Asset name or ticker, for a quantity. Mutually exclusive with `currency`. */
  asset?: string | null;
  /** Render an explicit sign — for a CHANGE, not a balance. */
  signed?: boolean;
  /** Override the decimal ceiling. Defaults by kind. */
  maxDecimals?: number;
}

/**
 * The one place a stored decimal becomes display text. Everything else —
 * the component, the chart axis, the tooltip — reads these parts.
 */
export function normalizeAmount(
  value: Decimal.Value | null | undefined,
  { currency, asset, signed = false, maxDecimals }: NormalizeOptions = {},
): PriceParts | null {
  if (value == null || value === '') return null;
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    return null;
  }
  if (!decimal.isFinite()) return null;

  const ceiling = maxDecimals ?? (currency ? MONEY_DECIMALS : QUANTITY_DECIMALS);
  const magnitudeDecimal = decimal.abs();
  const exact = trimDecimal(magnitudeDecimal.toFixed());
  const roundedRaw = trimDecimal(magnitudeDecimal.toFixed(ceiling, Decimal.ROUND_HALF_UP));

  return {
    // A change is explicitly signed both ways; a balance omits the '+' but a
    // negative balance (a debt, a short position) must still read as negative.
    sign: decimal.isNegative() ? '−' : signed ? '+' : '',
    unit: currency ? getCurrencySymbol(currency) : (asset ?? ''),
    magnitude: group(roundedRaw),
    exact: group(exact),
    rounded: roundedRaw !== exact,
    negative: decimal.isNegative(),
    zero: decimal.isZero(),
  };
}

export interface SplitParts {
  before: string;
  unit: string;
  after: string;
}

/**
 * The composed display string in three pieces — what precedes the unit, the
 * unit, what follows it — so a component can restyle the unit (FR-052's
 * muted asset name) while `formatParts` stays the ONE composition rule.
 */
export function splitParts(parts: PriceParts, currencyLeads: boolean): SplitParts {
  const { sign, unit, magnitude } = parts;
  if (!unit) return { before: sign ? `${sign} ${magnitude}` : magnitude, unit: '', after: '' };
  if (currencyLeads) return { before: sign ? `${sign} ` : '', unit, after: ` ${magnitude}` };
  return { before: sign ? `${sign}${magnitude} ` : `${magnitude} `, unit, after: '' };
}

/**
 * The display string. Currency leads (`+ NT$ 168`); an asset unit trails
 * (`+123 0050.TW`), because that is how a quantity reads aloud.
 */
export function formatParts(parts: PriceParts, currencyLeads: boolean): string {
  const { before, unit, after } = splitParts(parts, currencyLeads);
  return `${before}${unit}${after}`;
}

/** Convenience for one-shot formatting (chart tooltips, aria labels, tests). */
export function formatMoney(
  value: Decimal.Value | null | undefined,
  options: NormalizeOptions = {},
): string {
  const parts = normalizeAmount(value, options);
  return parts ? formatParts(parts, Boolean(options.currency)) : '';
}

/**
 * An ECharts axis/tooltip formatter bound to one currency — the reason the
 * normalizers are React-free. Charts MUST use this rather than re-composing
 * `symbol + number`, which is how the app ended up with four precisions.
 */
export function moneyFormatter(
  currency: string,
  options: Omit<NormalizeOptions, 'currency'> = {},
): (value: number) => string {
  return (value: number) => formatMoney(value, { ...options, currency });
}

/** Palette lookup for a signed value: red out, green in, grey directionless. */
export function directionColor(parts: PriceParts, neutral: boolean): string {
  if (neutral) return NEUTRAL_COLOR;
  return parts.negative ? COST_COLOR : INCOME_COLOR;
}
