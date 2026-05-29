import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Breadcrumb, Button, Card, Checkbox, Dropdown,
  Segmented, Select, Spin, Tag, Typography, message,
} from 'antd';
import { CaretDownFilled, CaretRightFilled, EditOutlined, HolderOutlined } from '@ant-design/icons';
import { Pie } from '@ant-design/plots';
import type { ProColumns } from '@ant-design/pro-components';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, widthForHeader } from '@/components/PageTable';
import type { Balance } from '@/services/unihub-backend/finance';
import {
  listBalances,
  listBalanceSheets,
  listCurrencies,
  listExchangeRates,
} from '@/services/unihub-backend/finance';
import {
  buildAggTree,
  buildTreeWithRoot,
  computeNetWorthInBase,
  formatAmount,
  getCurrencySymbol,
  reorderDimension,
  type AggTreeNode,
  type GroupingDimension,
} from '@/utils/finance';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

type BalanceDetailChartType = 'asset-vs-debt' | 'assets-only' | 'debts-only';

const DIMENSION_OPTIONS: GroupingDimension[] = ['type', 'currency'];
const CARD_TITLE_STYLE: React.CSSProperties = { margin: 0 };
// Extra width budget for tree expand icon + up to 2 indentation levels (15px each).
const TREE_INDENT_BUDGET = 64;

export function BalanceSheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();

  const [chartType, setChartType] = useState<BalanceDetailChartType>('asset-vs-debt');

  // Dimension state: orderedDimensions controls the display/drag order of ALL dimensions
  // (both checked and unchecked). checkedDimensions records which are active for grouping.
  const [orderedDimensions, setOrderedDimensions] = useState<GroupingDimension[]>(DIMENSION_OPTIONS);
  const [checkedDimensions, setCheckedDimensions] = useState<Set<GroupingDimension>>(new Set());

  // The active grouping passed to buildAggTree: checked items in their display order.
  const activeGrouping = useMemo(
    () => orderedDimensions.filter((d) => checkedDimensions.has(d)),
    [orderedDimensions, checkedDimensions],
  );

  const [draggingDim, setDraggingDim] = useState<GroupingDimension | null>(null);
  const [dropTargetDim, setDropTargetDim] = useState<GroupingDimension | null>(null);

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

  const { data: currencies = [] } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });

  const { data: rates = [] } = useQuery({
    queryKey: ['finance', 'exchange-rates'],
    queryFn: () => listExchangeRates(),
  });

  const baseCurrencies = useMemo(() => currencies.filter((c) => c.is_base_currency), [currencies]);
  const [baseCurrency, setBaseCurrency] = useBaseCurrency(baseCurrencies);

  useEffect(() => {
    if (balancesError) message.error(t({ id: 'pages.finance.balanceSheets.detail.updateError' }));
  }, [balancesError, t]);

  const computeNw = useMemo(
    () =>
      baseCurrency
        ? (amount: string, currency: string) =>
            computeNetWorthInBase(amount, currency, baseCurrency, rates, sheet?.date)
        : undefined,
    [baseCurrency, rates, sheet?.date],
  );

  const assetBalances = useMemo(() => balances.filter((b) => new Decimal(b.amount).gte(0)), [balances]);
  const debtBalances = useMemo(() => balances.filter((b) => new Decimal(b.amount).lt(0)), [balances]);

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
    () => (activeGrouping.length > 0 ? buildAggTree(balances, activeGrouping, aggLabels, '', computeNw) : []),
    [balances, activeGrouping, aggLabels, computeNw],
  );

  const totalNwInBase = useMemo(
    () =>
      baseCurrency && computeNw
        ? balances.reduce((sum, b) => {
            const nwv = computeNw(b.amount, b.currency);
            return nwv ? sum.plus(nwv) : sum;
          }, new Decimal(0))
        : null,
    [balances, baseCurrency, computeNw],
  );

  const treeWithRoot = useMemo(
    () =>
      baseCurrency
        ? buildTreeWithRoot(treeData, totalNwInBase, t({ id: 'pages.finance.balanceSheets.detail.aggregation.total' }))
        : treeData,
    [treeData, baseCurrency, totalNwInBase, t],
  );

  // ── PageTable-pattern column widths for the breakdown table ──────────────
  const aggDataWidths = useMemo(() => {
    const rootLabel = t({ id: 'pages.finance.balanceSheets.detail.aggregation.total' });
    const w = {
      label: measureTextWidth(rootLabel),
      currency: 0,
      amount: 0,
      netWorth: baseCurrency ? measureTextWidth(`${getCurrencySymbol(baseCurrency)} 00,000.00`) : 0,
    };
    for (const b of balances) {
      w.label = Math.max(
        w.label,
        measureTextWidth(b.account_name),
        measureTextWidth(b.currency),
        measureTextWidth(aggLabels.asset),
        measureTextWidth(aggLabels.debt),
      );
      w.currency = Math.max(w.currency, measureTextWidth(b.currency));
      w.amount = Math.max(w.amount, measureTextWidth(`${getCurrencySymbol(b.currency)} ${formatAmount(b.amount)}`));
      if (computeNw && baseCurrency) {
        const nwv = computeNw(b.amount, b.currency);
        if (nwv) {
          w.netWorth = Math.max(
            w.netWorth,
            measureTextWidth(`${getCurrencySymbol(baseCurrency)} ${formatAmount(nwv.toString())}`),
          );
        }
      }
    }
    return w;
  }, [balances, aggLabels, baseCurrency, computeNw, t]);

  const aggTableColumns = useMemo((): ProColumns<AggTreeNode>[] => [
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.aggregation.col.group' }),
      dataIndex: 'label',
      key: 'label',
      fixed: 'left',
      ...widthForHeader('Group', Math.max(160, aggDataWidths.label + TREE_INDENT_BUDGET)),
    },
    {
      title: t({ id: 'common.currency' }),
      dataIndex: 'currency',
      key: 'currency',
      ...widthForHeader('Currency', Math.max(80, aggDataWidths.currency)),
      render: (_dom, record) =>
        record.currency
          ? <Tag>{record.currency}</Tag>
          : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>,
    },
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.aggregation.col.amount' }),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      ...widthForHeader('Amount', Math.max(120, aggDataWidths.amount)),
      render: (_dom, record) => {
        if (record.key === 'root') {
          return <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>;
        }
        return record.currency
          ? `${getCurrencySymbol(record.currency)} ${formatAmount(record.amount.toString())}`
          : formatAmount(record.amount.toString());
      },
    },
    ...(baseCurrency
      ? [{
          title: t({ id: 'pages.finance.balanceSheets.detail.col.netWorth' }, { currency: baseCurrency }),
          key: 'netWorthInBase',
          dataIndex: 'netWorthInBase',
          align: 'right' as const,
          ...widthForHeader('Net Worth', Math.max(120, aggDataWidths.netWorth)),
          render: (_dom: unknown, record: AggTreeNode) =>
            record.netWorthInBase != null
              ? `${getCurrencySymbol(baseCurrency)} ${formatAmount(record.netWorthInBase.toString())}`
              : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>,
        } satisfies ProColumns<AggTreeNode>]
      : []),
  ], [t, baseCurrency, aggDataWidths]);

  const dataWidths = useMemo(() => {
    const w = { account_name: 0, currency: 0, amount: 0 };
    for (const b of balances) {
      w.account_name = Math.max(w.account_name, measureTextWidth(b.account_name));
      w.currency = Math.max(w.currency, measureTextWidth(b.currency));
      w.amount = Math.max(w.amount, measureTextWidth(`${getCurrencySymbol(b.currency)} ${formatAmount(b.amount)}`));
    }
    return w;
  }, [balances]);

  const columns: ProColumns<Balance>[] = useMemo(() => [
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.col.account' }),
      dataIndex: 'account_name',
      ...widthForHeader('Account', dataWidths.account_name),
      render: (val) => <Tag>{val as string}</Tag>,
    },
    {
      title: t({ id: 'common.currency' }),
      dataIndex: 'currency',
      ...widthForHeader('Currency', dataWidths.currency),
      render: (val) => <Tag>{val as string}</Tag>,
    },
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.col.amountWithSymbol' }),
      dataIndex: 'amount',
      ...widthForHeader('Amount', Math.max(160, dataWidths.amount)),
      align: 'right',
      render: (_dom, record) => `${getCurrencySymbol(record.currency)} ${formatAmount(record.amount)}`,
    },
    ...(baseCurrency
      ? [{
          title: t({ id: 'pages.finance.balanceSheets.detail.col.netWorth' }, { currency: baseCurrency }),
          key: 'net_worth',
          width: 160,
          align: 'right' as const,
          render: (_dom: unknown, record: Balance) => {
            const nwv = computeNw?.(record.amount, record.currency) ?? null;
            if (nwv == null) return <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>;
            return `${getCurrencySymbol(baseCurrency)} ${formatAmount(nwv.toString())}`;
          },
        }]
      : []),
  ], [t, dataWidths, baseCurrency, computeNw]);

  const isPieEmpty =
    (chartType === 'assets-only' && assetBalances.length === 0) ||
    (chartType === 'debts-only' && debtBalances.length === 0);

  const emptyPieMsg =
    chartType === 'assets-only'
      ? t({ id: 'pages.finance.balanceSheets.detail.visualization.noAssets' })
      : t({ id: 'pages.finance.balanceSheets.detail.visualization.noDebts' });

  // ── Dimension label helper ────────────────────────────────────────────────
  const dimensionLabel = (dim: GroupingDimension): string =>
    dim === 'type'
      ? t({ id: 'pages.finance.balanceSheets.detail.aggregation.dimType' })
      : t({ id: 'pages.finance.balanceSheets.detail.aggregation.dimCurrency' });

  // ── Drag handlers — ALL dimensions are draggable regardless of checked state ──
  const onDimDragStart = (dim: GroupingDimension) => setDraggingDim(dim);
  const onDimDragOver = (e: React.DragEvent, dim: GroupingDimension) => {
    e.preventDefault();
    setDropTargetDim(dim);
  };
  const onDimDrop = (e: React.DragEvent, targetDim: GroupingDimension) => {
    e.preventDefault();
    if (draggingDim && draggingDim !== targetDim) {
      setOrderedDimensions((prev) => reorderDimension(prev, draggingDim, targetDim));
    }
    setDraggingDim(null);
    setDropTargetDim(null);
  };
  const onDimDragEnd = () => {
    setDraggingDim(null);
    setDropTargetDim(null);
  };

  const onToggleDim = (dim: GroupingDimension) => {
    setCheckedDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return next;
    });
  };

  // ── Group-by dropdown — all options shown, all draggable ─────────────────
  const groupByDropdownContent = (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 6px 16px rgba(0,0,0,.08), 0 3px 6px -4px rgba(0,0,0,.12)',
        minWidth: 220,
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      {orderedDimensions.map((dim) => (
        <div
          key={dim}
          draggable
          onDragStart={() => onDimDragStart(dim)}
          onDragOver={(e) => onDimDragOver(e, dim)}
          onDrop={(e) => onDimDrop(e, dim)}
          onDragEnd={onDimDragEnd}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            cursor: 'grab',
            background: dropTargetDim === dim && draggingDim !== dim ? '#f0f0f0' : 'transparent',
            transition: 'background 0.15s',
          }}
        >
          <HolderOutlined style={{ marginRight: 8, color: '#bfbfbf', flexShrink: 0 }} />
          <Checkbox
            checked={checkedDimensions.has(dim)}
            onChange={() => onToggleDim(dim)}
            onClick={(e) => e.stopPropagation()}
          >
            {dimensionLabel(dim)}
          </Checkbox>
        </div>
      ))}
    </div>
  );

  const groupByButtonLabel =
    activeGrouping.length > 0
      ? activeGrouping.map(dimensionLabel).join(' → ')
      : t({ id: 'pages.finance.balanceSheets.detail.aggregation.groupBy' });

  const dimensionSelector = (
    <Dropdown dropdownRender={() => groupByDropdownContent} trigger={['click']}>
      <Button>
        {groupByButtonLabel}
        <CaretDownFilled style={{ marginLeft: 4, fontSize: 10 }} />
      </Button>
    </Dropdown>
  );

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

      {/* Base currency selector — always visible, disabled when no base currencies configured */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Typography.Text strong>{t({ id: 'pages.finance.balanceSheets.baseCurrency.label' })}:</Typography.Text>
        <Select
          value={baseCurrency}
          onChange={setBaseCurrency}
          disabled={baseCurrencies.length === 0}
          placeholder={t({ id: 'pages.finance.balanceSheets.baseCurrency.none' })}
          style={{ width: 200 }}
          options={baseCurrencies.map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }))}
        />
      </div>

      {/* Visualization card */}
      <Card
        title={<Typography.Title level={4} style={CARD_TITLE_STYLE}>{t({ id: 'pages.finance.balanceSheets.detail.visualization.title' })}</Typography.Title>}
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
          <Pie data={pieData} angleField="value" colorField="type" height={300} label={{ text: 'type' }} />
        )}
      </Card>

      {/* Aggregation View — PageTable with sticky Group column, row-click expand, caret icons */}
      <div style={{ marginBottom: 24 }}>
        <PageTable<AggTreeNode>
          pageTitle={t({ id: 'pages.finance.balanceSheets.detail.aggregation.title' })}
          headerTitle={dimensionSelector}
          rowKey="key"
          columns={aggTableColumns}
          dataSource={treeWithRoot}
          expandable={{
            defaultExpandAllRows: true,
            expandRowByClick: true,
            expandIcon: ({ expanded, onExpand, record }) => {
              const hasChildren = record.children && record.children.length > 0;
              if (!hasChildren) return <span style={{ display: 'inline-block', width: 16, marginRight: 4 }} />;
              return expanded ? (
                <CaretDownFilled
                  onClick={(e) => { e.stopPropagation(); onExpand(record, e); }}
                  style={{ cursor: 'pointer', marginRight: 4, fontSize: 10, color: '#8c8c8c' }}
                />
              ) : (
                <CaretRightFilled
                  onClick={(e) => { e.stopPropagation(); onExpand(record, e); }}
                  style={{ cursor: 'pointer', marginRight: 4, fontSize: 10, color: '#8c8c8c' }}
                />
              );
            },
          }}
          childrenColumnName="children"
          size="small"
          scroll={{ x: computeScrollX(aggTableColumns) }}
          onRow={(record) => ({
            style: record.children && record.children.length > 0 ? { cursor: 'pointer' } : undefined,
          })}
          locale={{
            emptyText: (
              <Typography.Text type="secondary">
                {t({ id: 'pages.finance.balanceSheets.detail.aggregation.empty' })}
              </Typography.Text>
            ),
          }}
        />
      </div>

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
