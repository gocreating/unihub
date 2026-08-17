/**
 * A signed money/quantity cell (FR-041/FR-044).
 *
 * Renders `+ NT$ 666` (unit first, for currency) or `+123 0050.TW` (unit after,
 * for a position), colouring by direction with the semantic palette: red for
 * money going out (cost/fee), green for money coming in (income). A position
 * carries no PnL direction of its own, so it stays neutral grey.
 *
 * The sign is always explicit: "666" and "-666" read very differently at a
 * glance, and an unsigned positive is ambiguous in a column that holds both.
 */
import { Typography } from 'antd';
import { COST_COLOR, INCOME_COLOR, POSITION_COLOR, trimDecimal } from './financeDisplay';

export interface SignedAmountProps {
  value: string;
  /** Currency symbol (with `unitFirst`) or asset name (trailing). */
  unit?: string;
  unitFirst?: boolean;
  /** Positions are directionless — render grey rather than red/green. */
  neutral?: boolean;
}

export function SignedAmount({ value, unit, unitFirst, neutral }: SignedAmountProps) {
  const trimmed = trimDecimal(value);
  const negative = trimmed.startsWith('-');
  const magnitude = negative ? trimmed.slice(1) : trimmed;
  const sign = negative ? '-' : '+';
  const color = neutral ? POSITION_COLOR : negative ? COST_COLOR : INCOME_COLOR;

  return (
    <Typography.Text style={{ color, whiteSpace: 'nowrap' }}>
      {unitFirst
        ? `${sign} ${unit ? `${unit} ` : ''}${magnitude}`
        : `${sign}${magnitude}${unit ? ` ${unit}` : ''}`}
    </Typography.Text>
  );
}
