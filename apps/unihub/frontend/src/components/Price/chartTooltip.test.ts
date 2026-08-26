import { describe, it, expect } from 'vitest';
import { chartTooltipHtml, pinnedAxisTooltip, seriesMarker } from './chartTooltip';

/**
 * FR-053 / I9-3: ONE tooltip builder for every finance chart — the Balance
 * Sheets format (bold date, marker + name left, tabular value right), pinned
 * to the active x value instead of following the cursor.
 */

type PositionFn = (
  point: number[],
  params: unknown,
  dom: unknown,
  rect: unknown,
  size: { contentSize: number[]; viewSize: number[] },
) => number[];

describe('chartTooltipHtml', () => {
  it('renders a bold title, then one table row per series with the value right-aligned in tabular figures', () => {
    const html = chartTooltipHtml('2026-01-02', [
      { marker: seriesMarker('#cf1322'), name: 'Cost', value: '− NT$ 1,000' },
      { marker: seriesMarker('#3f8600'), name: 'Income', value: '+ NT$ 500' },
    ]);
    expect(html.startsWith('<b>2026-01-02</b>')).toBe(true);
    expect(html.match(/<tr>/g)).toHaveLength(2);
    expect(html).toContain('text-align:right');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('Cost');
    expect(html).toContain('− NT$ 1,000');
    expect(html).toContain('+ NT$ 500');
  });

  it('renders only the title when there are no rows', () => {
    expect(chartTooltipHtml('2026-01-02', [])).toBe('<b>2026-01-02</b>');
  });
});

describe('seriesMarker', () => {
  it('is the 10px dot in the series colour', () => {
    const marker = seriesMarker('#cf1322');
    expect(marker).toContain('background:#cf1322');
    expect(marker).toContain('width:10px');
    expect(marker).toContain('border-radius:50%');
  });
});

describe('pinnedAxisTooltip', () => {
  const tip = pinnedAxisTooltip(320);
  const position = tip.position as unknown as PositionFn;

  it('triggers on the axis, is appended to body, and does not animate the pointer', () => {
    expect(tip.trigger).toBe('axis');
    expect(tip.appendToBody).toBe(true);
    expect((tip.axisPointer as { animation: boolean }).animation).toBe(false);
    expect(tip.extraCssText).toContain('max-width:320px');
  });

  it('places the box right of the x point when it fits inside the chart container', () => {
    expect(position([100, 50], null, null, null, { contentSize: [200, 80], viewSize: [1000, 300] }))
      .toEqual([108, 20]);
  });

  it('flips left when there is no room on the right, never past 5px', () => {
    expect(position([250, 50], null, null, null, { contentSize: [200, 80], viewSize: [300, 200] }))
      .toEqual([42, 20]);
    expect(position([100, 50], null, null, null, { contentSize: [200, 80], viewSize: [300, 200] }))
      .toEqual([5, 20]);
  });

  it('caps the assumed width at the max so a wide box still flips correctly', () => {
    // contentSize wider than the cap: the cap is what is compared, matching
    // the extraCssText max-width the browser will enforce.
    expect(position([900, 50], null, null, null, { contentSize: [900, 80], viewSize: [1000, 300] }))
      .toEqual([572, 20]);
  });
});
