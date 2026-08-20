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
import { directionColor, formatParts, normalizeAmount } from './format';

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
  maxDecimals,
  style,
}: PriceProps) {
  const parts = normalizeAmount(value, { currency, asset, signed, maxDecimals });
  if (!parts) return <EmptyValue />;

  const text = formatParts(parts, Boolean(currency));
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
      {text}
    </Typography.Text>
  );

  // Gated exactly like Principle VI's truncation tooltip: only when the
  // displayed text actually lost something.
  if (!parts.rounded) return body;
  return (
    <Tooltip title={formatParts({ ...parts, magnitude: parts.exact }, Boolean(currency))}>
      {body}
    </Tooltip>
  );
}
