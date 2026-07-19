import dayjs from 'dayjs';
import type { AcquisitionSummary, NetCostEntry } from '@/services/unihub-backend/inventory';
import { formatPrice } from '@/utils/currency';

/** Per-currency net cost text; a zero net cost is hidden entirely (iter 15).
 * Entries render "{CODE} {symbol} {value}" (FR-033). */
export function formatNetCost(net: NetCostEntry[] | undefined): string {
  // Most zeros mean "not recorded", so neither "0"/"0 CNY" nor "Free" shows.
  return (net ?? [])
    .map((n) => formatPrice(n.currency, n.total))
    .filter(Boolean)
    .join(', ');
}

/**
 * Both display lines of an acquisition summary (FR-003a): primary
 * "{source} {net cost}", secondary date range with the four exact cases.
 */
export function acquisitionSummaryLines(
  a: Pick<AcquisitionSummary, 'source' | 'request_time' | 'obtained_at' | 'net_cost'>,
  untitled: string,
): { primary: string; secondary: string | null } {
  const primary = `${a.source || untitled} ${formatNetCost(a.net_cost)}`.trim();
  const req = a.request_time ? dayjs(a.request_time).format('YYYY-MM-DD') : null;
  const obt = a.obtained_at ? dayjs(a.obtained_at).format('YYYY-MM-DD') : null;
  // Four exact cases (iteration 15): both, requested-only, obtained-only, none.
  const secondary = req && obt ? `${req} ~ ${obt}` : req ? `${req} ~` : obt ? obt : null;
  return { primary, secondary };
}
