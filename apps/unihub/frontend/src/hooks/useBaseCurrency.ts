import { useEffect, useState } from 'react';
import type { Currency } from '@/services/unihub-backend/finance';

const STORAGE_KEY = 'finance.baseCurrency';

/**
 * Manages the selected base currency for net worth valuation.
 * Persists the selection in localStorage. Auto-selects the first eligible
 * currency when the stored value is invalid or absent.
 */
export function useBaseCurrency(
  baseCurrencies: Currency[],
): [string | null, (code: string | null) => void] {
  const [baseCurrency, setBaseCurrencyState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (baseCurrencies.length === 0) {
      setBaseCurrencyState(null);
      return;
    }
    const validCodes = baseCurrencies.map((c) => c.code);
    if (!baseCurrency || !validCodes.includes(baseCurrency)) {
      const first = validCodes[0] ?? null;
      if (first) localStorage.setItem(STORAGE_KEY, first);
      setBaseCurrencyState(first);
    }
  }, [baseCurrencies, baseCurrency]);

  const setBaseCurrency = (code: string | null) => {
    if (code) {
      localStorage.setItem(STORAGE_KEY, code);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setBaseCurrencyState(code);
  };

  return [baseCurrency, setBaseCurrency];
}
