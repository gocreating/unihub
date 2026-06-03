import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Breadcrumb, Button, Card, Checkbox, Dropdown,
  Select, Spin, Tag, Typography, message,
} from 'antd';
import { CaretDownFilled, CaretRightFilled, EditOutlined, HolderOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
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
import { resolveAccountColor } from '@/utils/chartData';

type BalanceDetailChartType = 'asset-vs-debt' | 'assets-only' | 'debts-only' | 'aggregation';

const DIMENSION_OPTIONS: GroupingDimension[] = ['type', 'currency'];
// Extra width budget for tree expand icon + up to 2 indentation levels (15px each).
const TREE_INDENT_BUDGET = 64;

/**
 * Collect keys for the default-expanded state:
 * expand every non-leaf node EXCEPT those whose children are all leaves
 * (the level directly above accounts).  Those stay collapsed so accounts
 * are hidden until the user explicitly opens them.
 */
function collectDefaultExpandedKeys(nodes: AggTreeNode[]): React.Key[] {
  const keys: React.Key[] = [];
  for (const node of nodes) {
    if (!node.children || node.children.length === 0) continue;
    const allChildrenAreLeaves = node.children.every((c) => !c.children || c.children.length === 0);
    if (!allChildrenAreLeaves) {
      keys.push(node.key);
      keys.push(...collectDefaultExpandedKeys(node.children));
    }
  }
  return keys;
}

/** Collect all nodes reachable through currently-expanded keys (for dynamic column width). */
function collectVisibleNodes(nodes: AggTreeNode[], expandedKeySet: Set<React.Key>): AggTreeNode[] {
  const result: AggTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (expandedKeySet.has(node.key) && node.children) {
      result.push(...collectVisibleNodes(node.children, expandedKeySet));
    }
  }
  return result;
}

export function BalanceSheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();

  const [chartType, setChartType] = useState<BalanceDetailChartType>('asset-vs-debt');

  // Dimension state: orderedDimensions controls the display/drag order of ALL dimensions
  // (both checked and unchecked). checkedDimensions records which are active for grouping.
  const [orderedDimensions, setOrderedDimensions] = useState<GroupingDimension[]>(DIMENSION_OPTIONS);
  const [checkedDimensions, setCheckedDimensions] = useState<Set<GroupingDimension>>(new Set<GroupingDimension>(['type', 'currency']));

  // The active grouping passed to buildAggTree: checked items in their display order.
  const activeGrouping = useMemo(
    () => orderedDimensions.filter((d) => checkedDimensions.has(d)),
    [orderedDimensions, checkedDimensions],
  );

  const [draggingDim, setDraggingDim] = useState<GroupingDimension | null>(null);
  const [dropTargetDim, setDropTargetDim] = useState<GroupingDimension | null>(null);

  const { data: sheetsData } = useQuery({
    queryKey: ['finance', 'balance-sheets'],
    queryFn: () => listBalanceSheets(),
  });
  const sheets = useMemo(() => sheetsData?.results ?? [], [sheetsData]);
  const sheet = sheets.find((s) => s.id === id);

  const { data: balances = [], isLoading: balancesLoading, isError: balancesError } = useQuery({
    queryKey: ['finance', 'balance-sheets', id, 'balances'],
    queryFn: () => listBalances(id!),
    enabled: !!id,
  });

  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });
  const currencies = useMemo(() => currenciesData?.results ?? [], [currenciesData]);

  const { data: ratesData } = useQuery({
    queryKey: ['finance', 'exchange-rates'],
    queryFn: () => listExchangeRates(),
  });
  const rates = useMemo(() => ratesData?.results ?? [], [ratesData]);

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
    const sym = getCurrencySymbol(baseCurrency ?? '');
    const fmtVal = (v: number) => sym ? `${sym} ${formatAmount(String(v))}` : formatAmount(String(v));

    if (chartType === 'asset-vs-debt') {
      const assetTotal = assetBalances.reduce((s, b) => {
        const v = computeNw ? (computeNw(b.amount, b.currency) ?? new Decimal(b.amount)) : new Decimal(b.amount);
        return s.plus(v);
      }, new Decimal(0));
      const debtTotal = debtBalances.reduce((s, b) => {
        const v = computeNw ? (computeNw(b.amount, b.currency) ?? new Decimal(b.amount)) : new Decimal(b.amount);
        return s.plus(v.abs());
      }, new Decimal(0));
      return {
        items: [
          { name: t({ id: 'pages.finance.balanceSheets.detail.aggregation.label.asset' }), value: assetTotal.toNumber() },
          { name: t({ id: 'pages.finance.balanceSheets.detail.aggregation.label.debt' }),  value: debtTotal.toNumber() },
        ],
        // Fixed green/red palette — always set at option level so ECharts doesn't carry
        // over the previous tab's palette when notMerge resets the chart.
        colors: ['#52c41a', '#ff4d4f'] as string[],
        fmtVal,
      };
    }

    // Assets Only / Debts Only: use account color, FX value when available, sort desc.
    const items = (chartType === 'assets-only' ? assetBalances : debtBalances)
      .map((b) => {
        const raw = new Decimal(b.amount);
        const nwv = computeNw ? computeNw(b.amount, b.currency) : null;
        const value = (nwv?.abs() ?? raw.abs()).toNumber();
        return {
          name: b.account_name,
          value,
          color: resolveAccountColor(b.account_name, b.color || undefined),
        };
      })
      .sort((a, b) => b.value - a.value);
    // Build option-level color array in the same order as data items so ECharts assigns
    // each account its color regardless of whether notMerge clears per-item itemStyle.
    return { items, colors: items.map((i) => i.color), fmtVal };
  }, [chartType, assetBalances, debtBalances, baseCurrency, computeNw, t]);

  const pieOption = useMemo((): EChartsOption => {
    const { items, colors, fmtVal } = pieData;
    return {
      // Always set color at option level — reliable across tab switches with notMerge.
      color: colors,
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params) => {
          const p = params as { name: string; value: number; percent: number; marker: string };
          return `${p.marker}${p.name}<br/>${fmtVal(p.value)} (${p.percent.toFixed(1)}%)`;
        },
      },
      legend: { show: false },
      series: [{
        type: 'pie',
        roseType: 'area',
        radius: ['10%', '68%'],
        itemStyle: { borderRadius: 6 },
        // Strip `color` field — it's only for building the option-level color array above.
        data: items.map(({ name, value }) => ({ name, value })),
        label: { formatter: '{b}: {d}%', overflow: 'truncate' },
        labelLayout: { hideOverlap: true },
        emphasis: { label: { fontSize: 14, fontWeight: 'bold' } },
      }],
    };
  }, [pieData]);

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
        ? buildTreeWithRoot(treeData, totalNwInBase, 'All')
        : treeData,
    [treeData, baseCurrency, totalNwInBase],
  );

  // Controlled tree expand state — all parent nodes expanded by default, leaf accounts collapsed.
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(() => collectDefaultExpandedKeys(treeWithRoot));
  // Reset to all-parents-expanded whenever the tree structure changes (dimensions switched, etc.).
  useEffect(() => {
    setExpandedKeys(collectDefaultExpandedKeys(treeWithRoot));
  }, [treeWithRoot]);

  // ── PageTable-pattern column widths for the breakdown table ──────────────
  // Computed from VISIBLE nodes (changes as user expands/collapses rows).
  const aggDataWidths = useMemo(() => {
    const expandedKeySet = new Set<React.Key>(expandedKeys);
    const visibleNodes = collectVisibleNodes(treeWithRoot, expandedKeySet);
    const w = { label: 0, amount: 0, netWorth: 0 };
    for (const node of visibleNodes) {
      w.label = Math.max(w.label, measureTextWidth(node.label));
      if (node.currency) {
        w.amount = Math.max(w.amount, measureTextWidth(`${getCurrencySymbol(node.currency)} ${formatAmount(node.amount.toString())}`));
      }
      if (baseCurrency && node.netWorthInBase != null) {
        w.netWorth = Math.max(w.netWorth, measureTextWidth(`${getCurrencySymbol(baseCurrency)} ${formatAmount(node.netWorthInBase.toString())}`));
      }
    }
    if (baseCurrency && w.netWorth === 0) {
      w.netWorth = measureTextWidth(`${getCurrencySymbol(baseCurrency)} 00,000.00`);
    }
    return w;
  }, [treeWithRoot, expandedKeys, baseCurrency]);

  const aggTableColumns = useMemo((): ProColumns<AggTreeNode>[] => [
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.aggregation.col.group' }),
      dataIndex: 'label',
      key: 'label',
      fixed: 'left',
      ...widthForHeader('Group', Math.max(160, aggDataWidths.label + TREE_INDENT_BUDGET)),
    },
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.aggregation.col.amount' }),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      ...widthForHeader('Amount', Math.max(120, aggDataWidths.amount)),
      render: (_dom, record) => {
        // Root node and multi-currency aggregates (e.g. "Asset" spanning TWD+USD):
        // summing different currencies is meaningless, show placeholder.
        if (record.key === 'root' || (!record.currency && !record.isLeaf)) {
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
    chartType !== 'aggregation' && (
      (chartType === 'assets-only' && assetBalances.length === 0) ||
      (chartType === 'debts-only' && debtBalances.length === 0)
    );

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

      {/* Visualization card — 4 tabs: 3 rose charts + aggregation table */}
      <Card
        tabList={[
          { key: 'asset-vs-debt', label: t({ id: 'pages.finance.balanceSheets.detail.tab.assetVsDebt' }) },
          { key: 'assets-only',   label: t({ id: 'pages.finance.balanceSheets.detail.tab.assetsBreakdown' }) },
          { key: 'debts-only',    label: t({ id: 'pages.finance.balanceSheets.detail.tab.debtsBreakdown' }) },
          { key: 'aggregation',   label: t({ id: 'pages.finance.balanceSheets.detail.tab.statistics' }) },
        ]}
        activeTabKey={chartType}
        onTabChange={(key) => setChartType(key as BalanceDetailChartType)}
        style={{ marginBottom: 24 }}
      >
        {chartType === 'aggregation' ? (
          // Use ProTable ghost directly — no nested PageTable/ProCard structure that would
          // interfere with the parent Card's tab-bar border-bottom.
          <>
            {/* Dimension selector sits inside the Card's natural 24px padding. */}
            <div style={{ marginBottom: 12 }}>{dimensionSelector}</div>
            <div>
              <ProTable<AggTreeNode>
                ghost
                search={false}
                options={false}
                pagination={false}
                rowKey="key"
                columns={aggTableColumns}
                dataSource={treeWithRoot}
                expandable={{
                  expandedRowKeys: expandedKeys,
                  onExpand: (expanded, record) => {
                    setExpandedKeys((prev) =>
                      expanded
                        ? [...prev, record.key as React.Key]
                        : prev.filter((k) => k !== record.key),
                    );
                  },
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
          </>
        ) : isPieEmpty ? (
          <Typography.Text type="secondary">{emptyPieMsg}</Typography.Text>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <ReactECharts option={pieOption} style={{ height: 360, width: '100%', minWidth: 480 }} opts={{ renderer: 'svg' }} notMerge />
          </div>
        )}
      </Card>

      <PageTable<Balance>
        pageTitle={t({ id: 'pages.finance.balanceSheets.detail.title' })}
        action={
          <Button
            type="primary"
            icon={<EditOutlined />}
            href={`/finance/balance-sheets/${id}/edit`}
            onClick={(e) => { e.preventDefault(); navigate(`/finance/balance-sheets/${id}/edit`); }}
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
