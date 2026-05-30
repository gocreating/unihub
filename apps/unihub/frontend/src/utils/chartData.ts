/**
 * Chart data transformation utilities.
 *
 * Extracted from the balance-sheets chart components so they can be unit-tested
 * independently of the ECharts rendering layer.
 */

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
