import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Breadcrumb, Button, Card, Col, Row, Spin, Statistic, Tag } from 'antd';
import dayjs from 'dayjs';
import { EditOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import Decimal from 'decimal.js';
import { useNavigate, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, widthForHeader } from '@/components/PageTable';
import type { Balance } from '@/services/unihub-backend/finance';
import {
  getNetWorth,
  listBalances,
  listBalanceSheets,
} from '@/services/unihub-backend/finance';

export function BalanceSheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();

  const { data: sheets = [] } = useQuery({
    queryKey: ['finance', 'balance-sheets'],
    queryFn: () => listBalanceSheets(),
  });
  const sheet = sheets.find((s) => s.id === id);

  const { data: balances = [], isLoading: balancesLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets', id, 'balances'],
    queryFn: () => listBalances(id!),
    enabled: !!id,
  });

  const { data: netWorth, isLoading: netWorthLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets', id, 'net-worth'],
    queryFn: () => getNetWorth(id!),
    enabled: !!id,
  });

  const dataWidths = useMemo(() => {
    const w = { account_name: 0, currency: 0, amount: 0 };
    for (const b of balances) {
      w.account_name = Math.max(w.account_name, measureTextWidth(b.account_name));
      w.currency = Math.max(w.currency, measureTextWidth(b.currency));
      w.amount = Math.max(w.amount, measureTextWidth(b.amount));
    }
    return w;
  }, [balances]);

  const columns: ProColumns<Balance>[] = useMemo(() => [
    { title: t({ id: 'pages.finance.balanceSheets.detail.col.account' }), dataIndex: 'account_name', ...widthForHeader('Account', dataWidths.account_name), render: (val) => <Tag>{val as string}</Tag> },
    { title: t({ id: 'common.currency' }), dataIndex: 'currency', ...widthForHeader('Currency', dataWidths.currency), render: (val) => <Tag>{val as string}</Tag> },
    { title: t({ id: 'pages.finance.balanceSheets.detail.col.amount' }), dataIndex: 'amount', ...widthForHeader('Amount', Math.max(120, dataWidths.amount)) },
  ], [t, dataWidths]);

  if (!sheet) return <Spin />;

  const dateLabel = `${dayjs(sheet.date).format('YYYY-MM-DD HH:mm')} (${dayjs(sheet.date).fromNow()})`;

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            title: t({ id: 'pages.finance.balanceSheets.title' }),
            href: '/finance/balance-sheets',
            onClick: (e) => { e.preventDefault(); navigate('/finance/balance-sheets'); },
          },
          { title: dateLabel },
        ]}
      />

      {netWorthLoading ? (
        <Spin />
      ) : netWorth && netWorth.per_currency.length > 0 ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {netWorth.per_currency.map((entry) => (
            <Col key={entry.currency} xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title={t({ id: 'pages.finance.balanceSheets.detail.netWorth' }, { currency: entry.currency })}
                  value={new Decimal(entry.net_worth).toFixed(2)}
                  prefix={entry.currency}
                />
              </Card>
            </Col>
          ))}
        </Row>
      ) : null}

      <PageTable<Balance>
        pageTitle={t({ id: 'pages.finance.balanceSheets.detail.title' })}
        action={
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => navigate(`/finance/balance-sheets/${id}/edit`)}
          >
            {t({ id: 'common.edit' })}
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={balances}
        loading={balancesLoading}
        scroll={{ x: computeScrollX(columns) }}
      />
    </div>
  );
}
