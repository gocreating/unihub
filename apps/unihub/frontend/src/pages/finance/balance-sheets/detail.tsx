import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Breadcrumb, Button, Card, Col, Row, Segmented, Select, Spin, Statistic, Table, Tag, Typography, message } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, EditOutlined } from '@ant-design/icons';
import { Pie } from '@ant-design/plots';
import type { ProColumns } from '@ant-design/pro-components';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, widthForHeader } from '@/components/PageTable';
import type { Balance } from '@/services/unihub-backend/finance';
import {
  getNetWorth,
  listBalances,
  listBalanceSheets,
} from '@/services/unihub-backend/finance';
import { buildAggTree, formatAmount, type AggTreeNode, type GroupingDimension } from '@/utils/finance';

type BalanceDetailChartType = 'asset-vs-debt' | 'assets-only' | 'debts-only';

const DIMENSION_OPTIONS: GroupingDimension[] = ['type', 'currency'];

export function BalanceSheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();

  const [chartType, setChartType] = useState<BalanceDetailChartType>('asset-vs-debt');
  const [selectedDimensions, setSelectedDimensions] = useState<GroupingDimension[]>([]);

  const { data: sheets = [] } = useQuery({
    queryKey: ['finance', 'balance-sheets'],
    queryFn: () => listBalanceSheets(),
  });
  const sheet = sheets.find((s) => s.id === id);

  const { data: balances = [], isLoading: balancesLoading, isError: balancesError } = useQuery({
    queryKey: ['finance', 'balance-sheets', id, 'balances'],
    queryFn: () => listBalances(id!),
    enabled: !!id,
  });

  const { data: netWorth, isLoading: netWorthLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets', id, 'net-worth'],
    queryFn: () => getNetWorth(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (balancesError) message.error(t({ id: 'pages.finance.balanceSheets.detail.updateError' }));
  }, [balancesError, t]);

  const assetBalances = useMemo(
    () => balances.filter((b) => new Decimal(b.amount).gte(0)),
    [balances],
  );
  const debtBalances = useMemo(
    () => balances.filter((b) => new Decimal(b.amount).lt(0)),
    [balances],
  );

  const pieData = useMemo(() => {
    if (chartType === 'asset-vs-debt') {
      const assetTotal = assetBalances.reduce((s, b) => s.plus(b.amount), new Decimal(0));
      const debtTotal = debtBalances.reduce((s, b) => s.plus(b.amount), new Decimal(0)).abs();
      return [
        { type: t({ id: 'pages.finance.balanceSheets.detail.aggregation.label.asset' }), value: assetTotal.toNumber() },
        { type: t({ id: 'pages.finance.balanceSheets.detail.aggregation.label.debt' }), value: debtTotal.toNumber() },
      ];
    }
    if (chartType === 'assets-only') {
      return assetBalances.map((b) => ({ type: b.account_name, value: new Decimal(b.amount).toNumber() }));
    }
    return debtBalances.map((b) => ({ type: b.account_name, value: new Decimal(b.amount).abs().toNumber() }));
  }, [chartType, assetBalances, debtBalances, t]);

  const aggLabels = useMemo(
    () => ({
      asset: t({ id: 'pages.finance.balanceSheets.detail.aggregation.label.asset' }),
      debt: t({ id: 'pages.finance.balanceSheets.detail.aggregation.label.debt' }),
    }),
    [t],
  );

  const treeData = useMemo(
    () => (selectedDimensions.length > 0 ? buildAggTree(balances, selectedDimensions, aggLabels) : []),
    [balances, selectedDimensions, aggLabels],
  );

  const dataWidths = useMemo(() => {
    const w = { account_name: 0, currency: 0, amount: 0 };
    for (const b of balances) {
      w.account_name = Math.max(w.account_name, measureTextWidth(b.account_name));
      w.currency = Math.max(w.currency, measureTextWidth(b.currency));
      w.amount = Math.max(w.amount, measureTextWidth(formatAmount(b.amount)));
    }
    return w;
  }, [balances]);

  const columns: ProColumns<Balance>[] = useMemo(() => [
    { title: t({ id: 'pages.finance.balanceSheets.detail.col.account' }), dataIndex: 'account_name', ...widthForHeader('Account', dataWidths.account_name), render: (val) => <Tag>{val as string}</Tag> },
    { title: t({ id: 'common.currency' }), dataIndex: 'currency', ...widthForHeader('Currency', dataWidths.currency), render: (val) => <Tag>{val as string}</Tag> },
    { title: t({ id: 'pages.finance.balanceSheets.detail.col.amount' }), dataIndex: 'amount', ...widthForHeader('Amount', Math.max(150, dataWidths.amount)), align: 'right', render: (_dom, record) => formatAmount(record.amount) },
  ], [t, dataWidths]);

  const isPieEmpty =
    (chartType === 'assets-only' && assetBalances.length === 0) ||
    (chartType === 'debts-only' && debtBalances.length === 0);

  const emptyPieMsg =
    chartType === 'assets-only'
      ? t({ id: 'pages.finance.balanceSheets.detail.visualization.noAssets' })
      : t({ id: 'pages.finance.balanceSheets.detail.visualization.noDebts' });

  const moveDimension = (index: number, direction: -1 | 1) => {
    setSelectedDimensions((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target] as GroupingDimension, next[index] as GroupingDimension];
      return next;
    });
  };

  const handleDimensionChange = (values: string[]) => {
    const valid = values.filter((v): v is GroupingDimension =>
      DIMENSION_OPTIONS.includes(v as GroupingDimension),
    );
    setSelectedDimensions((prev) => {
      const added = valid.filter((v) => !prev.includes(v));
      const kept = prev.filter((v) => valid.includes(v));
      return [...kept, ...added];
    });
  };

  const aggTableColumns = [
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.aggregation.col.group' }),
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: t({ id: 'common.currency' }),
      dataIndex: 'currency',
      key: 'currency',
      render: (val: string | undefined) =>
        val ? <Tag>{val}</Tag> : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>,
    },
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.aggregation.col.amount' }),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      render: (val: Decimal) => formatAmount(val.toString()),
    },
  ];

  if (!sheet) return <Spin />;

  const relativeLabel = `${dayjs(sheet.date).format('YYYY-MM-DD HH:mm')} (${dayjs(sheet.date).fromNow()})`;

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
          { title: relativeLabel },
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

      {/* Visualization card — always visible (US2) */}
      <Card
        title={t({ id: 'pages.finance.balanceSheets.detail.visualization.title' })}
        style={{ marginBottom: 24 }}
      >
        <Segmented
          value={chartType}
          onChange={(v) => setChartType(v as BalanceDetailChartType)}
          options={[
            { label: t({ id: 'pages.finance.balanceSheets.detail.visualization.assetVsDebt' }), value: 'asset-vs-debt' },
            { label: t({ id: 'pages.finance.balanceSheets.detail.visualization.assetsOnly' }), value: 'assets-only' },
            { label: t({ id: 'pages.finance.balanceSheets.detail.visualization.debtsOnly' }), value: 'debts-only' },
          ]}
          style={{ marginBottom: 16 }}
        />
        {isPieEmpty ? (
          <Typography.Text type="secondary">{emptyPieMsg}</Typography.Text>
        ) : (
          <Pie
            data={pieData}
            angleField="value"
            colorField="type"
            height={300}
            label={{ text: 'type' }}
          />
        )}
      </Card>

      {/* Tree aggregation card — always visible (US3) */}
      <Card
        title={t({ id: 'pages.finance.balanceSheets.detail.aggregation.title' })}
        style={{ marginBottom: 24 }}
      >
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Text>{t({ id: 'pages.finance.balanceSheets.detail.aggregation.groupBy' })}:</Typography.Text>
          <Select
            mode="multiple"
            value={selectedDimensions}
            onChange={handleDimensionChange}
            style={{ minWidth: 200 }}
            options={[
              { value: 'type', label: t({ id: 'pages.finance.balanceSheets.detail.aggregation.dimType' }) },
              { value: 'currency', label: t({ id: 'pages.finance.balanceSheets.detail.aggregation.dimCurrency' }) },
            ]}
          />
          {selectedDimensions.map((dim, i) => (
            <span key={dim} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Button
                size="small"
                icon={<ArrowUpOutlined />}
                disabled={i === 0}
                onClick={() => moveDimension(i, -1)}
              />
              <Button
                size="small"
                icon={<ArrowDownOutlined />}
                disabled={i === selectedDimensions.length - 1}
                onClick={() => moveDimension(i, 1)}
              />
            </span>
          ))}
        </div>
        {selectedDimensions.length === 0 ? (
          <Typography.Text type="secondary">
            {t({ id: 'pages.finance.balanceSheets.detail.aggregation.empty' })}
          </Typography.Text>
        ) : (
          <Table<AggTreeNode>
            dataSource={treeData}
            columns={aggTableColumns}
            childrenColumnName="children"
            rowKey="key"
            expandable={{ defaultExpandAllRows: true }}
            pagination={false}
            size="small"
          />
        )}
      </Card>

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
