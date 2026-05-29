import { useState, useEffect } from 'react';

/**
 * Measures the rendered width of the actions column by querying the DOM after
 * data rows appear. Returns the measured width, or undefined until measured.
 *
 * Usage:
 *   1. Mark every actions cell wrapper with `data-actions-col`:
 *        render: () => <span data-actions-col><Space>...</Space></span>
 *   2. Pass the data array as the dependency so measurement re-runs when rows appear:
 *        const actionsColWidth = useActionsColWidth(rows);
 *   3. Use the result as the column width:
 *        { key: 'actions', width: actionsColWidth, ... }
 *
 * When width is undefined the column renders without an explicit width.
 * After the first render with data rows, the hook measures the widest cell and
 * triggers a single re-render with the correct explicit width, which in turn
 * updates scroll.x via computeScrollX.
 */
export function useActionsColWidth(data: unknown[]): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!data.length) return;

    const cells = document.querySelectorAll<HTMLElement>('[data-actions-col]');
    if (!cells.length) return;

    const max = Array.from(cells).reduce((m, el) => {
      const td = el.closest<HTMLElement>('td');
      // [data-actions-col] is an inline <span>. Inline elements have unreliable
      // scrollWidth. Measure the first child instead — it is the <div.ant-space>
      // which is a block/flex element with correct scrollWidth = button row width.
      const contentEl = (el.firstElementChild as HTMLElement | null) ?? el;
      const contentW = contentEl.scrollWidth;
      // Add the td's horizontal padding explicitly so the column is wide enough
      // to fit [padding | buttons | padding] without clipping.
      const style = td ? window.getComputedStyle(td) : null;
      const hPad = style
        ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        : 0;
      return Math.max(m, contentW + hPad);
    }, 0);

    if (max > 0) setWidth(max);
  }, [data]);

  return width;
}
