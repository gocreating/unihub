import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Space, Tag, Tooltip, Typography } from 'antd';
import { CommentOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useIntl } from 'react-intl';
import { HighlightText } from '@/components/HighlightText';
import { ItemName } from '@/components/ItemName';
import { OverflowTooltip } from '@/components/OverflowTooltip';
import { emojiMask } from './emojiInk';
import { pairText, parameterPairs } from './format';
import type { ParameterDisplay, ParameterPair } from './format';

// eslint-disable-next-line react-refresh/only-export-components
export { formatDecimal, pairText, parameterPairs } from './format';
export type { ParameterDisplay, ParameterPair } from './format';

/**
 * Monochrome emoji key prefix (FR-032). Real browsers paint the glyph's
 * measured-ink mask centered in a 1em box (iteration 46 — see emojiMask);
 * environments without canvas 2D (JSDOM/SSR) fall back to the silhouette
 * text rendering (transparent fill + currentColor shadow).
 */
export function KeyEmoji({ emoji }: { emoji: string }) {
  const mask = useMemo(() => (emoji ? emojiMask(emoji) : null), [emoji]);
  if (!emoji) return null;
  if (mask) {
    return (
      <span
        aria-hidden
        data-testid="key-emoji"
        data-emoji={emoji}
        style={{
          display: 'inline-block',
          width: '1em',
          height: '1em',
          flex: 'none',
          verticalAlign: 'middle',
          backgroundColor: 'currentcolor',
          WebkitMaskImage: `url(${mask})`,
          maskImage: `url(${mask})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          marginRight: 4,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      data-testid="key-emoji"
      data-emoji={emoji}
      style={{
        WebkitTextFillColor: 'transparent',
        textShadow: '0 0 0 currentcolor',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        lineHeight: 1,
        marginRight: 4,
      }}
    >
      {emoji}
    </span>
  );
}

/**
 * THE parameter pair badge (FR-032, iteration 46) — every surface renders
 * pairs through this one component. Flex row: the emoji mask box centers
 * against the label line by LAYOUT (vertical-align tricks are banned — they
 * anchor to x-height, not the row middle).
 */
export function ParameterTag({
  pair,
  fontSize,
  highlight,
}: {
  pair: ParameterPair;
  fontSize?: number;
  /** Search query (019) — matches inside the label render as <mark>. */
  highlight?: string;
}) {
  return (
    <Tag style={{ marginInlineEnd: 0, maxWidth: '100%', ...(fontSize ? { fontSize } : null) }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          maxWidth: '100%',
          verticalAlign: 'top',
        }}
      >
        <KeyEmoji emoji={pair.emoji} />
        <OverflowTooltip title={pairText(pair)} style={{ minWidth: 0 }}>
          {highlight ? <HighlightText text={pair.label} query={highlight} /> : pair.label}
        </OverflowTooltip>
      </span>
    </Tag>
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
      {/* Center-aligned (iteration 38): SVG icons have no text baseline. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        {/* Shrink-to-fit (iteration 37): icons SUFFIX the name text — they hug
            its end instead of parking at the row's far edge; long names still
            truncate with the icons visible. */}
        <div style={{ flex: '0 1 auto', minWidth: 0 }}>
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
            {/* Search marks reach every displayed text (FR-011, iter 43). */}
            {highlight ? <HighlightText text={item.spec} query={highlight} /> : item.spec}
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
            <ParameterTag key={i} pair={tag} fontSize={11} highlight={highlight} />
          ))}
        </Space>
      ) : null}
    </div>
  );
}
