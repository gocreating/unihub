import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { PortfolioCharts } from './PortfolioCharts';
import {
  breakdownByAsset,
  breakdownOption,
  waterfallOption,
  waterfallSteps,
} from './portfolioChartData';
import type { Transaction } from '@/services/unihub-backend/finance';

// Capture the ECharts option instead of rendering a chart (jsdom has no canvas
// and, more importantly, the OPTION is what we actually want to assert).
const optionSpy = vi.fn();
vi.mock('echarts-for-react', () => ({
  default: (props: { option: unknown }) => {
    optionSpy(props.option);
    return <div data-testid="echart" />;
  },
}));

function txn(id: string, timestamp: string, transfers: [string, string | null][]): Transaction {
  // [assetName, pnlChange] — an asset (position) leg with an optional PnL.
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
    transfers: transfers.map(([asset_name, pnl_change], i) => ({
      id: `${id}-${i}`,
      pnl_change,
      currency: null,
      currency_symbol: null,
      currency_amount: null,
      asset: `a${i}`,
      asset_name,
      asset_change_amount: '1',
      created_at: timestamp,
      updated_at: timestamp,
    })),
  } as unknown as Transaction;
}

// Deliberately out of chronological order — the waterfall must sort.
const TXNS: Transaction[] = [
  txn('t2', '2026-02-01T00:00:00Z', [['TWD', '500'], ['0050.TW', null]]),
  txn('t1', '2026-01-01T00:00:00Z', [['TWD', '-1000']]),
  txn('t3', '2026-03-01T00:00:00Z', [['USDT', '-250'], ['USDT', '-250']]),
];

describe('waterfallSteps', () => {
  it('accumulates net value change in chronological order', () => {
    expect(waterfallSteps(TXNS)).toEqual([
      { label: '2026-01-01', delta: -1000, cumulative: -1000 },
      { label: '2026-02-01', delta: 500, cumulative: -500 },
      { label: '2026-03-01', delta: -500, cumulative: -1000 },
    ]);
  });

  it('excludes transactions whose transfers carry no value change', () => {
    const positionOnly = txn('t4', '2026-04-01T00:00:00Z', [['ETH', null]]);
    expect(waterfallSteps([positionOnly])).toEqual([]);
  });

  it('sums at full precision, never in float', () => {
    const wei = txn('w', '2026-01-01T00:00:00Z', [
      ['ETH', '-0.000000067305900768'],
      ['ETH', '-1.000000000000000000'],
    ]);
    expect(waterfallSteps([wei])[0]!.delta).toBeCloseTo(-1.000000067305901, 12);
  });
});

describe('breakdownByAsset', () => {
  it('sums value change per asset, largest magnitude first', () => {
    expect(breakdownByAsset(TXNS)).toEqual([
      { asset: 'TWD', value: -500 },
      { asset: 'USDT', value: -500 },
    ]);
  });

  it('omits assets that only ever appear as position-only legs', () => {
    expect(breakdownByAsset(TXNS).map((r) => r.asset)).not.toContain('0050.TW');
  });
});

describe('waterfallOption', () => {
  it('stacks a transparent base under the visible delta', () => {
    const opt = waterfallOption(waterfallSteps(TXNS), 'TWD');
    const series = opt.series as { name: string; stack: string; data: unknown[] }[];
    expect(series).toHaveLength(2);
    expect(series[0]!.name).toBe('base');
    expect(series[0]!.stack).toBe(series[1]!.stack);
    // Step 2 rises from -1000 to -500: the base sits at -1000, the bar is 500 tall.
    expect(series[0]!.data[1]).toBe(-1000);
    expect((series[1]!.data[1] as { value: number }).value).toBe(500);
  });

  it('labels the value axis with the portfolio currency', () => {
    const opt = waterfallOption(waterfallSteps(TXNS), 'TWD');
    expect((opt.yAxis as { name: string }).name).toBe('TWD');
  });
});

describe('breakdownOption', () => {
  it('renders one bar per asset', () => {
    const opt = breakdownOption(breakdownByAsset(TXNS), 'TWD');
    expect((opt.xAxis as { data: string[] }).data).toEqual(['TWD', 'USDT']);
  });
});

function renderCharts(transactions: Transaction[]) {
  return render(
    <IntlProvider locale="en-US" messages={enUS}>
      <PortfolioCharts transactions={transactions} baseCurrency="TWD" />
    </IntlProvider>,
  );
}

describe('PortfolioCharts', () => {
  it('renders a tabbed card and switches between the two charts', async () => {
    optionSpy.mockClear();
    renderCharts(TXNS);
    expect(screen.getByRole('tab', { name: /Waterfall/i })).toBeInTheDocument();
    const first = optionSpy.mock.calls.at(-1)![0] as { series: unknown[] };
    expect(first.series).toHaveLength(2); // waterfall = base + delta

    fireEvent.click(screen.getByRole('tab', { name: /Breakdown/i }));
    const second = optionSpy.mock.calls.at(-1)![0] as { series: unknown[] };
    expect(second.series).toHaveLength(1); // breakdown = one series
  });

  it('discloses how many transfers carry a value', () => {
    renderCharts(TXNS);
    // 4 of 5 transfers are valued (one position-only leg).
    expect(screen.getByText(/4 of 5/)).toBeInTheDocument();
  });

  it('renders an empty state rather than a blank chart', () => {
    renderCharts([txn('only', '2026-01-01T00:00:00Z', [['ETH', null]])]);
    expect(screen.queryByTestId('echart')).toBeNull();
    expect(screen.getByText(/no valued transfers/i)).toBeInTheDocument();
  });
});
