import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enUS from '@/locales/en-US';
import { PortfolioValuePanel } from './PortfolioValuePanel';
import {
  pnlLineOption,
  pnlPoints,
  trendOption,
  trendPoints,
} from './portfolioChartData';
import { COST_COLOR, INCOME_COLOR, NEUTRAL_COLOR } from '@/components/Price';
import { setCurrencySymbols } from '@/utils/currency';
import type { Portfolio, Transaction } from '@/services/unihub-backend/finance';

beforeEach(() => {
  setCurrencySymbols({ TWD: 'NT$' });
});

// Capture the ECharts option instead of rendering a chart (jsdom has no canvas
// and, more importantly, the OPTION is what we actually want to assert).
const optionSpy = vi.fn();
vi.mock('echarts-for-react', () => ({
  default: (props: { option: unknown }) => {
    optionSpy(props.option);
    return <div data-testid="echart" />;
  },
}));

/** transfers: [pnlChange, assetChangeAmount] */
function txn(id: string, timestamp: string, transfers: [string | null, string | null][]): Transaction {
  return {
    id,
    portfolio: 'p1',
    portfolio_name: 'P',
    timestamp,
    description: id,
    chain_id: '',
    tx_hash: '',
    created_at: timestamp,
    updated_at: timestamp,
    transfers: transfers.map(([pnl_change, asset_change_amount], i) => ({
      id: `${id}-${i}`,
      pnl_change,
      currency: asset_change_amount == null ? 'TWD' : null,
      currency_symbol: asset_change_amount == null ? 'NT$' : null,
      currency_amount: asset_change_amount == null ? pnl_change : null,
      asset: asset_change_amount == null ? null : `a${i}`,
      asset_name: asset_change_amount == null ? null : '0050.TW',
      asset_change_amount,
      created_at: timestamp,
      updated_at: timestamp,
    })),
  } as unknown as Transaction;
}

// Deliberately out of chronological order — both builders must sort.
const TXNS: Transaction[] = [
  txn('t2', '2026-02-01T00:00:00Z', [['500', null], [null, '10']]),
  txn('t1', '2026-01-01T00:00:00Z', [['-1000', null]]),
  txn('t3', '2026-03-01T00:00:00Z', [['-250', null], ['-250', null]]),
];

describe('pnlPoints (FR-042)', () => {
  it('accumulates PnL in chronological order', () => {
    expect(pnlPoints(TXNS).map((p) => [p.label, p.value])).toEqual([
      ['2026-01-01', -1000],
      ['2026-02-01', -500],
      ['2026-03-01', -1000],
    ]);
  });

  it('ends at the portfolio PnL — the figure the panel prints', () => {
    const points = pnlPoints(TXNS);
    expect(points.at(-1)!.value).toBe(-1000);
  });

  it('contributes no point for a position-only transaction (a stock split)', () => {
    const split = txn('split', '2026-04-01T00:00:00Z', [[null, '419']]);
    expect(pnlPoints([...TXNS, split])).toHaveLength(3);
  });

  it('sums at full precision, never in float', () => {
    const wei = txn('w', '2026-01-01T00:00:00Z', [
      ['-0.000000067305900768', null],
      ['-1.000000000000000000', null],
    ]);
    expect(pnlPoints([wei])[0]!.value).toBeCloseTo(-1.000000067305901, 12);
  });
});

describe('trendPoints (FR-043 / FR-055)', () => {
  it('splits each transaction into cost, income and position — position being the money mirror of the cash flow', () => {
    // I9-5: position = −(cost + income). What left as cost entered the
    // position; what came back as income left it. Asset QUANTITIES are not
    // summed — they cannot be, across assets.
    expect(trendPoints(TXNS)).toEqual([
      { label: '2026-01-01', cost: -1000, income: 0, position: 1000 },
      { label: '2026-02-01', cost: 0, income: 500, position: -500 },
      { label: '2026-03-01', cost: -500, income: 0, position: 500 },
    ]);
  });

  it('plots a POSITIVE position bar for every cost-only transaction (SC-024)', () => {
    // The shipped series summed raw quantities across assets and plotted a
    // negative bar for 119 of the 359 real transactions — e.g. paying 1,579
    // PT-sUSDE for 1,256 DAI. In money the same transaction is +cost.
    const swap = txn('swap', '2026-05-01T00:00:00Z', [['-1579', '-1579'], [null, '1256']]);
    const [p] = trendPoints([swap]);
    expect(p!.cost).toBe(-1579);
    expect(p!.position).toBe(1579);
    expect(p!.position).toBe(-(p!.cost + p!.income));
  });

  it('gives a position-only transfer (a split) zero position movement — no cash moved', () => {
    const split = txn('split', '2026-04-01T00:00:00Z', [[null, '419']]);
    expect(trendPoints([split])[0]!.position).toBe(0);
  });

  it('keeps costs NEGATIVE so the bar grows downward', () => {
    // The defect this pins: an absolute-valued cost draws upward and reads as
    // income. Every cost must stay ≤ 0.
    for (const p of trendPoints(TXNS)) expect(p.cost).toBeLessThanOrEqual(0);
    expect(trendPoints(TXNS)[0]!.cost).toBe(-1000);
  });

  it('gives every transaction an x-axis point, valued or not', () => {
    const split = txn('split', '2026-04-01T00:00:00Z', [[null, '419']]);
    expect(trendPoints([...TXNS, split])).toHaveLength(4);
  });
});

describe('trendOption (FR-041/FR-043)', () => {
  const labels = { cost: 'Cost', income: 'Income', position: 'Position' };
  const axis = { currency: 'TWD' };

  it('paints cost red, income green and position grey', () => {
    const opt = trendOption(trendPoints(TXNS), 'bar', axis, labels);
    const series = opt.series as { name: string; itemStyle: { color: string } }[];
    expect(series.map((s) => [s.name, s.itemStyle.color])).toEqual([
      ['Cost', COST_COLOR],
      ['Income', INCOME_COLOR],
      ['Position', NEUTRAL_COLOR],
    ]);
  });

  it('plots signed values in bar mode — no absolute value anywhere', () => {
    const opt = trendOption(trendPoints(TXNS), 'bar', axis, labels);
    const cost = (opt.series as { data: number[] }[])[0]!;
    expect(cost.data).toEqual([-1000, 0, -500]);
  });

  it('floats each series on its own running total in waterfall mode', () => {
    const opt = trendOption(trendPoints(TXNS), 'waterfall', axis, labels);
    const series = opt.series as { name: string; stack: string; data: number[] }[];
    // Three series become six: an invisible base + a visible height each.
    expect(series).toHaveLength(6);
    expect(series[0]!.name).toBe('Cost-base');
    expect(series[0]!.stack).toBe(series[1]!.stack);
    // Cost runs 0 → −1000 → −1000 → −1500: the third bar's base is −1500
    // (the lower of −1000 and −1500) and its height is 500.
    expect(series[0]!.data[2]).toBe(-1500);
    expect(series[1]!.data[2]).toBe(500);
  });

  it('plots all three series on ONE money axis — position is money now (FR-055)', () => {
    const opt = trendOption(trendPoints(TXNS), 'bar', axis, labels);
    expect(Array.isArray(opt.yAxis)).toBe(false);
    const series = opt.series as { name: string; yAxisIndex?: number }[];
    for (const s of series) expect(s.yAxisIndex ?? 0).toBe(0);
  });

  it('labels the money axis with the currency symbol (FR-041)', () => {
    const opt = trendOption(trendPoints(TXNS), 'bar', axis, labels);
    const money = opt.yAxis as { axisLabel: { formatter: (v: number) => string } };
    expect(money.axisLabel.formatter(1234)).toBe('NT$ 1,234');
  });

  it('falls back to the currency code when no symbol is known', () => {
    const opt = trendOption(trendPoints(TXNS), 'bar', { currency: 'XYZ' }, labels);
    const money = opt.yAxis as { axisLabel: { formatter: (v: number) => string } };
    expect(money.axisLabel.formatter(7)).toBe('XYZ 7');
  });

  // FR-053 / SC-026: the shared tooltip — bold date, one row per series, values
  // through the normalizers, pinned to the axis instead of the cursor.
  type Tip = {
    trigger: string;
    appendToBody: boolean;
    position: unknown;
    formatter: (params: unknown) => string;
  };
  const paramsFor = (dataIndex: number) =>
    ['Cost', 'Income', 'Position'].map((seriesName) => ({ seriesName, dataIndex, marker: '' }));

  it('formats the tooltip as the shared builder does, with signed money values', () => {
    const tip = trendOption(trendPoints(TXNS), 'bar', axis, labels).tooltip as Tip;
    expect(tip.trigger).toBe('axis');
    expect(tip.appendToBody).toBe(true);
    expect(typeof tip.position).toBe('function');
    const html = tip.formatter(paramsFor(0));
    expect(html.startsWith('<b>2026-01-01</b>')).toBe(true);
    expect(html).toContain('Cost');
    expect(html).toContain('− NT$ 1,000');
    expect(html).toContain('Position');
    expect(html).toContain('+ NT$ 1,000');
    // A zero series is noise in a tooltip — omitted, like the balance-sheets stack.
    expect(html).not.toContain('Income');
  });

  it('shows the SIGNED deltas in waterfall mode too — never the bar heights', () => {
    // Waterfall bars are absolute heights on transparent bases; the tooltip
    // must read the point set by dataIndex, so a cost stays negative.
    const tip = trendOption(trendPoints(TXNS), 'waterfall', axis, labels).tooltip as Tip;
    const html = tip.formatter([{ seriesName: 'Cost', dataIndex: 2, marker: '' }]);
    expect(html.startsWith('<b>2026-03-01</b>')).toBe(true);
    expect(html).toContain('− NT$ 500');
    expect(html).toContain('+ NT$ 500');
    expect(html).not.toContain('NT$ 1,500');
  });
});

describe('pnlLineOption (FR-042)', () => {
  it('is a line on a time axis, like the equity curve', () => {
    const opt = pnlLineOption(pnlPoints(TXNS), { currency: 'TWD' });
    const series = opt.series as { type: string; data: [number, number][] }[];
    expect(series[0]!.type).toBe('line');
    expect((opt.xAxis as { type: string }).type).toBe('time');
    expect(series[0]!.data.at(-1)![1]).toBe(-1000);
  });

  it('colours the curve red below zero and green above it', () => {
    const opt = pnlLineOption(pnlPoints(TXNS), { currency: 'TWD' });
    const vm = opt.visualMap as { inRange: { color: string[] } };
    expect(vm.inRange.color[0]).toBe(COST_COLOR);
    expect(vm.inRange.color.at(-1)).toBe(INCOME_COLOR);
  });

  it('formats the tooltip as the shared builder does — date title, one signed PnL row (FR-053)', () => {
    const opt = pnlLineOption(pnlPoints(TXNS), { currency: 'TWD' }, 'PnL');
    const tip = opt.tooltip as {
      trigger: string; appendToBody: boolean; position: unknown; formatter: (p: unknown) => string;
    };
    expect(tip.trigger).toBe('axis');
    expect(tip.appendToBody).toBe(true);
    expect(typeof tip.position).toBe('function');
    const html = tip.formatter([{ value: [Date.UTC(2026, 0, 1), -1000] }]);
    expect(html.startsWith('<b>2026-01-01</b>')).toBe(true);
    expect(html).toContain('PnL');
    expect(html).toContain('− NT$ 1,000');
    expect(html).toContain('tabular-nums');
  });
});

const PORTFOLIO = {
  id: 'p1',
  name: 'DCA',
  description: '',
  base_currency: 'TWD',
  state: 'active',
  net_value_change: '-1000.000000000000000000',
  value_invested: '-1500',
  value_returned: '500',
  first_transaction_time: '2026-01-01T00:00:00Z',
  last_transaction_time: '2026-03-01T00:00:00Z',
} as unknown as Portfolio;

function renderPanel(portfolio: Portfolio = PORTFOLIO) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IntlProvider locale="en-US" messages={enUS}>
        <PortfolioValuePanel portfolio={portfolio} transactions={TXNS} />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('PortfolioValuePanel (FR-040)', () => {
  it('is ONE card with exactly two tabs: PnL and Trend', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((el) => el.textContent)).toEqual(['PnL', 'Trend']);
  });

  // FR-054: the tab IS the chart. The figure, the holdings line and the
  // "Charted from N transactions on this page" note are gone.
  it('renders the chart only — no PnL figure line, no holdings line, no page note', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.ant-descriptions')).toBeNull();
    expect(screen.queryByText('− NT$ 1,000')).toBeNull();
    expect(container.textContent).not.toMatch(/still holding/i);
    expect(container.textContent).not.toMatch(/charted from/i);
    expect(screen.getByTestId('echart')).toBeInTheDocument();
  });

  it('never labels anything "realized" or "net" inline', () => {
    const { container } = renderPanel();
    expect(container.textContent).not.toMatch(/realized|net invested/i);
  });

  it('keeps the no-prices caveat behind an info icon in the tab bar while the PnL tab is active', async () => {
    renderPanel();
    fireEvent.mouseEnter(screen.getByLabelText('pnl-note'));
    expect(await screen.findByText(/unrealized gains need market prices/i)).toBeInTheDocument();
  });

  it('shows the realized caveat instead for a closed portfolio', async () => {
    renderPanel({ ...PORTFOLIO, state: 'closed' } as Portfolio);
    fireEvent.mouseEnter(screen.getByLabelText('pnl-note'));
    expect(await screen.findByText(/realized profit or loss/i)).toBeInTheDocument();
  });

  it('drops the info icon on the Trend tab — the Waterfall toggle sits there instead', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Trend' }));
    expect(screen.queryByLabelText('pnl-note')).toBeNull();
    expect(screen.getByText('Waterfall')).toBeInTheDocument();
  });

  it('shows the Waterfall toggle only on the Trend tab', () => {
    renderPanel();
    expect(screen.queryByText('Waterfall')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Trend' }));
    expect(screen.getByText('Waterfall')).toBeInTheDocument();
  });

  it('reshapes the series when Waterfall is toggled', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Trend' }));
    const bars = optionSpy.mock.calls.at(-1)![0] as { series: unknown[] };
    expect(bars.series).toHaveLength(3);

    fireEvent.click(screen.getByText('Waterfall'));
    const waterfall = optionSpy.mock.calls.at(-1)![0] as { series: unknown[] };
    expect(waterfall.series).toHaveLength(6);
  });

  it('renders an empty state rather than a blank chart', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <IntlProvider locale="en-US" messages={enUS}>
          <PortfolioValuePanel portfolio={PORTFOLIO} transactions={[]} />
        </IntlProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('echart')).toBeNull();
    expect(screen.getByText(/Nothing to plot yet/i)).toBeInTheDocument();
  });
});
