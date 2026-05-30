import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Modal, Select, Segmented, Space, Spin, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { ProColumns } from '@ant-design/pro-components';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import type { BalanceSheet } from '@/services/unihub-backend/finance';
import {
  deleteBalanceSheet,
  listBalances,
  listBalanceSheets,
  listCurrencies,
  listExchangeRates,
} from '@/services/unihub-backend/finance';
import { computeNetWorthInBase, formatAmount, getCurrencySymbol } from '@/utils/finance';
import { classifyAccountStacks, computeGreenRedSeries } from '@/utils/chartData';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

type BalanceListChartType = 'net-worth-trend' | 'stacked-breakdown';

const CARD_TITLE_STYLE: React.CSSProperties = { margin: 0 };

// ECharts v6 default color palette — must match what the chart instance uses
// so custom legend dots show the correct colors.
// 40-color palette covering the full hue wheel — enough for large account lists.
const ECHARTS_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48cae4',
  '#06d6a0', '#ef233c', '#4cc9f0', '#b5179e', '#f77f00',
  '#023e8a', '#2dc653', '#ff4d6d', '#118ab2', '#e9c46a',
  '#264653', '#2a9d8f', '#e76f51', '#457b9d', '#e63946',
  '#52b788', '#d62828', '#ffb703', '#fb8500', '#219ebc',
  '#00b4d8', '#126782', '#8ecae6', '#ffca3a', '#6d28d9',
  '#ff595e', '#1982c4', '#8ac926', '#c77dff', '#f4a261',
];

interface NetWorthDataPoint {
  date: string;
  netWorth: number;
}

interface StackedDataPoint {
  date: string;
  accountName: string;
  amount: number;
}

export function BalanceSheetsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();

  const [chartType, setChartType] = useState<BalanceListChartType>('net-worth-trend');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  // Accounts excluded from the net worth calculation in the trend chart.
  const [excludedFromNetWorth, setExcludedFromNetWorth] = useState<Set<string>>(new Set());
  const lineChartRef = useRef<ReactECharts>(null);
  const stackedChartRef = useRef<ReactECharts>(null);

  // Reset legend state and clear ghost rendering when switching chart types.
  useEffect(() => {
    setHiddenSeries(new Set());
    setExcludedFromNetWorth(new Set());
  }, [chartType]);

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets'],
    queryFn: () => listBalanceSheets(),
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

  const balanceQueries = useQueries({
    queries: sheets.map((sheet) => ({
      queryKey: ['finance', 'balance-sheets', sheet.id, 'balances'] as const,
      queryFn: () => listBalances(sheet.id),
    })),
  });

  const allBalancesLoading = balanceQueries.some((q) => q.isLoading);
  const anyBalanceError = balanceQueries.find((q) => q.isError);

  useEffect(() => {
    if (anyBalanceError) message.error(t({ id: 'pages.finance.balanceSheets.deleteError' }));
  }, [anyBalanceError, t]);

  const netWorthData = useMemo<NetWorthDataPoint[]>(() => {
    return sheets
      .map((sheet, i) => {
        // Filter accounts excluded from the net worth calculation via the legend pills.
        const sheetBalances = (balanceQueries[i]?.data ?? [])
          .filter((b) => !excludedFromNetWorth.has(b.account_name));
        const netWorth = baseCurrency
          ? sheetBalances.reduce((sum, b) => {
              const nwv = computeNetWorthInBase(b.amount, b.currency, baseCurrency, rates, sheet.date);
              return nwv ? sum.plus(nwv) : sum;
            }, new Decimal(0)).toNumber()
          : sheetBalances.reduce((sum, b) => sum.plus(b.amount), new Decimal(0)).toNumber();
        return { date: dayjs(sheet.date).format('YYYY-MM-DD'), netWorth };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sheets, balanceQueries, baseCurrency, rates, excludedFromNetWorth]);

  const stackedData = useMemo<StackedDataPoint[]>(() => {
    return sheets
      .flatMap((sheet, i) => {
        const sheetBalances = balanceQueries[i]?.data ?? [];
        return sheetBalances.flatMap((b) => {
          let amount: number;
          if (baseCurrency) {
            const nwv = computeNetWorthInBase(b.amount, b.currency, baseCurrency, rates, sheet.date);
            if (nwv === null) return []; // no rate available — exclude from stacking
            amount = nwv.toNumber();
          } else {
            amount = parseFloat(b.amount);
          }
          return [{ date: dayjs(sheet.date).format('YYYY-MM-DD'), accountName: b.account_name, amount }];
        });
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sheets, balanceQueries, baseCurrency, rates]);

  // Stable account list for custom legend (derived from stackedData).
  const stackedAccounts = useMemo(
    () => [...new Set(stackedData.map((d) => d.accountName))],
    [stackedData],
  );

  // ── ECharts options ───────────────────────────────────────────────────────

  /** Integer tick formatter — no decimal places. */
  const formatTick = (v: number): string =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);

  /** Right-aligned tooltip row (pre-formatted value string). */
  const tooltipRow = (marker: string, name: string, formattedValue: string): string =>
    `<tr>` +
    `<td style="padding:2px 20px 2px 0;white-space:nowrap">${marker}${name}</td>` +
    `<td style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap">${formattedValue}</td>` +
    `</tr>`;

  const lineOption = useMemo((): EChartsOption => {
    const nwLabel = t({ id: 'pages.finance.balanceSheets.visualization.netWorth' });
    const nwNegKey = `${nwLabel}__neg`; // internal key for the red series
    const sym = getCurrencySymbol(baseCurrency ?? '');
    const fmtVal = (v: number) => sym ? `${sym} ${formatAmount(String(v))}` : formatAmount(String(v));

    // Two-series approach: green series for values ≥ 0, red series for values < 0.
    // At sign-change boundaries both series share a `0` so the line appears continuous.
    const values = netWorthData.map((d) => d.netWorth);
    const { greenVals, redVals } = computeGreenRedSeries(values);

    return {
      legend: { show: false },
      tooltip: {
        trigger: 'axis',
        // appendToBody escapes overflow-x:auto containers that clip the tooltip vertically.
        appendToBody: true,
        axisPointer: { animation: false },
        // Position right (or left) of cursor so tooltip never overlaps the axis pointer.
        position: (point, _p, _dom, _rect, size) => {
          const [x, y] = point as [number, number];
          const [tw = 0, th = 0] = (size as { contentSize: number[] }).contentSize;
          const OFFSET = 20;
          const tx = x + OFFSET + tw > window.innerWidth - 10 ? x - OFFSET - tw : x + OFFSET;
          const ty = Math.max(10, Math.min(y - th / 2, window.innerHeight - th - 10));
          return [tx, ty];
        },
        formatter: (raw) => {
          const params = raw as unknown as { axisValueLabel: string; value: number | null; marker: string }[];
          if (!params.length || !params[0]) return '';
          const date = params[0].axisValueLabel;
          const actual = params.reduce((best, p) => {
            const v = (p.value as number | null) ?? 0;
            return Math.abs(v) > Math.abs(best) ? v : best;
          }, 0);
          const dot = `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background:${actual >= 0 ? '#52c41a' : '#ff4d4f'}"></span>`;
          return `<b>${date}</b><table style="margin-top:6px;border-spacing:0">${tooltipRow(dot, nwLabel, fmtVal(actual))}</table>`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '4%', containLabel: true },
      xAxis: {
        type: 'category',
        data: netWorthData.map((d) => d.date),
        axisLabel: { rotate: netWorthData.length > 6 ? 30 : 0 },
      },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => sym ? `${sym} ${formatTick(v)}` : formatTick(v) } },
      series: [
        {
          name: nwLabel,
          type: 'line',
          // Per-item symbol: show a circle only at real positive values (> 0).
          // Boundary zeros shared with the red series get symbol:'none' so there
          // is exactly ONE visible dot per x position — no overlapping dots.
          data: greenVals.map((v) => ({
            value: v,
            symbol: v !== null && v > 0 ? 'circle' : 'none',
            symbolSize: 6,
            itemStyle: { color: '#52c41a' },
          })),
          lineStyle: { color: '#52c41a' },
          itemStyle: { color: '#52c41a' },
          areaStyle: { color: 'rgba(82,196,26,0.18)' },
          connectNulls: false,
          smooth: 0.3,
        },
        {
          name: nwNegKey,
          type: 'line',
          // Boundary zeros shared with green series get symbol:'none'.
          data: redVals.map((v) => ({
            value: v,
            symbol: v !== null && v < 0 ? 'circle' : 'none',
            symbolSize: 6,
            itemStyle: { color: '#ff4d4f' },
          })),
          lineStyle: { color: '#ff4d4f' },
          itemStyle: { color: '#ff4d4f' },
          areaStyle: { color: 'rgba(255,77,79,0.18)' },
          connectNulls: false,
          smooth: 0.3,
        },
      ],
    };
  }, [netWorthData, baseCurrency, t]);

  const stackedOption = useMemo((): EChartsOption => {
    const dates = [...new Set(stackedData.map((d) => d.date))].sort();
    const sym = getCurrencySymbol(baseCurrency ?? '');
    const fmtVal = (v: number) => sym ? `${sym} ${formatAmount(String(v))}` : formatAmount(String(v));

    // Classify each account into 'assets' or 'debts' stacking group.
    const stackGroups = classifyAccountStacks(stackedData, stackedAccounts);

    const series = stackedAccounts.map((acc) => ({
      name: acc,
      type: 'line' as const,
      stack: stackGroups.get(acc) ?? 'assets',
      smooth: 0.3,
      symbol: 'none',
      areaStyle: { opacity: 0.55 },
      emphasis: { focus: 'series' as const },
      data: dates.map((date) => {
        const entry = stackedData.find((d) => d.date === date && d.accountName === acc);
        return entry?.amount ?? 0;
      }),
    }));

    return {
      color: ECHARTS_COLORS,
      legend: { show: false },
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        axisPointer: { animation: false },
        position: (point, _p, _dom, _rect, size) => {
          const [x, y] = point as [number, number];
          const [tw = 0, th = 0] = (size as { contentSize: number[] }).contentSize;
          const OFFSET = 20;
          const tx = x + OFFSET + tw > window.innerWidth - 10 ? x - OFFSET - tw : x + OFFSET;
          const ty = Math.max(10, Math.min(y - th / 2, window.innerHeight - th - 10));
          return [tx, ty];
        },
        // Limit items to avoid overflowing the viewport; sort by |value| desc.
        formatter: (raw) => {
          const params = raw as unknown as { axisValueLabel: string; seriesName: string; value: number; marker: string }[];
          const date = params[0]?.axisValueLabel ?? '';
          const nonZero = [...params]
            .filter((p) => p.value !== 0)
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
          const MAX_ROWS = 8;
          const shown = nonZero.slice(0, MAX_ROWS);
          const rest = nonZero.length - shown.length;
          const rows = shown.map((p) => tooltipRow(p.marker, p.seriesName, fmtVal(p.value))).join('');
          const footer = rest > 0
            ? `<tr><td colspan="2" style="color:#8c8c8c;padding-top:4px;font-size:11px">…and ${rest} more</td></tr>`
            : '';
          return `<b>${date}</b><table style="margin-top:6px;border-spacing:0">${rows}${footer}</table>`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '4%', containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { rotate: dates.length > 6 ? 30 : 0 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: formatTick },
      },
      series,
    };
  }, [stackedData, stackedAccounts, baseCurrency]);

  const sheetNetWorths = useMemo<Record<string, Decimal | null>>(() => {
    if (!baseCurrency) return {};
    return Object.fromEntries(
      sheets.map((sheet, i) => {
        const balances = balanceQueries[i]?.data ?? [];
        const total = balances.reduce((sum, b) => {
          const nwv = computeNetWorthInBase(b.amount, b.currency, baseCurrency, rates, sheet.date);
          return nwv ? sum.plus(nwv) : sum;
        }, new Decimal(0));
        return [sheet.id, total];
      }),
    );
  }, [sheets, balanceQueries, baseCurrency, rates]);

  const deleteMutation = useMutation({
    mutationFn: deleteBalanceSheet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets'] });
      message.success(t({ id: 'pages.finance.balanceSheets.deleted' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.balanceSheets.deleteError' })),
  });

  const actionsColWidth = useActionsColWidth(sheets);

  const dataWidths = useMemo(() => {
    const w = { date: 0 };
    for (const s of sheets) {
      const d = dayjs(s.date);
      w.date = Math.max(w.date, measureTextWidth(`${d.format('YYYY-MM-DD HH:mm')} (${d.fromNow()})`));
    }
    return w;
  }, [sheets]);

  const columns: ProColumns<BalanceSheet>[] = useMemo(
    () => [
      {
        title: t({ id: 'common.date' }),
        dataIndex: 'date',
        ...widthForHeader('Date', Math.max(220, dataWidths.date)),
        sorter: true,
        render: (val) => {
          const d = dayjs(val as string);
          return `${d.format('YYYY-MM-DD HH:mm')} (${d.fromNow()})`;
        },
      },
      ...(baseCurrency
        ? [{
            title: t({ id: 'pages.finance.balanceSheets.col.netWorth' }, { currency: baseCurrency }),
            key: 'net_worth',
            width: 160,
            align: 'right' as const,
            render: (_dom: unknown, record: BalanceSheet) => {
              if (allBalancesLoading) return <Spin size="small" />;
              const nwv = sheetNetWorths[record.id];
              if (!nwv) return <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>;
              return `${getCurrencySymbol(baseCurrency)} ${formatAmount(nwv.toString())}`;
            },
          }]
        : []),
      {
        title: t({ id: 'common.actions' }),
        key: 'actions',
        width: actionsColWidth,
        render: (_, record) => (
          <span data-actions-col>
          <Space>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/finance/balance-sheets/${record.id}`)}
            >
              {t({ id: 'common.view' })}
            </Button>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/finance/balance-sheets/${record.id}/edit`)}
            >
              {t({ id: 'common.edit' })}
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: t({ id: 'pages.finance.balanceSheets.delete.title' }),
                  content: t({ id: 'pages.finance.balanceSheets.delete.confirm' }),
                  okType: 'danger',
                  onOk: () => deleteMutation.mutate(record.id),
                });
              }}
            >
              {t({ id: 'common.delete' })}
            </Button>
          </Space>
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, navigate, dataWidths, actionsColWidth, baseCurrency, sheetNetWorths, allBalancesLoading],
  );

  return (
    <>
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
        title={<Typography.Title level={4} style={CARD_TITLE_STYLE}>{t({ id: 'pages.finance.balanceSheets.visualization.title' })}</Typography.Title>}
        style={{ marginBottom: 24 }}
      >
        {sheets.length === 0 ? (
          <Typography.Text type="secondary">
            {t({ id: 'pages.finance.balanceSheets.visualization.empty' })}
          </Typography.Text>
        ) : (
          <>
            <Segmented
              value={chartType}
              onChange={(v) => setChartType(v as BalanceListChartType)}
              options={[
                { label: t({ id: 'pages.finance.balanceSheets.visualization.netWorthTrend' }), value: 'net-worth-trend' },
                { label: t({ id: 'pages.finance.balanceSheets.visualization.stackedBreakdown' }), value: 'stacked-breakdown' },
              ]}
              style={{ marginBottom: 16 }}
            />
            {allBalancesLoading ? (
              <Spin />
            ) : chartType === 'net-worth-trend' ? (
              <>
                {/* key forces fresh mount/unmount when switching, clearing ghost renders */}
                <div style={{ overflowX: 'auto' }}>
                  <ReactECharts
                    key="net-worth-trend"
                    ref={lineChartRef}
                    option={lineOption}
                    style={{ height: 640, width: '100%', minWidth: 600 }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>
                {/* Per-account legend — click to exclude/include an account from the net worth total */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingInline: 4 }}>
                  {stackedAccounts.map((acc, i) => {
                    const color = ECHARTS_COLORS[i % ECHARTS_COLORS.length]!;
                    const excluded = excludedFromNetWorth.has(acc);
                    return (
                      <button
                        key={acc}
                        onClick={() =>
                          setExcludedFromNetWorth((prev) => {
                            const next = new Set(prev);
                            if (next.has(acc)) next.delete(acc); else next.add(acc);
                            return next;
                          })
                        }
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px',
                          border: `1px solid ${excluded ? '#e0e0e0' : color}`,
                          borderRadius: 12, cursor: 'pointer',
                          background: excluded ? '#fff' : `${color}1a`,
                          fontSize: 12, color: excluded ? '#bfbfbf' : 'inherit',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: excluded ? '#d9d9d9' : color }} />
                        {excluded ? <s>{acc}</s> : acc}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <ReactECharts
                    key="stacked-breakdown"
                    ref={stackedChartRef}
                    option={stackedOption}
                    style={{ height: 640, width: '100%', minWidth: 600 }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>
                {/* Per-account legend — click to toggle, hover to highlight area in chart */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingInline: 4 }}>
                  {stackedAccounts.map((acc, i) => {
                    const color = ECHARTS_COLORS[i % ECHARTS_COLORS.length]!;
                    const hidden = hiddenSeries.has(acc);
                    return (
                      <button
                        key={acc}
                        onClick={() => {
                          stackedChartRef.current?.getEchartsInstance().dispatchAction({
                            type: 'legendToggleSelect',
                            name: acc,
                          });
                          setHiddenSeries((prev) => {
                            const next = new Set(prev);
                            if (next.has(acc)) next.delete(acc); else next.add(acc);
                            return next;
                          });
                        }}
                        onMouseEnter={() =>
                          stackedChartRef.current?.getEchartsInstance().dispatchAction({
                            type: 'highlight',
                            seriesName: acc,
                          })
                        }
                        onMouseLeave={() =>
                          stackedChartRef.current?.getEchartsInstance().dispatchAction({
                            type: 'downplay',
                            seriesName: acc,
                          })
                        }
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px',
                          // Active: colored fill; Hidden: white background
                          border: `1px solid ${hidden ? '#e0e0e0' : color}`,
                          borderRadius: 12,
                          cursor: 'pointer',
                          background: hidden ? '#fff' : `${color}1a`,
                          fontSize: 12,
                          color: hidden ? '#bfbfbf' : 'inherit',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: hidden ? '#d9d9d9' : color,
                        }} />
                        {hidden ? <s>{acc}</s> : acc}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </Card>

      <PageTable<BalanceSheet>
        pageTitle={t({ id: 'pages.finance.balanceSheets.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/finance/balance-sheets/new')}>
            {t({ id: 'pages.finance.balanceSheets.new' })}
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={sheets}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />
    </>
  );
}
