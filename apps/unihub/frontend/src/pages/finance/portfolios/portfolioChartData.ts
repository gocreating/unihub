/**
 * Pure data + ECharts option builders for the portfolio value panel
 * (FR-040…FR-043). Kept beside the component rather than inside it so they can
 * be unit-tested directly — the OPTION is the thing worth asserting — and so
 * the component file exports only components (react-refresh).
 *
 * Two views over the same transactions:
 *
 *  - **PnL** (FR-042): a cumulative line, in the style of the Balance Sheets
 *    equity curve. Its LAST point is the portfolio's PnL to date, which is the
 *    number the panel header states, so the chart and the figure can never
 *    disagree.
 *  - **Trend** (FR-043): one x-axis point per transaction carrying three
 *    y-values — cost, income and position. Negatives extend DOWNWARD; nothing
 *    is absolute-valued, because a chart that hides the sign of a cost is
 *    worse than no chart. A Waterfall toggle floats each series on its own
 *    running total instead of plotting bare deltas.
 *
 * All three are the portfolio's base currency (FR-055, research I9-5):
 * **position is the money mirror of the cash flow**, `−(cost + income)` — what
 * left as cost entered the position, what came back as income left it. The
 * earlier series summed asset QUANTITIES across whichever assets a transaction
 * touched, which is meaningless across units and plotted a negative grey bar
 * for 119 of the 359 real transactions (paying 1,579 PT-sUSDE for 1,256 DAI
 * nets "−323"). One unit means one axis.
 *
 * Tooltips come from the shared builder (FR-053) and read the SIGNED point by
 * `dataIndex`, so the waterfall's absolute bar heights never leak into text.
 */
import type { EChartsOption } from 'echarts';
import Decimal from 'decimal.js';
import type { Transaction } from '@/services/unihub-backend/finance';
import {
  COST_COLOR,
  INCOME_COLOR,
  NEUTRAL_COLOR,
  chartTooltipHtml,
  formatMoney,
  moneyFormatter,
  pinnedAxisTooltip,
  seriesMarker,
} from '@/components/Price';

export type TrendMode = 'bar' | 'waterfall';

export interface PnlPoint {
  /** Epoch ms — the PnL chart uses a time axis, like the equity curve. */
  time: number;
  label: string;
  /** Cumulative PnL after this transaction. */
  value: number;
}

export interface TrendPoint {
  label: string;
  /** Sum of NEGATIVE pnl_change — always ≤ 0, plotted downward. */
  cost: number;
  /** Sum of POSITIVE pnl_change — always ≥ 0. */
  income: number;
  /** Base-currency value moved INTO (+) or OUT OF (−) positions: −(cost + income). */
  position: number;
}

/** Oldest first. Transactions arrive in the table's sort order, not time order. */
function chronological(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * FR-042 — cumulative PnL, one point per transaction that moves it.
 *
 * Position-only transactions (a stock split, an `UPDATE_POSITION` leg) do not
 * change PnL, so they contribute no point: a flat step would imply the
 * portfolio was measured that day when nothing about its PnL was.
 */
export function pnlPoints(transactions: readonly Transaction[]): PnlPoint[] {
  let running = new Decimal(0);
  const out: PnlPoint[] = [];
  for (const txn of chronological(transactions)) {
    const delta = txn.transfers
      .filter((tr) => tr.pnl_change != null)
      .reduce((sum, tr) => sum.plus(new Decimal(tr.pnl_change as string)), new Decimal(0));
    if (txn.transfers.every((tr) => tr.pnl_change == null)) continue;
    running = running.plus(delta);
    out.push({
      time: new Date(txn.timestamp).getTime(),
      label: txn.timestamp.slice(0, 10),
      value: running.toNumber(),
    });
  }
  return out;
}

/** FR-043 / FR-055 — per-transaction cost / income / position, oldest first. */
export function trendPoints(transactions: readonly Transaction[]): TrendPoint[] {
  return chronological(transactions).map((txn) => {
    let cost = new Decimal(0);
    let income = new Decimal(0);
    for (const tr of txn.transfers) {
      if (tr.pnl_change != null) {
        const v = new Decimal(tr.pnl_change);
        if (v.isNegative()) cost = cost.plus(v);
        else income = income.plus(v);
      }
    }
    // Double-entry: the position moves by exactly what the cash did, negated.
    // (`Decimal(0).negated()` is −0; a bar at −0 is a bar at 0.)
    const position = cost.plus(income).negated();
    return {
      label: txn.timestamp.slice(0, 10),
      cost: cost.toNumber(),
      income: income.toNumber(),
      position: position.isZero() ? 0 : position.toNumber(),
    };
  });
}

export interface MoneyAxisLabels {
  currency: string;
}

/**
 * FR-042 — the equity-curve treatment: an area line that reads red below zero
 * and green above it.
 *
 * The bicolor trick is the Balance Sheets one: `visualMap.continuous` with 50
 * identical reds followed by 50 identical greens over a symmetric range makes
 * the transition imperceptibly thin, so the colour flips exactly at y = 0.
 * (`visualMap.piecewise` crashes in ECharts 6.1.0.)
 */
export function pnlLineOption(
  points: readonly PnlPoint[],
  { currency }: MoneyAxisLabels,
  label = 'PnL',
): EChartsOption {
  const money = moneyFormatter(currency);
  const values = points.map((p) => p.value);
  const maxAbs = values.length > 0 ? Math.max(...values.map(Math.abs), 1) : 1;
  const SHARP_BICOLOR = [...Array(50).fill(COST_COLOR), ...Array(50).fill(INCOME_COLOR)];

  return {
    tooltip: {
      ...pinnedAxisTooltip(320),
      formatter: (raw) => {
        const params = raw as unknown as { value: [number, number] }[];
        const p = params[0];
        if (!p) return '';
        const [ts, v] = p.value;
        const title = points.find((pt) => pt.time === ts)?.label ?? new Date(ts).toISOString().slice(0, 10);
        return chartTooltipHtml(title, [
          {
            marker: seriesMarker(v >= 0 ? INCOME_COLOR : COST_COLOR),
            name: label,
            value: formatMoney(v, { currency, signed: true }),
          },
        ]);
      },
    },
    grid: { left: 88, right: 24, top: 24, bottom: 48 },
    xAxis: { type: 'time' },
    yAxis: {
      type: 'value',
      min: -maxAbs,
      max: maxAbs,
      axisLabel: { formatter: money },
    },
    visualMap: {
      show: false,
      type: 'continuous',
      dimension: 1,
      min: -maxAbs,
      max: maxAbs,
      inRange: { color: SHARP_BICOLOR },
    },
    series: [
      {
        name: label,
        type: 'line',
        showSymbol: points.length <= 60,
        symbolSize: 5,
        areaStyle: { opacity: 0.12 },
        data: points.map((p) => [p.time, p.value] as [number, number]),
      },
    ],
  };
}

/**
 * ECharts waterfall = an invisible base bar carrying each step up to where its
 * visible delta begins, with the delta stacked on top. Each of the three
 * series floats on its OWN running total, so the toggle turns three delta
 * series into three accumulations without changing what any bar means.
 */
function floatingSeries(
  name: string,
  color: string,
  deltas: readonly number[],
  stack: string,
) {
  const bases: number[] = [];
  const heights: number[] = [];
  let running = 0;
  for (const d of deltas) {
    const next = running + d;
    bases.push(Math.min(running, next));
    heights.push(Math.abs(d));
    running = next;
  }
  return [
    {
      name: `${name}-base`,
      type: 'bar' as const,
      stack,
      silent: true,
      itemStyle: { color: 'transparent' },
      tooltip: { show: false },
      data: bases,
    },
    {
      name,
      type: 'bar' as const,
      stack,
      itemStyle: { color },
      data: heights,
    },
  ];
}

/**
 * FR-043 — three y-values per transaction. In `bar` mode each series plots its
 * signed delta directly, so a cost of −1000 draws a red bar 1000 tall growing
 * DOWN from the axis. In `waterfall` mode each series floats on its own
 * running total.
 */
export function trendOption(
  points: readonly TrendPoint[],
  mode: TrendMode,
  { currency }: MoneyAxisLabels,
  labels: { cost: string; income: string; position: string },
): EChartsOption {
  const categories = points.map((p) => p.label);
  const money = moneyFormatter(currency);
  const signed = (v: number) => formatMoney(v, { currency, signed: true });

  const series =
    mode === 'waterfall'
      ? [
          ...floatingSeries(labels.cost, COST_COLOR, points.map((p) => p.cost), 'cost'),
          ...floatingSeries(labels.income, INCOME_COLOR, points.map((p) => p.income), 'income'),
          ...floatingSeries(labels.position, NEUTRAL_COLOR, points.map((p) => p.position), 'position'),
        ]
      : [
          { name: labels.cost, type: 'bar' as const, itemStyle: { color: COST_COLOR }, data: points.map((p) => p.cost) },
          { name: labels.income, type: 'bar' as const, itemStyle: { color: INCOME_COLOR }, data: points.map((p) => p.income) },
          { name: labels.position, type: 'bar' as const, itemStyle: { color: NEUTRAL_COLOR }, data: points.map((p) => p.position) },
        ];

  return {
    tooltip: {
      ...pinnedAxisTooltip(320),
      axisPointer: { type: 'shadow', animation: false },
      // Read the SIGNED point, not the series value: in waterfall mode the
      // series carry absolute heights on transparent bases.
      formatter: (raw) => {
        const params = raw as unknown as { dataIndex: number }[];
        const i = params[0]?.dataIndex;
        const p = i == null ? undefined : points[i];
        if (!p) return '';
        const rows: [string, number, string][] = [
          [labels.cost, p.cost, COST_COLOR],
          [labels.income, p.income, INCOME_COLOR],
          [labels.position, p.position, NEUTRAL_COLOR],
        ];
        return chartTooltipHtml(
          p.label,
          rows
            .filter(([, v]) => v !== 0)
            .map(([name, v, color]) => ({ marker: seriesMarker(color), name, value: signed(v) })),
        );
      },
    },
    grid: { left: 88, right: 24, top: 24, bottom: 64 },
    xAxis: { type: 'category', data: categories, axisLabel: { rotate: 45 } },
    // ONE axis: cost, income and position are all money now (FR-055).
    yAxis: { type: 'value', axisLabel: { formatter: money } },
    series,
  };
}
