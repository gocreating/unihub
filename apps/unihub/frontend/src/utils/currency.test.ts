import { beforeEach, describe, expect, it } from 'vitest';
import { currencySymbol, formatPrice, setCurrencySymbols } from './currency';

// The registry is seeded from the finance domain's Currency.symbol data
// (FR-033, iteration 33) — these are the user's real symbols.
beforeEach(() => {
  setCurrencySymbols({ TWD: 'NT$', CNY: '¥', JPY: '¥', KRW: '₩', USD: '$' });
});

describe('formatPrice (FR-033)', () => {
  it('renders "{CODE} {symbol} {value}"', () => {
    expect(formatPrice('TWD', '129')).toBe('TWD NT$ 129');
    expect(formatPrice('CNY', '52.1')).toBe('CNY ¥ 52.1');
    expect(formatPrice('JPY', 300)).toBe('JPY ¥ 300');
    expect(formatPrice('KRW', '35')).toBe('KRW ₩ 35');
  });

  it('drops trailing zeros and groups thousands', () => {
    expect(formatPrice('TWD', '59.9000')).toBe('TWD NT$ 59.9');
    expect(formatPrice('TWD', '12345.6789')).toBe('TWD NT$ 12,345.6789');
  });

  it('renders zero and empty amounts as empty (placeholder handled by callers)', () => {
    expect(formatPrice('TWD', 0)).toBe('');
    expect(formatPrice('TWD', '0.0000')).toBe('');
    expect(formatPrice('TWD', '')).toBe('');
    expect(formatPrice('TWD', null)).toBe('');
    expect(formatPrice('TWD', undefined)).toBe('');
  });

  it('falls back gracefully without a code or symbol', () => {
    expect(formatPrice('', '300')).toBe('300');
    expect(formatPrice(undefined, '300')).toBe('300');
    expect(formatPrice('RMB', '5')).toBe('RMB 5'); // no finance entry → code-only
  });

  it('keeps the sign on negative amounts', () => {
    expect(formatPrice('TWD', '-125')).toBe('TWD NT$ -125');
  });
});

describe('currencySymbol (finance-seeded registry)', () => {
  it('reads the finance symbols and returns empty for unseeded codes', () => {
    expect(currencySymbol('TWD')).toBe('NT$');
    expect(currencySymbol('CNY')).toBe('¥');
    expect(currencySymbol('KRW')).toBe('₩');
    expect(currencySymbol('RMB')).toBe('');
    expect(currencySymbol(undefined)).toBe('');
  });

  it('is empty before seeding (code-only fallback everywhere)', () => {
    setCurrencySymbols({});
    expect(currencySymbol('TWD')).toBe('');
    expect(formatPrice('TWD', '129')).toBe('TWD 129');
  });
});
