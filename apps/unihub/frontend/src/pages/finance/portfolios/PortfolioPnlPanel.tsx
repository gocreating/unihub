/**
 * Portfolio value panel (FR-032/FR-034).
 *
 * The vocabulary here IS the feature. A closed portfolio has liquidated its
 * positions, so its net Value Change genuinely is profit or loss — it gets one
 * figure called **Realized PnL**. An open portfolio has capital still deployed:
 * `[Active] 永豐 DCA TW.00918` nets −474,391 TWD purely because it holds 49
 * purchases and has never sold. Calling that "unrealized PnL" would report a
 * 474k loss that did not happen, so an open portfolio shows what is actually
 * known — invested, returned, net invested, and the positions still held —
 * and says plainly that unrealized PnL needs prices unihub does not track.
 *
 * Every figure comes from the BACKEND, aggregated over all transfers: the
 * transactions table is paginated, so summing what the page loaded would
 * silently report a fraction of the truth (research I6-1).
 */
import { Card, Descriptions, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { EmptyValue } from '@/components/EmptyValue';
import { getPortfolioHoldings } from '@/services/unihub-backend/finance';
import type { Portfolio } from '@/services/unihub-backend/finance';

/** Trim the (38,18) zero padding the API sends. */
function trim(value: string | null): string | null {
  if (value == null) return null;
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}

function Amount({ value, currency }: { value: string | null; currency: string }) {
  const text = trim(value);
  if (text == null) return <EmptyValue />;
  return (
    <Typography.Text>
      {text} {currency}
    </Typography.Text>
  );
}

export interface PortfolioPnlPanelProps {
  portfolio: Portfolio;
  /** Panel column count, driven by measured width like the Portfolio panel. */
  columns: number;
}

export function PortfolioPnlPanel({ portfolio, columns }: PortfolioPnlPanelProps) {
  const { formatMessage: t } = useIntl();
  const isClosed = portfolio.state === 'closed';
  const ccy = portfolio.base_currency;

  const { data: holdings = [] } = useQuery({
    queryKey: ['finance', 'portfolios', portfolio.id, 'holdings'],
    queryFn: () => getPortfolioHoldings(portfolio.id),
  });

  return (
    <Card
      title={t({ id: 'pages.finance.portfolios.value.panelTitle' })}
      style={{ marginBottom: 16 }}
    >
      {isClosed ? (
        <Descriptions size="small" column={columns}>
          <Descriptions.Item label={t({ id: 'pages.finance.portfolios.value.realizedPnl' })}>
            <Amount value={portfolio.net_value_change} currency={ccy} />
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <>
          <Descriptions size="small" column={columns}>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.value.invested' })}>
              <Amount value={portfolio.value_invested} currency={ccy} />
            </Descriptions.Item>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.value.returned' })}>
              <Amount value={portfolio.value_returned} currency={ccy} />
            </Descriptions.Item>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.value.netInvested' })}>
              <Amount value={portfolio.net_value_change} currency={ccy} />
            </Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary">
              {t({ id: 'pages.finance.portfolios.value.holdings' })}
            </Typography.Text>
            <div style={{ marginTop: 4 }}>
              {holdings.length === 0 ? (
                <EmptyValue />
              ) : (
                <Space size={[8, 8]} wrap>
                  {holdings.map((h) => (
                    <Tag key={h.asset_id}>
                      {h.asset_name} × {trim(h.quantity)}
                    </Tag>
                  ))}
                </Space>
              )}
            </div>
          </div>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
            {t({ id: 'pages.finance.portfolios.value.noPricesNote' })}
          </Typography.Text>
        </>
      )}
    </Card>
  );
}
