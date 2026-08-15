/**
 * ClampedText — the two-line cell (constitution v1.26.0, Principle VI).
 *
 * A table cell whose text can exceed its column MUST render at most two lines,
 * ellipsise the rest, and expose the full value through a tooltip that appears
 * ONLY when the text is actually truncated.
 *
 * Why this exists next to `<OverflowTooltip>` rather than inside it: overflow
 * detection differs. A single-line ellipsis overflows horizontally
 * (`scrollWidth > clientWidth`); a two-line clamp overflows VERTICALLY, and the
 * clamped box reports equal scroll/client widths — so the single-line check
 * silently never fires. This component compares `scrollHeight` to
 * `clientHeight`. `OverflowTooltip` remains the primitive for genuinely
 * single-line cells.
 *
 * The failure that motivated the rule: the Portfolios description column was
 * capped at 280px while its cell rendered plain text, producing 69px
 * three-line rows whose content still overflowed to 356px. A max-width without
 * truncation is not a narrower column, it is a taller row.
 */
import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Tooltip } from 'antd';

export interface ClampedTextProps {
  /** Full text — also the tooltip content when truncated. */
  text: string;
  /** Maximum lines before ellipsis. Two is the constitutional ceiling. */
  lines?: number;
  /** Rendered content, when it differs from the raw text (e.g. <SearchMark />). */
  children?: ReactNode;
  style?: CSSProperties;
}

export function ClampedText({ text, lines = 2, children, style }: ClampedTextProps) {
  const [truncated, setTruncated] = useState(false);

  // Vertical overflow: a clamped box scrolls in height, never in width.
  const check = (node: HTMLElement | null) => {
    if (node) setTruncated(node.scrollHeight > node.clientHeight + 1);
  };
  const measureRef = useCallback((node: HTMLSpanElement | null) => check(node), []);

  return (
    <Tooltip title={truncated ? text : ''}>
      <span
        ref={measureRef}
        onMouseEnter={(e) => check(e.currentTarget)}
        style={{
          display: '-webkit-box',
          WebkitLineClamp: lines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          // PageTable sets `white-space: nowrap` on every cell; a clamp needs
          // wrapping to have a second line to clamp to.
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          ...style,
        }}
      >
        {children ?? text}
      </span>
    </Tooltip>
  );
}
