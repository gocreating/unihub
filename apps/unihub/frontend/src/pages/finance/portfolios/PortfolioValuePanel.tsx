/**
 * The portfolio value panel (FR-040…FR-043) — ONE card, two tabs.
 *
 * This replaces the former pair of panels (a Descriptions "Value" panel and a
 * separate charts card). They said the same thing twice: the figures panel
 * listed invested / returned / net, and the chart beside it plotted the same
 * running total. Merged, the headline figure and the curve that ends at it sit
 * in one place and cannot drift apart.
 *
 *  - **PnL tab**: the portfolio's PnL to date plus the cumulative line whose
 *    LAST point is exactly that number, in the Balance Sheets equity-curve
 *    style, and the positions still held (FR-034).
 *  - **Trend tab**: cost / income / position per transaction, with the
 *    Waterfall toggle in the card header (Principle VI: panel-header actions).
 *
 * Every aggregate comes from the BACKEND, computed over all transfers: the
 * transactions table is paginated, so summing the loaded page would silently
 * report a fraction of the truth (research I6-1). The CHARTS necessarily plot
 * the loaded page, and the panel says so.
 *
 * Constitution X/XI: ECharts + SVG renderer, `notMerge`, an `overflowX: auto`
 * wrapper with a 600px minimum, and an AntD Card with `tabList`.
 */
import { useMemo, useState } from 'react';
import { Card, Descriptions, Segmented, Space, Tag, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { EmptyValue } from '@/components/EmptyValue';
import { getPortfolioHoldings } from '@/services/unihub-backend/finance';
import type { Portfolio, Transaction } from '@/services/unihub-backend/finance';
import { Price, formatMoney } from '@/components/Price';
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
  transactions: readonly Transaction[];
  /** Panel column count, driven by measured width like the Portfolio panel. */
  columns: number;
}

export function PortfolioValuePanel({
  portfolio,
  transactions,
  columns,
}: PortfolioValuePanelProps) {
  const { formatMessage: t } = useIntl();
  const [tab, setTab] = useState<'pnl' | 'trend'>('pnl');
  const [mode, setMode] = useState<TrendMode>('bar');
  const ccy = portfolio.base_currency;
  const isClosed = portfolio.state === 'closed';

  const { data: holdings = [] } = useQuery({
    queryKey: ['finance', 'portfolios', portfolio.id, 'holdings'],
    queryFn: () => getPortfolioHoldings(portfolio.id),
  });

  const line = useMemo(() => pnlPoints(transactions), [transactions]);
  const bars = useMemo(() => trendPoints(transactions), [transactions]);

  const axis = { currency: ccy };
  const option =
    tab === 'pnl'
      ? pnlLineOption(line, axis)
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
        ) : null
      }
    >
      {tab === 'pnl' && (
        <Descriptions size="small" column={columns} style={{ marginBottom: 8 }}>
          <Descriptions.Item
            label={
              <Space size={4}>
                {t({ id: 'pages.finance.portfolios.value.pnl' })}
                {/* The realized/unrealized nuance lives here, not inline: the
                    figure is the point, the caveat is a detail on demand. */}
                <Tooltip
                  title={t({
                    id: isClosed
                      ? 'pages.finance.portfolios.value.realizedNote'
                      : 'pages.finance.portfolios.value.noPricesNote',
                  })}
                >
                  <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                </Tooltip>
              </Space>
            }
          >
            {portfolio.net_value_change == null ? (
              <EmptyValue />
            ) : (
              <Price value={portfolio.net_value_change} currency={ccy} signed />
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t({ id: 'pages.finance.portfolios.value.holdings' })}>
            {holdings.length === 0 ? (
              <EmptyValue />
            ) : (
              <Space size={[8, 8]} wrap>
                {holdings.map((h) => (
                  <Tag key={h.asset_id}>
                    {h.asset_name} × {formatMoney(h.quantity, { asset: '' })}
                  </Tag>
                ))}
              </Space>
            )}
          </Descriptions.Item>
        </Descriptions>
      )}

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
              { id: 'pages.finance.portfolios.charts.pageNote' },
              { count: transactions.length },
            )}
          </Typography.Text>
        </>
      )}
    </Card>
  );
}
