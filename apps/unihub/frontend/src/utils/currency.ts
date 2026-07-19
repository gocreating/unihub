/** Currency → display symbol (FR-033). One shared map backs displays AND inputs. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  TWD: '$',
  USD: '$',
  HKD: '$',
  RMB: '¥',
  CNY: '¥',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  KRW: '₩',
};

export function currencySymbol(code: string | undefined): string {
  if (!code) return '';
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? '';
}

/**
 * Canonical price text: `{CODE} {symbol} {value}` (e.g. "TWD $ 129") with
 * trailing zeros dropped and thousands grouped. A zero/empty/invalid amount
 * returns '' — callers render the standard "-" placeholder (FR-033: no code,
 * no symbol without an amount). Unmapped codes fall back to code-only.
 */
export function formatPrice(
  code: string | undefined,
  value: string | number | null | undefined,
): string {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  const num = n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return [code ?? '', currencySymbol(code), num].filter(Boolean).join(' ');
}
