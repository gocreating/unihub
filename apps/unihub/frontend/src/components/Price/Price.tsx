/**
 * `<Price>` — the ONE way a monetary amount or asset quantity reaches the DOM
 * (constitution XIII).
 *
 * Callers declare WHAT they are showing, not how it looks:
 *
 *   <Price value={p.net_value_change} currency="TWD" signed />   → + NT$ 168
 *   <Price value={tr.asset_change_amount} asset="0050.TW" signed neutral /> → +123 0050.TW
 *   <Price value={row.balance} currency="USD" />                 → $ 1,234.5
 *
 * It owns rounding, the symbol, the spacing, the sign, the colour, tabular
 * figures, and the precision tooltip — so no page has to remember any of them,
 * and none of them can differ between two pages again.
 */
import { Tooltip, Typography } from 'antd';
import type { CSSProperties } from 'react';
import Decimal from 'decimal.js';
import { EmptyValue } from '@/components/EmptyValue';
import { directionColor, formatParts, normalizeAmount, splitParts } from './format';

export interface PriceProps {
  value: Decimal.Value | null | undefined;
  /** Currency code — leads the number, and selects money precision. */
  currency?: string | null;
  /** Asset name/ticker — trails the number, and selects quantity precision. */
  asset?: string | null;
  /** Show an explicit sign. Use for a CHANGE; omit for a balance or a price. */
  signed?: boolean;
  /**
   * Suppress red/green. A position has a magnitude and a direction of travel
   * but no profit or loss, so colouring it green would assert something false.
   */
  neutral?: boolean;
  /** Suppress colour entirely — for a plain balance in a neutral column. */
  plain?: boolean;
  /**
   * Render the unit in the secondary tone, in its own span — a holding badge
   * reads `2,145 00918.TW` with the ticker muted so the number leads (FR-052).
   */
  mutedUnit?: boolean;
  maxDecimals?: number;
  style?: CSSProperties;
}

export function Price({
  value,
  currency,
  asset,
  signed = false,
  neutral = false,
  plain = false,
  mutedUnit = false,
  maxDecimals,
  style,
}: PriceProps) {
  const parts = normalizeAmount(value, { currency, asset, signed, maxDecimals });
  if (!parts) return <EmptyValue />;

  const currencyLeads = Boolean(currency);
  const { before, unit, after } = splitParts(parts, currencyLeads);
  const body = (
    <Typography.Text
      style={{
        color: plain ? undefined : directionColor(parts, neutral),
        // Tabular figures: digits keep their column as values change.
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {mutedUnit && unit ? (
        <>
          {before}
          <Typography.Text type="secondary">{unit}</Typography.Text>
          {after}
        </>
      ) : (
        formatParts(parts, currencyLeads)
      )}
    </Typography.Text>
  );

  // Gated exactly like Principle VI's truncation tooltip: only when the
  // displayed text actually lost something.
  if (!parts.rounded) return body;
  return (
    <Tooltip title={formatParts({ ...parts, magnitude: parts.exact }, currencyLeads)}>
      {body}
    </Tooltip>
  );
}
