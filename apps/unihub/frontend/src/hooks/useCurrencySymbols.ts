import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listCurrencies } from '@/services/unihub-backend/finance';
import { setCurrencySymbols } from '@/utils/currency';

/**
 * Reactive currency-symbol source (FR-033, iteration 34): subscribes to the
 * shared finance currencies query, seeds the module registry SYNCHRONOUSLY
 * during render (so `formatPrice` calls in the same render already see it),
 * and returns the map for memo dependencies. Every price-rendering surface
 * calls this so late-arriving symbols re-render (and re-measure) correctly.
 */
export function useCurrencySymbols(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });
  const map = useMemo(
    () =>
      Object.fromEntries(
        (data?.results ?? []).map((c) => [c.code.toUpperCase(), c.symbol ?? '']),
      ),
    [data],
  );
  // Idempotent module-registry write — deliberate render-time seeding so the
  // current render pass (not just the next one) formats with real symbols.
  if (Object.keys(map).length > 0) setCurrencySymbols(map);
  return map;
}
