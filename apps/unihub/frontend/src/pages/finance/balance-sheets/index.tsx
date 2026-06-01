import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Modal, Select, Space, Spin, Typography, message } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, EyeOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { ProColumns } from '@ant-design/pro-components';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import { EntityOffsetFooter } from '@/components/EntityToolbar';
import type { BalanceSheet } from '@/services/unihub-backend/finance';
import {
  deleteBalanceSheet,
  listBalances,
  listBalanceSheets,
  listCurrencies,
  listExchangeRates,
} from '@/services/unihub-backend/finance';
import { computeNetWorthInBase, formatAmount, getCurrencySymbol } from '@/utils/finance';
import { classifyAccountStacks, ECHARTS_COLORS, resolveAccountColor } from '@/utils/chartData';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

type BalanceListChartType = 'net-worth-trend' | 'stacked-breakdown';


// ECharts v6 default color palette — must match what the chart instance uses
// so custom legend dots show the correct colors.
// 36-color palette: enough to cover 35+ accounts without repeating.
// ECHARTS_COLORS is now exported from @/utils/chartData (shared with resolveAccountColor).

interface NetWorthDataPoint {
  date: string;
  netWorth: number;
}

interface StackedDataPoint {
  date: string;
  accountName: string;
  amount: number;
  color: string;  // account's custom color (may be empty string)
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

  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const { data: sheetsData, isLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets', limit, offset],
    queryFn: () => listBalanceSheets({ limit, offset, ordering: '-date' }),
  });
  const sheets = useMemo(() => sheetsData?.results ?? [], [sheetsData]);

  const paginationProps = {
    total: sheetsData?.count,
    pageSize: limit,
    current: Math.floor(offset / limit) + 1,
    onChange: (page: number, size: number) => {
      if (size !== limit) { setLimit(size); setOffset(0); }
      else { setOffset((page - 1) * size); }
    },
  };

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
          return [{ date: dayjs(sheet.date).format('YYYY-MM-DD'), accountName: b.account_name, amount, color: b.color || '' }];
        });
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sheets, balanceQueries, baseCurrency, rates]);

  // Stable account list for custom legend (derived from stackedData).
  const stackedAccounts = useMemo(
    () => [...new Set(stackedData.map((d) => d.accountName))],
    [stackedData],
  );

  // Classify each account as 'assets' or 'debts' based on net total across all dates.
  // Used for Equity Curve legend background colors (green = asset majority, red = debt).
  const stackGroups = useMemo(
    () => classifyAccountStacks(stackedData, stackedAccounts),
    [stackedData, stackedAccounts],
  );

  // Account name → custom color map. Falls back to ECHARTS_COLORS by index when empty.
  const accountColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of stackedData) {
      if (d.color && !map.has(d.accountName)) map.set(d.accountName, d.color);
    }
    return map;
  }, [stackedData]);

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

    // ECharts v6.1.0 bug: visualMap.piecewise crashes (reads .coord off an
    // undefined object) regardless of axis type.  Use visualMap.continuous
    // instead — it uses a different rendering path without the bug.
    //
    // Sharp bicolor trick: 50 identical reds + 50 identical greens = 100 stops.
    // With a symmetric axis range [−maxAbs, +maxAbs] the midpoint is exactly
    // y = 0.  100 stops make the red→green transition imperceptibly thin, so
    // the line and area fill visually change color right at y = 0.
    const values = netWorthData.map((d) => d.netWorth);
    const maxAbs = values.length > 0 ? Math.max(...values.map(Math.abs), 1) : 1;
    const SHARP_BICOLOR = [
      ...Array(50).fill('#ff4d4f'),  // red  — net worth < 0 (debt)
      ...Array(50).fill('#52c41a'),  // green — net worth ≥ 0 (asset)
    ];

    // [timestamp, value] format required for time axis (also ensures dimension:1
    // is always valid — not strictly needed for continuous, but kept for clarity).
    const timeData: [number, number][] = netWorthData.map((d) => [
      new Date(d.date).getTime(),
      d.netWorth,
    ]);

    return {
      legend: { show: false },
      visualMap: [{
        show: false,
        type: 'continuous',
        dimension: 1,
        seriesIndex: 0,
        min: -maxAbs,
        max: maxAbs,
        inRange: { color: SHARP_BICOLOR },
      }],
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        extraCssText: 'max-width:320px;',
        axisPointer: { animation: false },
        // With appendToBody:true ECharts provides point[0] in viewport coordinates.
        // Simple rule: place RIGHT if space allows, otherwise LEFT. No convertToPixel
        // needed — point[0] is already the snapped axis position in viewport coords.
        // point[0] and the returned [tx, ty] are both in CHART-CONTAINER-RELATIVE
        // coordinates. ECharts auto-adds the chart's viewport offset when
        // appendToBody:true, so we must compare against size.viewSize[0]
        // (chart container width) — NOT window.innerWidth (viewport width).
        // Using window.innerWidth was the root cause of persistent overflow.
        position: (point, _params, _dom, _rect, size) => {
          const [x] = point as [number, number];
          const sz = size as { contentSize: number[]; viewSize: number[] };
          const [tw = 0] = sz.contentSize;
          const [chartW = 1000] = sz.viewSize; // chart container width, same coords as x
          const MAX_W = 320;
          const w = tw > 0 ? Math.min(tw, MAX_W) : MAX_W;
          const GAP = 8;
          if (x + GAP + w < chartW - 5) {
            return [x + GAP, 20];        // fits right within chart container
          }
          return [Math.max(5, x - GAP - w), 20]; // flip left — guaranteed no overflow
        },
        formatter: (raw) => {
          const params = raw as unknown as { value: [number, number] }[];
          const p = params[0];
          if (!p) return '';
          const [ts, v] = p.value;
          const date = dayjs(ts).format('YYYY-MM-DD');
          const dot = `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background:${v >= 0 ? '#52c41a' : '#ff4d4f'}"></span>`;
          return `<b>${date}</b><table style="margin-top:6px;border-spacing:0">${tooltipRow(dot, nwLabel, fmtVal(v))}</table>`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '4%', containLabel: true },
      xAxis: {
        type: 'time',
        axisLabel: {
          formatter: (val: number) => dayjs(val).format('YYYY-MM-DD'),
          rotate: 30,
        },
      },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => sym ? `${sym} ${formatTick(v)}` : formatTick(v) } },
      series: [{
        name: nwLabel,
        type: 'line',
        data: timeData,
        // areaStyle activates the fill; visualMap controls its color per segment.
        // opacity here sets how transparent the fill is (line stays fully opaque).
        cursor: 'default',
        areaStyle: { opacity: 0.18 },
        smooth: 0.3,
        // Hide the dot at exactly y=0 (natural zero crossings) to keep the line clean.
        symbol: (rawVal: unknown) => ((rawVal as [number, number])[1] !== 0 ? 'circle' : 'none'),
        symbolSize: 6,
      }],
    };
  }, [netWorthData, baseCurrency, t]);

  const stackedOption = useMemo((): EChartsOption => {
    const dates = [...new Set(stackedData.map((d) => d.date))].sort();
    const sym = getCurrencySymbol(baseCurrency ?? '');
    const fmtVal = (v: number) => sym ? `${sym} ${formatAmount(String(v))}` : formatAmount(String(v));

    // Classify each account into 'assets' or 'debts' stacking group.
    const stackGroups = classifyAccountStacks(stackedData, stackedAccounts);

    // Use [timestamp, value] format so the time axis spaces dates by actual
    // elapsed time rather than categorical equal-width slots. This prevents
    // balance sheets that are months apart from appearing as adjacent slots.
    const series = stackedAccounts.map((acc) => {
      const seriesColor = resolveAccountColor(acc, accountColors.get(acc));
      return {
        name: acc,
        type: 'line' as const,
        stack: stackGroups.get(acc) ?? 'assets',
        cursor: 'default',
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { width: 0 },
        // Use the account's custom color (or palette fallback) for the area fill.
        areaStyle: { opacity: 0.55, color: seriesColor },
        itemStyle: { color: seriesColor },
        emphasis: { focus: 'series' as const },
        data: dates.map((date): [number, number] => {
          const entry = stackedData.find((d) => d.date === date && d.accountName === acc);
          const v = entry?.amount ?? 0;
          // Clip to prevent cross-sign artifacts when an account temporarily switches sign.
          const clipped = stackGroups.get(acc) === 'assets' ? Math.max(v, 0) : Math.min(v, 0);
          return [new Date(date).getTime(), clipped];
        }),
      };
    });

    return {
      color: [...ECHARTS_COLORS],
      // legend.selected drives which series are visible — kept in sync with React
      // hiddenSeries state so individual toggles and select-all both work without
      // needing separate dispatchAction calls.
      legend: {
        show: false,
        selected: Object.fromEntries(stackedAccounts.map((acc) => [acc, !hiddenSeries.has(acc)])),
      },
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        extraCssText: 'max-width:600px;',
        axisPointer: { animation: false },
        // Same container-relative coordinate fix as the line chart.
        position: (point, _params, _dom, _rect, size) => {
          const [x] = point as [number, number];
          const sz = size as { contentSize: number[]; viewSize: number[] };
          const [tw = 0] = sz.contentSize;
          const [chartW = 1000] = sz.viewSize;
          const MAX_W = 600;
          const w = tw > 0 ? Math.min(tw, MAX_W) : MAX_W;
          const GAP = 8;
          if (x + GAP + w < chartW - 5) {
            return [x + GAP, 20];
          }
          return [Math.max(5, x - GAP - w), 20];
        },
        formatter: (raw) => {
          const params = raw as unknown as { value: [number, number]; seriesName: string; marker: string }[];
          const ts = params[0]?.value?.[0];
          const date = ts ? dayjs(ts).format('YYYY-MM-DD') : '';
          const rows = [...params]
            .filter((p) => p.value[1] !== 0)
            .sort((a, b) => Math.abs(b.value[1]) - Math.abs(a.value[1]))
            .map((p) => tooltipRow(p.marker, p.seriesName, fmtVal(p.value[1])))
            .join('');
          return rows
            ? `<b>${date}</b><table style="margin-top:6px;border-spacing:0">${rows}</table>`
            : `<b>${date}</b>`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '4%', containLabel: true },
      xAxis: {
        type: 'time',
        axisLabel: {
          formatter: (val: number) => dayjs(val).format('YYYY-MM-DD'),
          rotate: 30,
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => sym ? `${sym} ${formatTick(v)}` : formatTick(v) },
      },
      series,
    };
  }, [stackedData, stackedAccounts, baseCurrency, hiddenSeries, accountColors]);

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
        tabList={[
          { key: 'net-worth-trend',   label: 'Equity Curve' },
          { key: 'stacked-breakdown', label: 'Account Trend' },
        ]}
        activeTabKey={chartType}
        onTabChange={(key) => setChartType(key as BalanceListChartType)}
        style={{ marginBottom: 24 }}
      >
        {sheets.length === 0 ? (
          <Typography.Text type="secondary">
            {t({ id: 'pages.finance.balanceSheets.visualization.empty' })}
          </Typography.Text>
        ) : (
          <>
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
                    style={{ height: 540, width: '100%', minWidth: 600 }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>
                {/* Select-all / Unselect-all — styled as a legend pill (same shape as account pills) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingInline: 4 }}>
                  {(() => {
                    const allActive = excludedFromNetWorth.size === 0;
                    const someActive = excludedFromNetWorth.size < stackedAccounts.length;
                    return (
                      <button
                        onClick={() => setExcludedFromNetWorth(allActive ? new Set(stackedAccounts) : new Set())}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', border: 'none', borderRadius: 12, cursor: 'pointer',
                          background: allActive ? '#1677ff' : someActive ? '#69b1ff' : '#e8e8e8',
                          fontSize: 12, color: (allActive || someActive) ? '#fff' : '#bfbfbf',
                          transition: 'all 0.2s',
                        }}
                      >
                        {allActive
                          ? <CheckOutlined style={{ fontSize: 10 }} />
                          : someActive
                          ? <MinusOutlined style={{ fontSize: 10 }} />
                          : <MinusOutlined style={{ fontSize: 10, opacity: 0.4 }} />}
                        All
                      </button>
                    );
                  })()}
                </div>
                {/* Per-account legend — green pill for asset-majority, red for debt-majority */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingInline: 4 }}>
                  {stackedAccounts.map((acc) => {
                    const isAsset = (stackGroups.get(acc) ?? 'assets') === 'assets';
                    const activeColor = isAsset ? '#52c41a' : '#ff4d4f';
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
                          border: 'none',
                          borderRadius: 12, cursor: 'pointer',
                          background: excluded ? '#e8e8e8' : activeColor,
                          fontSize: 12, color: excluded ? '#bfbfbf' : '#fff',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: excluded ? '#bfbfbf' : 'rgba(255,255,255,0.6)' }} />
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
                    style={{ height: 540, width: '100%', minWidth: 600 }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>
                {/* Select-all / Unselect-all — styled as a legend pill (same shape as account pills) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingInline: 4 }}>
                  {(() => {
                    const allActive = hiddenSeries.size === 0;
                    const someActive = hiddenSeries.size < stackedAccounts.length;
                    return (
                      <button
                        onClick={() => setHiddenSeries(allActive ? new Set(stackedAccounts) : new Set())}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', border: 'none', borderRadius: 12, cursor: 'pointer',
                          background: allActive ? '#1677ff' : someActive ? '#69b1ff' : '#e8e8e8',
                          fontSize: 12, color: (allActive || someActive) ? '#fff' : '#bfbfbf',
                          transition: 'all 0.2s',
                        }}
                      >
                        {allActive
                          ? <CheckOutlined style={{ fontSize: 10 }} />
                          : someActive
                          ? <MinusOutlined style={{ fontSize: 10 }} />
                          : <MinusOutlined style={{ fontSize: 10, opacity: 0.4 }} />}
                        All
                      </button>
                    );
                  })()}
                </div>
                {/* Per-account legend — click to toggle, hover to highlight area in chart */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingInline: 4 }}>
                  {stackedAccounts.map((acc) => {
                    const color = resolveAccountColor(acc, accountColors.get(acc));
                    const hidden = hiddenSeries.has(acc);
                    return (
                      <button
                        key={acc}
                        onClick={() =>
                          setHiddenSeries((prev) => {
                            const next = new Set(prev);
                            if (next.has(acc)) next.delete(acc); else next.add(acc);
                            return next;
                          })
                        }
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
                          border: 'none',
                          borderRadius: 12,
                          cursor: 'pointer',
                          // Active: solid chart color as background with white text
                          // Hidden: light gray — removed from both chart and legend
                          background: hidden ? '#e8e8e8' : color,
                          fontSize: 12,
                          color: hidden ? '#bfbfbf' : '#fff',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: hidden ? '#bfbfbf' : 'rgba(255,255,255,0.6)',
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
        footer={() => <EntityOffsetFooter {...paginationProps} pageSizeOptions={[10, 20]} />}
        rowKey="id"
        columns={columns}
        dataSource={sheets}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />
    </>
  );
}
