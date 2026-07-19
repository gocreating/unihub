/** Currency symbols (FR-033, iteration 33): sourced from the FINANCE domain's
 * `Currency.symbol` — never an invented table. The registry is seeded once at
 * the shell level from the finance currencies API; codes without a finance
 * entry render code-only. */
let SYMBOLS: Record<string, string> = {};

/** Seed/replace the registry (AppShell effect; tests seed explicitly). */
export function setCurrencySymbols(map: Record<string, string>): void {
  SYMBOLS = { ...map };
}

export function currencySymbol(code: string | undefined): string {
  if (!code) return '';
  return SYMBOLS[code.toUpperCase()] ?? '';
}

/**
 * Canonical price text: `{CODE} {symbol} {value}` (e.g. "TWD NT$ 129") with
 * trailing zeros dropped and thousands grouped. A zero/empty/invalid amount
 * returns '' — callers render the standard "-" placeholder (FR-033: no code,
 * no symbol without an amount). Codes without a finance symbol render code-only.
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
