/**
 * Column auto-sizing — owned by PageTable (constitution v1.26.0, Principle VII).
 *
 * Pages used to build a `dataWidths` map by looping their rows and calling
 * `measureTextWidth` per field, then hand the result to `widthForHeader` as a
 * floor. Eleven pages carried eleven copies of that recipe, and the copies
 * drifted precisely where it mattered — at the clamp, and at the truncation
 * that has to accompany a clamp. (The Portfolios description column capped at
 * 280px with untruncated cells rendered 69px three-line rows whose content
 * still overflowed to 356px.)
 *
 * Now a page DECLARES intent on the column:
 *
 *   { dataIndex: 'name', autoWidth: { header: 'Name', max: 280 } }
 *
 * and PageTable does the measuring, the clamping and the scroll.x total.
 */
import { measureTextWidth, widthForHeader } from './utils';

export interface AutoWidthSpec<T = Record<string, unknown>> {
  /**
   * Header text to measure. Explicit because `makeSortProps` builds `title` as
   * a ReactNode (label + sort carets), so the string is not recoverable from
   * the column itself.
   */
  header: string;
  /**
   * Text the CELL actually renders, when it differs from the raw field —
   * formatted amounts, composed cells, tag labels. Declaring what you draw is
   * intent; looping rows to accumulate widths is what the constitution forbids.
   */
  measure?: (record: T) => string | null | undefined;
  min?: number;
  max?: number;
}

// Structural: avoids depending on ProColumns here (and on its generics), which
// keeps this module unit-testable without a table.
interface SizableColumn<T> {
  dataIndex?: unknown;
  width?: unknown;
  autoWidth?: AutoWidthSpec<T>;
  [key: string]: unknown;
}

function cellText<T>(record: T, col: SizableColumn<T>): string | null | undefined {
  if (col.autoWidth?.measure) return col.autoWidth.measure(record);
  const key = col.dataIndex;
  if (typeof key !== 'string' && typeof key !== 'number') return undefined;
  const value = (record as Record<string, unknown>)[key as string];
  if (value == null) return undefined;
  return typeof value === 'string' ? value : String(value);
}

/**
 * Returns the columns with every `autoWidth` column resolved to a concrete
 * `width`, and the `autoWidth` marker stripped so it never reaches the DOM.
 * Columns carrying an explicit `width`, or neither, are passed through.
 */
export function resolveAutoWidths<T>(
  columns: readonly SizableColumn<T>[],
  rows: readonly T[],
): SizableColumn<T>[] {
  return columns.map((col) => {
    const spec = col.autoWidth;
    if (!spec) return col;

    const { autoWidth: _drop, ...rest } = col;
    void _drop;

    let width = widthForHeader(spec.header).width;
    const visit = (list: readonly T[]) => {
      for (const row of list) {
        const text = cellText(row, col);
        if (text) {
          const w = measureTextWidth(text);
          if (w > width) width = w;
        }
        // Tree tables (catalog, transactions) render children as real rows in
        // the same columns — they must be measured too, or a child's longer
        // content is clipped by a width computed from parents alone.
        const kids = (row as { children?: readonly T[] } | null)?.children;
        if (Array.isArray(kids) && kids.length) visit(kids);
      }
    };
    visit(rows);
    if (spec.min != null) width = Math.max(width, spec.min);
    if (spec.max != null) width = Math.min(width, spec.max);

    // FR-052 / I9-1: a column that declares its header text can never render
    // a blank header. The text already lives on the spec; only a column that
    // set no `title` of its own (e.g. one without `makeSortProps`) gets it.
    const title = rest.title === undefined ? spec.header : rest.title;
    return { ...rest, title, width };
  });
}
