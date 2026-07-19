import type { CSSProperties, ReactNode } from 'react';
import { Space, Tag, Typography } from 'antd';
import { useIntl } from 'react-intl';
import { ItemName } from '@/components/ItemName';
import { OverflowTooltip } from '@/components/OverflowTooltip';
import { parameterPairs } from './format';
import type { ParameterDisplay } from './format';

// eslint-disable-next-line react-refresh/only-export-components
export { formatDecimal, parameterPairs } from './format';
export type { ParameterDisplay } from './format';

export interface ItemDisplayItem {
  name: string;
  alias_name: string;
  url?: string;
  spec?: string;
  quantity?: number;
}

export interface ItemDisplayProps {
  item: ItemDisplayItem;
  /** Parameter rows to show when `showParameters` is set (opt-in, FR-031). */
  parameters?: ParameterDisplay[];
  showParameters?: boolean;
  /** Truncate the primary name (gated tooltip) — lists/panes; off for cells that wrap. */
  truncate?: boolean;
  /** Search query — matches inside the primary text render as <mark>. */
  highlight?: string;
  /** Extra secondary line below the spec (e.g. acquisition context). */
  extraSecondary?: ReactNode;
  /** Surface-specific value tags rendered before the parameter pairs. */
  extraTags?: string[];
  style?: CSSProperties;
}

/**
 * Shared item display (FR-031) used by every item-presenting surface:
 * primary Name/Alias (+URL link, FR-030 tooltip rules), secondary Spec with a
 * truncation-gated tooltip, ×N when quantity exceeds one, and opt-in
 * parameters as localized `key: value` Tag pairs.
 */
export function ItemDisplay({
  item,
  parameters,
  showParameters,
  truncate,
  highlight,
  extraSecondary,
  extraTags,
  style,
}: ItemDisplayProps) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const pairs = showParameters ? parameterPairs(parameters, t) : [];
  const tags = [...(extraTags ?? []), ...pairs];
  return (
    <div style={{ minWidth: 0, ...style }}>
      <ItemName item={item} linkify truncate={truncate} highlight={highlight} />
      {item.spec ? (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          <OverflowTooltip title={item.spec} style={{ maxWidth: '100%' }}>
            {item.spec}
          </OverflowTooltip>
        </Typography.Text>
      ) : null}
      {extraSecondary ? (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          {extraSecondary}
        </Typography.Text>
      ) : null}
      {item.quantity != null && item.quantity > 1 ? (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          ×{item.quantity}
        </Typography.Text>
      ) : null}
      {tags.length > 0 ? (
        <Space size={[4, 4]} wrap style={{ maxWidth: '100%', marginTop: 2 }}>
          {tags.map((tag, i) => (
            <Tag key={i} style={{ marginInlineEnd: 0, maxWidth: '100%', fontSize: 11 }}>
              <OverflowTooltip title={tag}>{tag}</OverflowTooltip>
            </Tag>
          ))}
        </Space>
      ) : null}
    </div>
  );
}
