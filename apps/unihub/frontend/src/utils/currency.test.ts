import { describe, expect, it } from 'vitest';
import { currencySymbol, formatPrice } from './currency';

describe('formatPrice (FR-033)', () => {
  it('renders "{CODE} {symbol} {value}"', () => {
    expect(formatPrice('TWD', '129')).toBe('TWD $ 129');
    expect(formatPrice('RMB', '52.1')).toBe('RMB ¥ 52.1');
    expect(formatPrice('JPY', 300)).toBe('JPY ¥ 300');
    expect(formatPrice('EUR', '35')).toBe('EUR € 35');
  });

  it('drops trailing zeros and groups thousands', () => {
    expect(formatPrice('TWD', '59.9000')).toBe('TWD $ 59.9');
    expect(formatPrice('TWD', '12345.6789')).toBe('TWD $ 12,345.6789');
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
    expect(formatPrice('XYZ', '5')).toBe('XYZ 5');
  });

  it('keeps the sign on negative amounts', () => {
    expect(formatPrice('TWD', '-125')).toBe('TWD $ -125');
  });
});

describe('currencySymbol', () => {
  it('maps known codes and returns empty for unknown', () => {
    expect(currencySymbol('TWD')).toBe('$');
    expect(currencySymbol('CNY')).toBe('¥');
    expect(currencySymbol('KRW')).toBe('₩');
    expect(currencySymbol('XYZ')).toBe('');
    expect(currencySymbol(undefined)).toBe('');
  });
});
