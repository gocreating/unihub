/**
 * Pure data + ECharts option builders for the portfolio visualisations
 * (FR-029). Kept beside the component rather than inside it so they can be
 * unit-tested directly — the OPTION is the thing worth asserting — and so the
 * component file exports only a component (react-refresh).
 *
 * Both charts plot **Value Change only**: asset amounts cannot share an axis
 * (419 shares vs 0.000000067 of a token), while Value Change is the
 * portfolio's base currency throughout. Transfers without a Value Change (the
 * position-only legs) are excluded by construction.
 */
import type { EChartsOption } from 'echarts';
import Decimal from 'decimal.js';
import type { Transaction } from '@/services/unihub-backend/finance';

export interface WaterfallStep {
  label: string;
  delta: number;
  /** Running total AFTER this step — the top of the floating bar. */
  cumulative: number;
}

/** Net Value Change per transaction, oldest first, with a running total. */
export function waterfallSteps(transactions: readonly Transaction[]): WaterfallStep[] {
  const valued = transactions
    .map((txn) => ({
      txn,
      delta: txn.transfers
        .filter((tr) => tr.value_change != null)
        .reduce((sum, tr) => sum.plus(new Decimal(tr.value_change as string)), new Decimal(0)),
      hasValue: txn.transfers.some((tr) => tr.value_change != null),
    }))
    .filter((r) => r.hasValue)
    .sort((a, b) => a.txn.timestamp.localeCompare(b.txn.timestamp));

  let running = new Decimal(0);
  return valued.map(({ txn, delta }) => {
    running = running.plus(delta);
    return {
      label: txn.timestamp.slice(0, 10),
      delta: delta.toNumber(),
      cumulative: running.toNumber(),
    };
  });
}

/** Summed Value Change per asset, largest magnitude first. */
export function breakdownByAsset(transactions: readonly Transaction[]): { asset: string; value: number }[] {
  const totals = new Map<string, Decimal>();
  for (const txn of transactions) {
    for (const tr of txn.transfers) {
      if (tr.value_change == null) continue;
      const prev = totals.get(tr.asset_name) ?? new Decimal(0);
      totals.set(tr.asset_name, prev.plus(new Decimal(tr.value_change)));
    }
  }
  return [...totals.entries()]
    .map(([asset, total]) => ({ asset, value: total.toNumber() }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/**
 * ECharts waterfall = an invisible "base" bar carrying each step up to where
 * its visible delta begins, with the delta stacked on top.
 */
export function waterfallOption(steps: readonly WaterfallStep[], currency: string): EChartsOption {
  const bases = steps.map((s) => Math.min(s.cumulative - s.delta, s.cumulative));
  const deltas = steps.map((s) => Math.abs(s.delta));
  return {
    color: ['transparent', '#3f8600', '#cf1322'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 72, right: 24, top: 24, bottom: 56 },
    xAxis: { type: 'category', data: steps.map((s) => s.label), axisLabel: { rotate: 45 } },
    yAxis: { type: 'value', name: currency },
    series: [
      { name: 'base', type: 'bar', stack: 'wf', silent: true, itemStyle: { color: 'transparent' }, data: bases },
      {
        name: currency,
        type: 'bar',
        stack: 'wf',
        data: steps.map((s, i) => ({
          value: deltas[i],
          itemStyle: { color: s.delta >= 0 ? '#3f8600' : '#cf1322' },
        })),
      },
    ],
  };
}

export function breakdownOption(
  rows: readonly { asset: string; value: number }[],
  currency: string,
): EChartsOption {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 72, right: 24, top: 24, bottom: 56 },
    xAxis: { type: 'category', data: rows.map((r) => r.asset), axisLabel: { rotate: 45 } },
    yAxis: { type: 'value', name: currency },
    series: [
      {
        name: currency,
        type: 'bar',
        data: rows.map((r) => ({
          value: r.value,
          itemStyle: { color: r.value >= 0 ? '#3f8600' : '#cf1322' },
        })),
      },
    ],
  };
}

