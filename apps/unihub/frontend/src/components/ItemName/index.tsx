import { Tooltip } from 'antd';
import type { CSSProperties } from 'react';

export interface ItemNameProps {
  item: { name: string; alias_name: string; url?: string };
  /** Wrap in a new-tab link to item.url when present. */
  linkify?: boolean;
  style?: CSSProperties;
}

/**
 * Alias-preferred item display name (FR-030): shows `alias_name` when set
 * (with an informational tooltip carrying the original seller `name` — it
 * reveals hidden content, never repeats visible text), else the raw `name`.
 * With `linkify`, the displayed name links to the item's `url` in a new tab.
 */
export function ItemName({ item, linkify, style }: ItemNameProps) {
  const display = item.alias_name || item.name;
  const text =
    linkify && item.url ? (
      <a href={item.url} target="_blank" rel="noopener noreferrer" style={style}>
        {display}
      </a>
    ) : (
      <span style={style}>{display}</span>
    );
  return item.alias_name ? <Tooltip title={item.name}>{text}</Tooltip> : text;
}
