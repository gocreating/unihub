/** Padding for header text (sort icon + cell padding). */
const HEADER_PAD = 44;
/** Padding for body cell text. */
const CELL_PAD = 24;

// ─── Canvas-based text measurement ────────────────────────────────────────
// A single off-screen canvas is reused across all measurements. The font
// string must match Ant Design 5's table cell font (14px, same stack).

let _ctx: CanvasRenderingContext2D | null | undefined;

function getCanvasCtx(): CanvasRenderingContext2D | null {
  if (_ctx !== undefined) return _ctx;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Ant Design 5 default body font — matches table cell rendering
      ctx.font =
        '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    }
    _ctx = ctx;
  } catch {
    _ctx = null;
  }
  return _ctx ?? null;
}

/**
 * Measures text pixel width using the Canvas 2D API so that character metrics
 * (including CJK, mixed scripts, variable-width glyphs) match the browser's
 * actual font rendering.  Falls back to a character-count approximation in
 * environments where Canvas is unavailable (e.g. test / SSR).
 */
function canvasMeasure(text: string): number {
  const ctx = getCanvasCtx();
  if (ctx) return ctx.measureText(text).width;
  // Fallback: approximate — 8px Latin, 14px CJK (used in tests / jsdom)
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isWide =
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0x9FFF) ||
      (code >= 0xAC00 && code <= 0xD7AF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFF01 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6);
    w += isWide ? 14 : 8;
  }
  return w;
}

/** Compute minimum column width from header text. Returns `{ width: px }`. */
export function widthForHeader(text: string, floor = 0): { width: number } {
  return { width: Math.max(floor, Math.ceil(canvasMeasure(text) + HEADER_PAD)) };
}

/** Measure the pixel width a text value needs in a table cell. */
export function measureTextWidth(text: string | null | undefined, extra = 0): number {
  if (!text) return 0;
  return Math.ceil(canvasMeasure(text) + CELL_PAD + extra);
}

/** Compute scroll.x from column widths. Use with `useMemo`. */
export function computeScrollX(columns: readonly { width?: unknown }[], fallback = 100): number {
  return columns.reduce((sum, col) => sum + ((col.width as number) || fallback), 0);
}

/**
 * Like computeScrollX but ensures horizontal overflow when any column is fixed
 * (sticky left/right). AntD's fixed column only sticks when the table scrolls;
 * without overflow the pin has no visual effect. 9999 covers any typical viewport.
 */
export function computeStickyScrollX(
  columns: readonly { width?: unknown }[],
  hasFixed: boolean,
  minOverflow = 9999,
): number {
  const natural = computeScrollX(columns);
  return hasFixed ? Math.max(natural, minOverflow) : natural;
}


/** Style for two-line cells (name + @username pattern). */
export const twoLineCellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  lineHeight: '20px',
};

/**
 * Of several candidate lines, the one that renders widest. Used by two-row
 * cells whose measured width is max(primary, secondary) — keeps pages out of
 * the measurement business (constitution v1.26.0) while still letting them
 * declare which text a cell draws.
 */
export function widestText(lines: readonly string[]): string {
  return lines.reduce((a, b) => (canvasMeasure(b) > canvasMeasure(a) ? b : a), '');
}
