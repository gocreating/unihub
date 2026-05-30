/**
 * Chart data transformation utilities.
 *
 * Extracted from the balance-sheets chart components so they can be unit-tested
 * independently of the ECharts rendering layer.
 */

// 36-color palette: maximally distinct hues at varying lightness/saturation.
// Shared between the balance-breakdown chart series and the auto-assign fallback.
export const ECHARTS_COLORS = [
  '#e6194b', '#f58231', '#ffe119', '#3cb44b', '#42d4f4',
  '#4363d8', '#911eb4', '#f032e6', '#ff8c00', '#00b300',
  '#0099cc', '#cc00cc', '#800000', '#9a6324', '#808000',
  '#006400', '#008080', '#000080', '#4b0082', '#800080',
  '#ff6347', '#ffd700', '#7fff00', '#20b2aa', '#1e90ff',
  '#6a5acd', '#ff69b4', '#dc143c', '#8b4513', '#d2691e',
  '#a0522d', '#556b2f', '#2e8b57', '#4682b4', '#708090',
  '#b8860b',
] as const;

/**
 * Deterministic color resolver for accounts.
 *
 * Returns the account's custom color when set; otherwise selects a color from
 * ECHARTS_COLORS by hashing the account name. The same name always resolves to
 * the same color regardless of list ordering — avoids flicker when accounts
 * are added, removed, or reordered.
 */
export function resolveAccountColor(accountName: string, customColor?: string): string {
  if (customColor) return customColor;
  let h = 0;
  for (let i = 0; i < accountName.length; i++) {
    h = (Math.imul(31, h) + accountName.charCodeAt(i)) | 0;
  }
  return ECHARTS_COLORS[Math.abs(h) % ECHARTS_COLORS.length]!;
}

/**
 * Builds two time-series (positive/negative) for a net worth trend chart by
 * interpolating the exact zero-crossing timestamp between consecutive data
 * points with different signs.
 *
 * Both series share a single [crossingTimestamp, 0] data point at each sign
 * change, so they visually join at y=0 with NO overlapping x-ranges. This
 * is the correct approach for per-segment green/red coloring on a time axis.
 *
 * @returns positiveData / negativeData — arrays of [timestamp, value] pairs
 *   sorted by timestamp, ready for ECharts `xAxis.type: 'time'`.
 */
export function buildNetWorthWithCrossings(
  netWorthData: { date: string; netWorth: number }[],
): {
  positiveData: [number, number][];
  negativeData: [number, number][];
} {
  const positiveData: [number, number][] = [];
  const negativeData: [number, number][] = [];

  for (let i = 0; i < netWorthData.length; i++) {
    const d = netWorthData[i]!;
    const ts = new Date(d.date).getTime();

    if (d.netWorth >= 0) {
      positiveData.push([ts, d.netWorth]);
    } else {
      negativeData.push([ts, d.netWorth]);
    }

    // Interpolate zero-crossing point between this data point and the next.
    if (i < netWorthData.length - 1) {
      const next = netWorthData[i + 1]!;
      const differentSign = d.netWorth >= 0 !== next.netWorth >= 0;
      if (differentSign) {
        const nextTs = new Date(next.date).getTime();
        // Linear interpolation: fraction of the way from d to next where y=0.
        const frac = Math.abs(d.netWorth) / (Math.abs(d.netWorth) + Math.abs(next.netWorth));
        const crossTs = Math.round(ts + (nextTs - ts) * frac);
        positiveData.push([crossTs, 0]);
        negativeData.push([crossTs, 0]);
      }
    }
  }

  positiveData.sort((a, b) => a[0] - b[0]);
  negativeData.sort((a, b) => a[0] - b[0]);

  return { positiveData, negativeData };
}

/**
 * Splits a net worth value series into a green (≥0) subseries and a red (<0)
 * subseries for two-series line chart coloring.
 *
 * Both subseries share a `0` value at sign-change boundaries so the rendered
 * line appears continuous even though it is drawn by two separate ECharts series.
 *
 * @example
 * computeGreenRedSeries([100, -50, 200])
 * // greenVals: [100, 0, 200]  — 0 at i=1 because adjacent to positives
 * // redVals:   [0, -50, 0]   — 0 at i=0 and i=2 because adjacent to negative
 */
export function computeGreenRedSeries(values: number[]): {
  greenVals: (number | null)[];
  redVals: (number | null)[];
} {
  const greenVals: (number | null)[] = values.map((v, i) => {
    if (v >= 0) return v;
    const adj = [values[i - 1], values[i + 1]];
    return adj.some((a) => a !== undefined && a >= 0) ? 0 : null;
  });
  const redVals: (number | null)[] = values.map((v, i) => {
    if (v < 0) return v;
    const adj = [values[i - 1], values[i + 1]];
    return adj.some((a) => a !== undefined && a < 0) ? 0 : null;
  });
  return { greenVals, redVals };
}

/**
 * Classifies each account into a stacking group based on the sign of its
 * net total amount across all dates.
 *
 * - Positive net total (≥0) → `'assets'`
 * - Negative net total (<0)  → `'debts'`
 *
 * This is used to create two independent ECharts stacked-area groups so that
 * asset areas stack upward and debt areas stack downward without overlapping.
 */
export function classifyAccountStacks(
  stackedData: { accountName: string; amount: number }[],
  accounts: string[],
): Map<string, 'assets' | 'debts'> {
  const totals = new Map<string, number>();
  for (const d of stackedData) {
    totals.set(d.accountName, (totals.get(d.accountName) ?? 0) + d.amount);
  }
  const result = new Map<string, 'assets' | 'debts'>();
  for (const acc of accounts) {
    result.set(acc, (totals.get(acc) ?? 0) >= 0 ? 'assets' : 'debts');
  }
  return result;
}
