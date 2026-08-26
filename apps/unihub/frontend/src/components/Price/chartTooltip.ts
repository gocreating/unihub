/**
 * The ONE chart tooltip for the finance domain (FR-053, research I9-3).
 *
 * Lifted from the Balance Sheets list, which had the format right and copied
 * it three times: a bold date title, then a two-column table — series marker
 * and name on the left, the value right-aligned in tabular figures — pinned
 * beside the active x value inside the chart container rather than trailing
 * the cursor (Principle XI's tooltip positioning rule).
 *
 * Pure and React-free, like the normalizers beside it: every VALUE a caller
 * passes in must already be a `formatMoney` string, so the tooltip can never
 * disagree with a table cell (Principle XIII).
 */
import type { TooltipComponentOption } from 'echarts';

export interface ChartTooltipRow {
  /** HTML for the series marker — `seriesMarker(color)` or ECharts' own `params.marker`. */
  marker: string;
  name: string;
  /** Already formatted by the normalizers, e.g. `− NT$ 1,234`. */
  value: string;
}

/** The 10px dot ECharts draws for a series, in a colour the caller chooses. */
export function seriesMarker(color: string): string {
  return (
    '<span style="display:inline-block;margin-right:4px;border-radius:50%;' +
    `width:10px;height:10px;background:${color}"></span>`
  );
}

function tooltipRow({ marker, name, value }: ChartTooltipRow): string {
  return (
    '<tr>' +
    `<td style="padding:2px 20px 2px 0;white-space:nowrap">${marker}${name}</td>` +
    `<td style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap">${value}</td>` +
    '</tr>'
  );
}

/** Title (usually the date) plus one row per series; title alone when there are none. */
export function chartTooltipHtml(title: string, rows: readonly ChartTooltipRow[]): string {
  const head = `<b>${title}</b>`;
  if (rows.length === 0) return head;
  return `${head}<table style="margin-top:6px;border-spacing:0">${rows.map(tooltipRow).join('')}</table>`;
}

/**
 * Axis-trigger tooltip pinned to the active x value. Callers add `formatter`.
 *
 * With `appendToBody: true`, `point[0]` and the returned `[x, y]` are both
 * CHART-CONTAINER-relative, so the flip decision compares against
 * `size.viewSize[0]` (the container width), never `window.innerWidth` — the
 * latter was the root cause of the balance-sheets overflow. The box goes to
 * the right of the x point when it fits, otherwise to the left, never past
 * 5px, and the assumed width is capped at `maxWidth` because that is the
 * `max-width` the browser will enforce.
 */
export function pinnedAxisTooltip(maxWidth: number): TooltipComponentOption {
  return {
    trigger: 'axis',
    appendToBody: true,
    extraCssText: `max-width:${maxWidth}px;`,
    axisPointer: { animation: false },
    position: (point, _params, _dom, _rect, size) => {
      const [x] = point as [number, number];
      const sz = size as { contentSize: number[]; viewSize: number[] };
      const [tw = 0] = sz.contentSize;
      const [chartW = 1000] = sz.viewSize;
      const w = tw > 0 ? Math.min(tw, maxWidth) : maxWidth;
      const GAP = 8;
      if (x + GAP + w < chartW - 5) return [x + GAP, 20];
      return [Math.max(5, x - GAP - w), 20];
    },
  };
}
