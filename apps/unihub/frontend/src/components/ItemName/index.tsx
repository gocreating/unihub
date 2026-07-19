import { useCallback, useState } from 'react';
import { Tooltip } from 'antd';
import type { CSSProperties } from 'react';
import { HighlightText } from '@/components/HighlightText';

export interface ItemNameProps {
  item: { name: string; alias_name: string; url?: string };
  /** Wrap in a new-tab link to item.url when present. */
  linkify?: boolean;
  /**
   * Truncate mode (constitution VI): render a self-measuring ellipsising span
   * with ONE tooltip — the original name when aliased (informational), else
   * the display text gated on actual truncation. Never nests tooltips.
   */
  truncate?: boolean;
  /** Search query — matches inside the visible text render as <mark>. */
  highlight?: string;
  style?: CSSProperties;
}

/**
 * Alias-preferred item display name (FR-030): shows `alias_name` when set
 * (with an informational tooltip carrying the original seller `name` — it
 * reveals hidden content, never repeats visible text), else the raw `name`.
 * With `linkify`, the displayed name links to the item's `url` in a new tab.
 */
export function ItemName({ item, linkify, truncate, highlight, style }: ItemNameProps) {
  const [truncated, setTruncated] = useState(false);
  const check = (node: HTMLElement | null) => {
    if (node) setTruncated(node.scrollWidth > node.clientWidth);
  };
  const measureRef = useCallback((node: HTMLSpanElement | null) => check(node), []);

  const display = item.alias_name || item.name;
  const visible = highlight ? <HighlightText text={display} query={highlight} /> : display;
  const content =
    linkify && item.url ? (
      <a href={item.url} target="_blank" rel="noopener noreferrer" style={truncate ? undefined : style}>
        {visible}
      </a>
    ) : truncate ? (
      visible
    ) : (
      <span style={style}>{visible}</span>
    );

  if (!truncate) {
    return item.alias_name ? <Tooltip title={item.name}>{content}</Tooltip> : <>{content}</>;
  }

  const title = item.alias_name ? item.name : truncated ? display : '';
  return (
    <Tooltip title={title}>
      <span
        ref={measureRef}
        onMouseEnter={(e) => check(e.currentTarget)}
        style={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          ...style,
        }}
      >
        {content}
      </span>
    </Tooltip>
  );
}
