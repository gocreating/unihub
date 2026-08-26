/**
 * The portfolio value panel (FR-040…FR-043, FR-054, FR-055) — ONE card, two
 * tabs, and each tab IS its chart.
 *
 *  - **PnL tab**: the cumulative line whose LAST point is the portfolio's PnL
 *    to date, in the Balance Sheets equity-curve style. The figure itself is
 *    no longer printed above the chart (FR-054) — the Portfolios list and the
 *    newest transaction row's Accumulated PnL already state it — and the
 *    realized (closed) vs net-to-date (open, no market prices) caveat lives
 *    behind an info icon in the tab bar.
 *  - **Trend tab**: cost / income / position per transaction, all in the base
 *    currency (position = −(cost + income), FR-055), with the Waterfall toggle
 *    in the tab bar (Principle VI: panel-header actions).
 *
 * The transactions handed in are the portfolio's COMPLETE set (FR-057), not
 * the table's page, so the curve genuinely ends at the portfolio's PnL.
 *
 * Constitution X/XI: ECharts + SVG renderer, `notMerge`, an `overflowX: auto`
 * wrapper with a 600px minimum, and an AntD Card with `tabList`.
 */
import { useMemo, useState } from 'react';
import { Card, Segmented, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useIntl } from 'react-intl';
import { NEUTRAL_COLOR } from '@/components/Price';
import type { Portfolio, Transaction } from '@/services/unihub-backend/finance';
import {
  pnlLineOption,
  pnlPoints,
  trendOption,
  trendPoints,
} from './portfolioChartData';
import type { TrendMode } from './portfolioChartData';

const CHART_MIN_WIDTH = 600;
const CHART_HEIGHT = 320;

export interface PortfolioValuePanelProps {
  portfolio: Portfolio;
  /** Every transaction of the portfolio, not the table's page (FR-057). */
  transactions: readonly Transaction[];
}

export function PortfolioValuePanel({ portfolio, transactions }: PortfolioValuePanelProps) {
  const { formatMessage: t } = useIntl();
  const [tab, setTab] = useState<'pnl' | 'trend'>('pnl');
  const [mode, setMode] = useState<TrendMode>('bar');
  const ccy = portfolio.base_currency;
  const isClosed = portfolio.state === 'closed';

  const line = useMemo(() => pnlPoints(transactions), [transactions]);
  const bars = useMemo(() => trendPoints(transactions), [transactions]);

  const axis = { currency: ccy };
  const option =
    tab === 'pnl'
      ? pnlLineOption(line, axis, t({ id: 'pages.finance.portfolios.charts.pnlTab' }))
      : trendOption(bars, mode, axis, {
          cost: t({ id: 'pages.finance.portfolios.charts.cost' }),
          income: t({ id: 'pages.finance.portfolios.charts.income' }),
          position: t({ id: 'pages.finance.portfolios.charts.position' }),
        });
  const isEmpty = tab === 'pnl' ? line.length === 0 : bars.length === 0;

  return (
    <Card
      style={{ marginBottom: 16 }}
      tabList={[
        { key: 'pnl', tab: t({ id: 'pages.finance.portfolios.charts.pnlTab' }) },
        { key: 'trend', tab: t({ id: 'pages.finance.portfolios.charts.trendTab' }) },
      ]}
      activeTabKey={tab}
      onTabChange={(key) => setTab(key as 'pnl' | 'trend')}
      tabBarExtraContent={
        tab === 'trend' ? (
          <Segmented<TrendMode>
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'bar', label: t({ id: 'pages.finance.portfolios.charts.barMode' }) },
              { value: 'waterfall', label: t({ id: 'pages.finance.portfolios.charts.waterfall' }) },
            ]}
          />
        ) : (
          // FR-054: the realized/unrealized nuance is a detail on demand — an
          // icon, not a sentence under the chart.
          <Tooltip
            title={t({
              id: isClosed
                ? 'pages.finance.portfolios.value.realizedNote'
                : 'pages.finance.portfolios.value.noPricesNote',
            })}
          >
            <InfoCircleOutlined aria-label="pnl-note" style={{ color: NEUTRAL_COLOR }} />
          </Tooltip>
        )
      }
    >
      {isEmpty ? (
        <Typography.Text type="secondary">
          {t({ id: 'pages.finance.portfolios.charts.empty' })}
        </Typography.Text>
      ) : (
        // Principle X: horizontal scroll rather than a squeezed chart.
        <div style={{ overflowX: 'auto' }}>
          <ReactECharts
            option={option}
            notMerge
            opts={{ renderer: 'svg' }}
            style={{ minWidth: CHART_MIN_WIDTH, width: '100%', height: CHART_HEIGHT }}
          />
        </div>
      )}
    </Card>
  );
}
