/**
 * Portfolio visualisations (FR-029) — waterfall + asset breakdown.
 *
 * Both plot **Value Change only**. Asset amounts cannot share an axis: a
 * portfolio holds 419 shares of one thing and 0.000000067 of another, and a
 * bar chart of those numbers says nothing. Value Change is the portfolio's
 * base currency throughout (that is why the currency lives on the portfolio),
 * so it is the one comparable quantity.
 *
 * Transfers with no Value Change — the position-only legs, 223 of 837 in the
 * real data — are excluded, and the card says so rather than quietly dropping
 * them.
 *
 * Constitution X/XI: ECharts + SVG renderer, `notMerge`, an `overflowX: auto`
 * wrapper with a 600px minimum, and an AntD Card with `tabList` because the
 * page carries both a chart and a table section.
 */
import { useMemo, useState } from 'react';
import { Card, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useIntl } from 'react-intl';
import type { Transaction } from '@/services/unihub-backend/finance';
import {
  breakdownByAsset,
  breakdownOption,
  waterfallOption,
  waterfallSteps,
} from './portfolioChartData';

const CHART_MIN_WIDTH = 600;
const CHART_HEIGHT = 320;

export interface PortfolioChartsProps {
  transactions: readonly Transaction[];
  baseCurrency: string;
}

export function PortfolioCharts({ transactions, baseCurrency }: PortfolioChartsProps) {
  const { formatMessage: t } = useIntl();
  const [tab, setTab] = useState<'waterfall' | 'breakdown'>('waterfall');

  const steps = useMemo(() => waterfallSteps(transactions), [transactions]);
  const rows = useMemo(() => breakdownByAsset(transactions), [transactions]);

  const totalTransfers = useMemo(
    () => transactions.reduce((n, txn) => n + txn.transfers.length, 0),
    [transactions],
  );
  const valuedTransfers = useMemo(
    () =>
      transactions.reduce(
        (n, txn) => n + txn.transfers.filter((tr) => tr.pnl_change != null).length,
        0,
      ),
    [transactions],
  );

  const option = tab === 'waterfall' ? waterfallOption(steps, baseCurrency) : breakdownOption(rows, baseCurrency);
  const isEmpty = tab === 'waterfall' ? steps.length === 0 : rows.length === 0;

  return (
    <Card
      style={{ marginBottom: 16 }}
      tabList={[
        { key: 'waterfall', tab: t({ id: 'pages.finance.portfolios.charts.waterfall' }) },
        { key: 'breakdown', tab: t({ id: 'pages.finance.portfolios.charts.breakdown' }) },
      ]}
      activeTabKey={tab}
      onTabChange={(key) => setTab(key as 'waterfall' | 'breakdown')}
    >
      {isEmpty ? (
        <Typography.Text type="secondary">
          {t({ id: 'pages.finance.portfolios.charts.empty' })}
        </Typography.Text>
      ) : (
        <>
          {/* Principle X: horizontal scroll rather than a squeezed chart. */}
          <div style={{ overflowX: 'auto' }}>
            <ReactECharts
              option={option}
              notMerge
              opts={{ renderer: 'svg' }}
              style={{ minWidth: CHART_MIN_WIDTH, width: '100%', height: CHART_HEIGHT }}
            />
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t(
              { id: 'pages.finance.portfolios.charts.valuedNote' },
              { valued: valuedTransfers, total: totalTransfers },
            )}
          </Typography.Text>
        </>
      )}
    </Card>
  );
}
