/** Approximate pixels per character for table content. */
const CHAR_PX = 8;
/** Padding for header text (sort icon + cell padding). */
const HEADER_PAD = 44;
/** Padding for body cell text. */
const CELL_PAD = 24;

/** Compute minimum column width from header text. Returns `{ width: px }`. */
export function widthForHeader(text: string, floor = 0): { width: number } {
  return { width: Math.max(floor, Math.ceil(text.length * CHAR_PX + HEADER_PAD)) };
}

/** Measure the pixel width a text value needs in a table cell. */
export function measureTextWidth(text: string | null | undefined, extra = 0): number {
  if (!text) return 0;
  return Math.ceil(text.length * CHAR_PX + CELL_PAD + extra);
}

/** Compute scroll.x from column widths. Use with `useMemo`. */
export function computeScrollX(columns: readonly { width?: unknown }[], fallback = 100): number {
  return columns.reduce((sum, col) => sum + ((col.width as number) || fallback), 0);
}

/** Style for two-line cells (name + @username pattern). */
export const twoLineCellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  lineHeight: '20px',
};
