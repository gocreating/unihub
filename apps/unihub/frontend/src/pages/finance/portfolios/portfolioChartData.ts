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
 * Cost/income are the portfolio's base currency; position is a quantity of
 * assets. They cannot share a scale (419 shares vs 0.000000067 of a token), so
 * position gets its own right-hand axis.
 */
import type { EChartsOption } from 'echarts';
import Decimal from 'decimal.js';
import type { Transaction } from '@/services/unihub-backend/finance';
import { COST_COLOR, INCOME_COLOR, NEUTRAL_COLOR, formatMoney, moneyFormatter } from '@/components/Price';

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
  /** Net asset quantity change, signed. */
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

/** FR-043 — per-transaction cost / income / position, oldest first. */
export function trendPoints(transactions: readonly Transaction[]): TrendPoint[] {
  return chronological(transactions).map((txn) => {
    let cost = new Decimal(0);
    let income = new Decimal(0);
    let position = new Decimal(0);
    for (const tr of txn.transfers) {
      if (tr.pnl_change != null) {
        const v = new Decimal(tr.pnl_change);
        if (v.isNegative()) cost = cost.plus(v);
        else income = income.plus(v);
      }
      if (tr.asset_change_amount != null) {
        position = position.plus(new Decimal(tr.asset_change_amount));
      }
    }
    return {
      label: txn.timestamp.slice(0, 10),
      cost: cost.toNumber(),
      income: income.toNumber(),
      position: position.toNumber(),
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
): EChartsOption {
  const money = moneyFormatter(currency);
  const values = points.map((p) => p.value);
  const maxAbs = values.length > 0 ? Math.max(...values.map(Math.abs), 1) : 1;
  const SHARP_BICOLOR = [...Array(50).fill(COST_COLOR), ...Array(50).fill(INCOME_COLOR)];

  return {
    tooltip: {
      trigger: 'axis',
      confine: true,
      valueFormatter: (v) => money(Number(v)),
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
        name: 'PnL',
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
  yAxisIndex: number,
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
      yAxisIndex,
      silent: true,
      itemStyle: { color: 'transparent' },
      tooltip: { show: false },
      data: bases,
    },
    {
      name,
      type: 'bar' as const,
      stack,
      yAxisIndex,
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

  const series =
    mode === 'waterfall'
      ? [
          ...floatingSeries(labels.cost, COST_COLOR, points.map((p) => p.cost), 'cost', 0),
          ...floatingSeries(labels.income, INCOME_COLOR, points.map((p) => p.income), 'income', 0),
          ...floatingSeries(labels.position, NEUTRAL_COLOR, points.map((p) => p.position), 'position', 1),
        ]
      : [
          { name: labels.cost, type: 'bar' as const, yAxisIndex: 0, itemStyle: { color: COST_COLOR }, data: points.map((p) => p.cost) },
          { name: labels.income, type: 'bar' as const, yAxisIndex: 0, itemStyle: { color: INCOME_COLOR }, data: points.map((p) => p.income) },
          { name: labels.position, type: 'bar' as const, yAxisIndex: 1, itemStyle: { color: NEUTRAL_COLOR }, data: points.map((p) => p.position) },
        ];

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
    grid: { left: 88, right: 72, top: 24, bottom: 64 },
    xAxis: { type: 'category', data: categories, axisLabel: { rotate: 45 } },
    yAxis: [
      { type: 'value', axisLabel: { formatter: money } },
      // Quantities, not money — the same normalizer without a currency.
      { type: 'value', axisLabel: { formatter: (v: number) => formatMoney(v) } },
    ],
    series,
  };
}
