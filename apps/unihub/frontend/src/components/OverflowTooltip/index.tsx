import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Tooltip } from 'antd';

export interface OverflowTooltipProps {
  /** Tooltip content — shown ONLY when the text is actually truncated. */
  title: ReactNode;
  /** Extra styles merged onto the truncating span (e.g. a max-width). */
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

// Truncation-gated tooltip (constitution v1.20.0, Principle VI): renders its
// children in an ellipsising span and attaches the tooltip only when the
// content actually overflows — a tooltip repeating fully visible text is
// redundant noise. Overflow is measured on mount and re-checked on hover so
// layout changes after mount are picked up.
export function OverflowTooltip({ title, style, className, children }: OverflowTooltipProps) {
  const [truncated, setTruncated] = useState(false);

  const check = (node: HTMLElement | null) => {
    if (node) setTruncated(node.scrollWidth > node.clientWidth);
  };
  const measureRef = useCallback((node: HTMLSpanElement | null) => check(node), []);

  // A single stable Tooltip wrapper whose title blanks out when the content
  // fits — AntD renders no popup at all for an empty title, so fully visible
  // text never gets a tooltip, and the first hover over truncated text works.
  return (
    <Tooltip title={truncated ? title : ''}>
      <span
        ref={measureRef}
        className={className}
        onMouseEnter={(e) => check(e.currentTarget)}
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          verticalAlign: 'bottom',
          ...style,
        }}
      >
        {children}
      </span>
    </Tooltip>
  );
}
