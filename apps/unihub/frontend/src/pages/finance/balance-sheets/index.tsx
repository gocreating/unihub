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
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

type BalanceListChartType = 'net-worth-trend' | 'stacked-breakdown';

const CARD_TITLE_STYLE: React.CSSProperties = { margin: 0 };

// ECharts v6 default color palette — must match what the chart instance uses
// so custom legend dots show the correct colors.
const ECHARTS_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc',
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
  const lineChartRef = useRef<ReactECharts>(null);
  const stackedChartRef = useRef<ReactECharts>(null);

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
        const sheetBalances = balanceQueries[i]?.data ?? [];
        // Use the same FX-conversion formula as the table column so values match.
        const netWorth = baseCurrency
          ? sheetBalances.reduce((sum, b) => {
              const nwv = computeNetWorthInBase(b.amount, b.currency, baseCurrency, rates, sheet.date);
              return nwv ? sum.plus(nwv) : sum;
            }, new Decimal(0)).toNumber()
          : sheetBalances.reduce((sum, b) => sum.plus(b.amount), new Decimal(0)).toNumber();
        return { date: dayjs(sheet.date).format('YYYY-MM-DD'), netWorth };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sheets, balanceQueries, baseCurrency, rates]);

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
    const sym = getCurrencySymbol(baseCurrency ?? '');
    const fmtVal = (v: number) => sym ? `${sym} ${formatAmount(String(v))}` : formatAmount(String(v));

    // Green/red without visualMap (piecewise visualMap crashes ECharts v6 on 1-D data).
    // Strategy: per-point dot colors via itemStyle.color callback + gradient area fill
    // that transitions from green (positive region) to red (negative region) at y=0.
    const values = netWorthData.map((d) => d.netWorth);
    const maxNW = values.length > 0 ? Math.max(...values, 0) : 1;
    const minNW = values.length > 0 ? Math.min(...values, 0) : -1;
    const totalRange = maxNW - minNW;
    // Fraction (0 = top of chart, 1 = bottom) where y=0 sits in the rendered axis range.
    const zeroFrac = totalRange > 0
      ? Math.max(0.001, Math.min(0.999, maxNW / totalRange))
      : 0.5;
    const currentColor = (values.at(-1) ?? 0) >= 0 ? '#52c41a' : '#ff4d4f';

    return {
      legend: { show: false },
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { animation: false },
        formatter: (raw) => {
          const params = raw as unknown as { axisValueLabel: string; seriesName: string; value: number; marker: string }[];
          const p = params[0];
          if (!p) return '';
          return `<b>${p.axisValueLabel}</b>` +
            `<table style="margin-top:6px;border-spacing:0">` +
            tooltipRow(p.marker, p.seriesName, fmtVal(p.value)) +
            `</table>`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '4%', containLabel: true },
      xAxis: {
        type: 'category',
        data: netWorthData.map((d) => d.date),
        axisLabel: { rotate: netWorthData.length > 6 ? 30 : 0 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: formatTick },
      },
      series: [{
        name: nwLabel,
        type: 'line',
        // Per-point dot colors (works without visualMap).
        data: netWorthData.map((d) => ({
          value: d.netWorth,
          itemStyle: { color: d.netWorth >= 0 ? '#52c41a' : '#ff4d4f' },
        })),
        lineStyle: { color: currentColor },
        // Gradient area: green in positive region, red in negative region.
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0,        color: 'rgba(82,196,26,0.25)' },
              { offset: zeroFrac, color: 'rgba(82,196,26,0.04)' },
              { offset: zeroFrac, color: 'rgba(255,77,79,0.04)' },
              { offset: 1,        color: 'rgba(255,77,79,0.20)' },
            ],
          },
        },
        smooth: 0.3,
        symbol: 'circle',
        symbolSize: 6,
      }],
    };
  }, [netWorthData, baseCurrency, t]);

  const stackedOption = useMemo((): EChartsOption => {
    const dates = [...new Set(stackedData.map((d) => d.date))].sort();
    const sym = getCurrencySymbol(baseCurrency ?? '');
    const fmtVal = (v: number) => sym ? `${sym} ${formatAmount(String(v))}` : formatAmount(String(v));

    // Classify each account by the sign of its total across all dates so that
    // assets and debts stack into separate groups (no visual overlap).
    const accountTotals = new Map<string, number>();
    for (const d of stackedData) {
      accountTotals.set(d.accountName, (accountTotals.get(d.accountName) ?? 0) + d.amount);
    }

    const series = stackedAccounts.map((acc) => {
      const total = accountTotals.get(acc) ?? 0;
      return {
        name: acc,
        type: 'line' as const,
        stack: total >= 0 ? 'assets' : 'debts',
        smooth: 0.3,
        symbol: 'none',
        areaStyle: { opacity: 0.55 },
        emphasis: { focus: 'series' as const },
        data: dates.map((date) => {
          const entry = stackedData.find((d) => d.date === date && d.accountName === acc);
          return entry?.amount ?? 0;
        }),
      };
    });

    return {
      color: ECHARTS_COLORS,
      legend: { show: false },
      tooltip: {
        trigger: 'axis',
        confine: true,
        // Limit items shown to avoid overflowing the viewport; sort by |value| desc.
        axisPointer: { animation: false },
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
                <div style={{ overflowX: 'auto' }}>
                  <ReactECharts
                    ref={lineChartRef}
                    option={lineOption}
                    style={{ height: 720, width: '100%', minWidth: 600 }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>
                {/* Custom legend */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                  <button
                    style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 8px' }}
                    onClick={() => {
                      lineChartRef.current?.getEchartsInstance().dispatchAction({
                        type: 'legendToggleSelect',
                        name: t({ id: 'pages.finance.balanceSheets.visualization.netWorth' }),
                      });
                    }}
                  >
                    <span style={{ display: 'flex', gap: 2 }}>
                      <span style={{ width: 14, height: 3, background: '#52c41a', display: 'inline-block', borderRadius: 2 }} />
                      <span style={{ width: 14, height: 3, background: '#ff4d4f', display: 'inline-block', borderRadius: 2 }} />
                    </span>
                    {t({ id: 'pages.finance.balanceSheets.visualization.netWorth' })}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <ReactECharts
                    ref={stackedChartRef}
                    option={stackedOption}
                    style={{ height: 720, width: '100%', minWidth: 600 }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>
                {/* Custom legend — one pill per account, click to toggle */}
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
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '2px 10px', border: `1px solid ${color}`,
                          borderRadius: 12, cursor: 'pointer', background: 'transparent',
                          fontSize: 12, opacity: hidden ? 0.35 : 1,
                          color: hidden ? '#8c8c8c' : undefined,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        {acc}
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
