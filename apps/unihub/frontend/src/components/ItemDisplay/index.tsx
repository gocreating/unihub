import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Space, Tag, Tooltip, Typography } from 'antd';
import { CommentOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useIntl } from 'react-intl';
import { HighlightText } from '@/components/HighlightText';
import { ItemName } from '@/components/ItemName';
import { OverflowTooltip } from '@/components/OverflowTooltip';
import { pairText, parameterPairs } from './format';
import type { ParameterDisplay, ParameterPair } from './format';

// eslint-disable-next-line react-refresh/only-export-components
export { formatDecimal, pairText, parameterPairs } from './format';
export type { ParameterDisplay, ParameterPair } from './format';

// Per-glyph INK compensation (FR-032, iteration 45): emoji fonts place their
// ink inside the glyph box per their OWN metrics, so a perfectly centered CSS
// box can still LOOK offset (⚖/🧴 hang low, 👕 sinks ~2px) — and the offset
// differs per glyph AND per platform font. The residual is measurable:
// canvas TextMetrics gives the actual ink box vs the font box, both relative
// to the shared baseline; flex centering aligns the FONT box, so
// (inkMid − fontMid) is exactly the translateY that centers the visible ink.
let measureCtx: CanvasRenderingContext2D | null | undefined;
const inkShiftCache = new Map<string, number>();

function emojiInkShift(emoji: string, font: string): number {
  const key = `${emoji}|${font}`;
  const cached = inkShiftCache.get(key);
  if (cached !== undefined) return cached;
  if (measureCtx === undefined) {
    measureCtx =
      typeof document !== 'undefined'
        ? document.createElement('canvas').getContext('2d')
        : null;
  }
  let shift = 0;
  if (measureCtx && font) {
    measureCtx.font = font;
    const m = measureCtx.measureText(emoji);
    const inkMid = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    const fontMid = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
    if (Number.isFinite(inkMid) && Number.isFinite(fontMid)) {
      shift = inkMid - fontMid;
    }
  }
  inkShiftCache.set(key, shift);
  return shift;
}

/**
 * Monochrome emoji (FR-032): the transparent-fill + currentColor-shadow
 * silhouette renders the glyph in the inherited text color — color emoji
 * fonts otherwise ignore CSS `color`. The glyph's visible INK is centered on
 * the row middle via the measured per-glyph shift (iteration 45).
 */
export function KeyEmoji({ emoji }: { emoji: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !emoji) return;
    const cs = window.getComputedStyle(el);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const shift = emojiInkShift(emoji, font);
    el.style.transform = shift ? `translateY(${shift.toFixed(2)}px)` : '';
  }, [emoji]);
  if (!emoji) return null;
  return (
    <span
      ref={ref}
      aria-hidden
      data-testid="key-emoji"
      style={{
        WebkitTextFillColor: 'transparent',
        textShadow: '0 0 0 currentcolor',
        // Box centering (iteration 41) + ink compensation (iteration 45).
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
