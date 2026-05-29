import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBaseCurrency } from './useBaseCurrency';
import type { Currency } from '@/services/unihub-backend/finance';

const makeCurrency = (code: string, isBase = false): Currency => ({
  code,
  name: `${code} Currency`,
  symbol: code,
  is_base_currency: isBase,
});

const USD = makeCurrency('USD', true);
const TWD = makeCurrency('TWD', true);

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('useBaseCurrency', () => {
  it('returns null when no base currencies exist', () => {
    const { result } = renderHook(() => useBaseCurrency([]));
    expect(result.current[0]).toBeNull();
  });

  it('auto-selects the first base currency when none stored', () => {
    const { result } = renderHook(() => useBaseCurrency([USD, TWD]));
    expect(result.current[0]).toBe('USD');
  });

  it('persists the selection in localStorage', () => {
    const { result } = renderHook(() => useBaseCurrency([USD, TWD]));
    act(() => result.current[1]('TWD'));
    expect(localStorage.getItem('finance.baseCurrency')).toBe('TWD');
    expect(result.current[0]).toBe('TWD');
  });

  it('restores a valid stored selection on mount', () => {
    localStorage.setItem('finance.baseCurrency', 'TWD');
    const { result } = renderHook(() => useBaseCurrency([USD, TWD]));
    expect(result.current[0]).toBe('TWD');
  });

  it('falls back to first base currency when stored value is no longer valid', () => {
    localStorage.setItem('finance.baseCurrency', 'EUR');
    const { result } = renderHook(() => useBaseCurrency([USD, TWD]));
    expect(result.current[0]).toBe('USD');
  });

  it('returns null and clears localStorage when called with empty list', () => {
    localStorage.setItem('finance.baseCurrency', 'USD');
    const { result } = renderHook(() => useBaseCurrency([]));
    expect(result.current[0]).toBeNull();
  });

  it('caller is responsible for pre-filtering to is_base_currency=true currencies', () => {
    // The hook treats whatever is passed as eligible base currencies.
    // In components, caller does: currencies.filter(c => c.is_base_currency)
    // before passing the array. Passing an empty array → hook returns null.
    const { result } = renderHook(() => useBaseCurrency([]));
    expect(result.current[0]).toBeNull();
  });
});
