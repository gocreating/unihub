import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Checkbox, Modal, Select, Segmented, Space, Spin, Typography, message } from 'antd';
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
import { classifyAccountStacks } from '@/utils/chartData';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

type BalanceListChartType = 'net-worth-trend' | 'stacked-breakdown';

const CARD_TITLE_STYLE: React.CSSProperties = { margin: 0 };

// ECharts v6 default color palette — must match what the chart instance uses
// so custom legend dots show the correct colors.
// 36-color palette: enough to cover 35+ accounts without repeating.
// Chosen to maximise perceptual distance — hue jumps ~40° between adjacent
// entries, with alternating dark/medium lightness so similar-hued neighbours
// are still distinguishable by brightness.
const ECHARTS_COLORS = [
  // ── Core 12: primary + secondary + tertiary, highly saturated ──────────
  '#e6194b', // red           0°
  '#f58231', // orange        30°
  '#ffe119', // yellow        60°
  '#3cb44b', // green        120°
  '#42d4f4', // cyan         185°
  '#4363d8', // blue         225°
  '#911eb4', // purple       280°
  '#f032e6', // magenta      305°
  '#ff8c00', // dark orange   40°
  '#00b300', // vivid green  120° alt
  '#0099cc', // teal-blue    200°
  '#cc00cc', // dark magenta  300°
  // ── Dark variants: same hue wheel but deeper, offset by ~20° ──────────
  '#800000', // maroon          0° dark
  '#9a6324', // ochre brown     30° dark
  '#808000', // olive           60° dark
  '#006400', // dark green     120° dark
  '#008080', // teal           180° dark
  '#000080', // navy           240° dark
  '#4b0082', // indigo         260° dark
  '#800080', // dark purple    300° dark
  // ── Medium variants: different lightness, wider hue spread ────────────
  '#ff6347', // tomato          10°
  '#ffd700', // gold            50°
  '#7fff00', // chartreuse      90°
  '#20b2aa', // light sea green 175°
  '#1e90ff', // dodger blue    210°
  '#6a5acd', // slate blue     248°
  '#ff69b4', // hot pink       330°
  '#dc143c', // crimson        348°
  // ── Earthy / neutral fills ─────────────────────────────────────────────
  '#8b4513', // saddle brown
  '#d2691e', // chocolate
  '#a0522d', // sienna
  '#556b2f', // dark olive
  '#2e8b57', // sea green
  '#4682b4', // steel blue
  '#708090', // slate gray
  '#b8860b', // dark goldenrod
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
        axisPointer: {
          animation: false,
          lineStyle: { color: '#555', width: 2, type: 'solid' },
        },
        // Tooltip tracks the focused x-axis data point horizontally but stays at
        // Tooltip tracks the focused x-axis DATA POINT position, not the mouse cursor.
        // point[0] for a time axis is the raw cursor viewport x; we convert the
        // focused data point's timestamp via chart.convertToPixel instead.
        // Fixed y keeps the tooltip stable regardless of vertical mouse movement.
        position: (point, params, _dom, _rect, size) => {
          const rawParams = params as unknown as Array<{ value?: unknown }>;
          const firstValue = rawParams[0]?.value;
          const ts = Array.isArray(firstValue) ? (firstValue[0] as number) : undefined;
          const [tw = 0] = (size as { contentSize: number[] }).contentSize;
          const OFFSET = 20;
          // 600px fallback ensures the right-edge flip fires even before contentSize
          // is computed (tw = 0 on first hover). A smaller estimate would let the
          // tooltip overflow the viewport right edge on first render near the right.
          const estW = tw > 0 ? tw : 600;
          // Default: cursor x; override with the data point's actual screen position.
          let snapX = (point as [number, number])[0];
          if (ts !== undefined) {
            const inst = lineChartRef.current?.getEchartsInstance();
            if (inst) {
              const px = inst.convertToPixel({ xAxisIndex: 0 }, ts);
              if (typeof px === 'number') {
                const domRect = inst.getDom()?.getBoundingClientRect();
                if (domRect) snapX = domRect.left + px;
              }
            }
          }
          const toRight = snapX + OFFSET;
          const toLeft = Math.max(10, snapX - OFFSET - estW);
          let tx = toRight + estW > window.innerWidth - 10 ? toLeft : toRight;
          // Hard clamp: guarantee tooltip never overflows the right viewport edge.
          tx = Math.max(10, Math.min(tx, window.innerWidth - estW - 10));
          return [tx, 20];
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
    const series = stackedAccounts.map((acc) => ({
      name: acc,
      type: 'line' as const,
      stack: stackGroups.get(acc) ?? 'assets',
      smooth: 0.3,
      symbol: 'none',
      lineStyle: { width: 0 },
      areaStyle: { opacity: 0.55 },
      emphasis: { focus: 'series' as const },
      data: dates.map((date): [number, number] => {
        const entry = stackedData.find((d) => d.date === date && d.accountName === acc);
        const v = entry?.amount ?? 0;
        // Clip to prevent cross-sign artifacts when an account temporarily switches sign.
        const clipped = stackGroups.get(acc) === 'assets' ? Math.max(v, 0) : Math.min(v, 0);
        return [new Date(date).getTime(), clipped];
      }),
    }));

    return {
      color: ECHARTS_COLORS,
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
        axisPointer: {
          animation: false,
          lineStyle: { color: '#555', width: 2, type: 'solid' },
        },
        // Tooltip tracks the focused x-axis data point horizontally but stays at
        // Same snap-to-data-point logic using stackedChartRef.
        position: (point, params, _dom, _rect, size) => {
          const rawParams = params as unknown as Array<{ value?: unknown }>;
          const firstValue = rawParams[0]?.value;
          const ts = Array.isArray(firstValue) ? (firstValue[0] as number) : undefined;
          const [tw = 0] = (size as { contentSize: number[] }).contentSize;
          const OFFSET = 20;
          const estW = tw > 0 ? tw : 600;
          let snapX = (point as [number, number])[0];
          if (ts !== undefined) {
            const inst = stackedChartRef.current?.getEchartsInstance();
            if (inst) {
              const px = inst.convertToPixel({ xAxisIndex: 0 }, ts);
              if (typeof px === 'number') {
                const domRect = inst.getDom()?.getBoundingClientRect();
                if (domRect) snapX = domRect.left + px;
              }
            }
          }
          const toRight = snapX + OFFSET;
          const toLeft = Math.max(10, snapX - OFFSET - estW);
          let tx = toRight + estW > window.innerWidth - 10 ? toLeft : toRight;
          tx = Math.max(10, Math.min(tx, window.innerWidth - estW - 10));
          return [tx, 20];
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
  }, [stackedData, stackedAccounts, baseCurrency, hiddenSeries]);

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
                    style={{ height: 540, width: '100%', minWidth: 600 }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>
                {/* Select-all / Unselect-all for net worth trend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingInline: 4 }}>
                  <Checkbox
                    indeterminate={excludedFromNetWorth.size > 0 && excludedFromNetWorth.size < stackedAccounts.length}
                    checked={excludedFromNetWorth.size === 0}
                    onChange={(e) =>
                      setExcludedFromNetWorth(e.target.checked ? new Set() : new Set(stackedAccounts))
                    }
                  >
                    Select All
                  </Checkbox>
                </div>
                {/* Per-account legend — neutral colors (account colors are meaningless in the trend view) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingInline: 4 }}>
                  {stackedAccounts.map((acc) => {
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
                          border: '1px solid #d9d9d9',
                          borderRadius: 12, cursor: 'pointer',
                          background: excluded ? '#fff' : '#f5f5f5',
                          fontSize: 12, color: excluded ? '#bfbfbf' : '#595959',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: excluded ? '#d9d9d9' : '#8c8c8c' }} />
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
                {/* Select-all / Unselect-all for balance breakdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingInline: 4 }}>
                  <Checkbox
                    indeterminate={hiddenSeries.size > 0 && hiddenSeries.size < stackedAccounts.length}
                    checked={hiddenSeries.size === 0}
                    onChange={(e) =>
                      setHiddenSeries(e.target.checked ? new Set() : new Set(stackedAccounts))
                    }
                  >
                    Select All
                  </Checkbox>
                </div>
                {/* Per-account legend — click to toggle, hover to highlight area in chart */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingInline: 4 }}>
                  {stackedAccounts.map((acc, i) => {
                    const color = ECHARTS_COLORS[i % ECHARTS_COLORS.length]!;
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
        rowKey="id"
        columns={columns}
        dataSource={sheets}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />
    </>
  );
}
