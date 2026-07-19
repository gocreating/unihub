import { Typography } from 'antd';

/** The short placeholder character (constitution v1.20.0) — for composed
 * strings such as date ranges with a missing side ("2026-07-10 ~ -"). */
export const EMPTY_TEXT = '-';

// The standard empty-content placeholder (constitution v1.20.0, Principle VI):
// a SHORT dimmed disabled non-selectable "-". The em-dash "—" read like real
// content and misled users — never render it as a placeholder.
export function EmptyValue() {
  return (
    <Typography.Text disabled style={{ userSelect: 'none' }}>
      {EMPTY_TEXT}
    </Typography.Text>
  );
}
