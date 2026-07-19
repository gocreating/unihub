import type { CSSProperties, ReactNode } from 'react';
import { Space, Tag, Tooltip, Typography } from 'antd';
import { CommentOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useIntl } from 'react-intl';
import { ItemName } from '@/components/ItemName';
import { OverflowTooltip } from '@/components/OverflowTooltip';
import { pairText, parameterPairs } from './format';
import type { ParameterDisplay, ParameterPair } from './format';

// eslint-disable-next-line react-refresh/only-export-components
export { formatDecimal, pairText, parameterPairs } from './format';
export type { ParameterDisplay, ParameterPair } from './format';

/**
 * Monochrome emoji (FR-032): the transparent-fill + currentColor-shadow
 * silhouette renders the glyph in the inherited text color — color emoji
 * fonts otherwise ignore CSS `color`.
 */
export function KeyEmoji({ emoji }: { emoji: string }) {
  if (!emoji) return null;
  return (
    <span
      aria-hidden
      style={{ WebkitTextFillColor: 'transparent', textShadow: '0 0 0 currentcolor' }}
    >
      {emoji}{' '}
    </span>
  );
}

export interface ItemDisplayItem {
  name: string;
  alias_name: string;
  url?: string;
  spec?: string;
  remark?: string;
  quantity?: number;
  deprecated?: boolean;
  deprecate_time?: string | null;
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
  /** Show the ⚠ deprecated warning (opt-in — scenario surfaces, FR-011). */
  showDeprecatedWarning?: boolean;
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
  showDeprecatedWarning,
  extraSecondary,
  extraTags,
  style,
}: ItemDisplayProps) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const t2 = (id: string, values: Record<string, string>) => intl.formatMessage({ id }, values) as string;
  const pairs = showParameters ? parameterPairs(parameters, t) : [];
  const tags: ParameterPair[] = [
    ...(extraTags ?? []).map((label) => ({ emoji: '', label })),
    ...pairs,
  ];
  const deprecatedTip = item.deprecate_time
    ? t2('pages.inventory.items.deprecatedAt', {
        date: dayjs(item.deprecate_time).format('YYYY-MM-DD'),
      })
    : t('pages.inventory.items.deprecatedTooltip');
  return (
    <div style={{ minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <ItemName item={item} linkify truncate={truncate} highlight={highlight} />
        </div>
        {item.remark ? (
          // Informational tooltip: reveals the (hidden) remark — never noise.
          <Tooltip title={item.remark}>
            <CommentOutlined
              data-testid="remark-icon"
              style={{ flex: 'none', color: 'rgba(0,0,0,0.45)' }}
            />
          </Tooltip>
        ) : null}
        {showDeprecatedWarning && item.deprecated ? (
          <Tooltip title={deprecatedTip}>
            <WarningOutlined
              data-testid="deprecated-warning"
              style={{ flex: 'none', color: '#faad14' }}
            />
          </Tooltip>
        ) : null}
      </div>
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
              <OverflowTooltip title={pairText(tag)}>
                <KeyEmoji emoji={tag.emoji} />
                {tag.label}
              </OverflowTooltip>
            </Tag>
          ))}
        </Space>
      ) : null}
    </div>
  );
}
