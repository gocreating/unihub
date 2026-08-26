/**
 * Holdings as badges (FR-052, research I9-2) — ONE component for both places
 * a portfolio's positions appear: the Portfolios list Position column and the
 * Accumulated Position column of the transactions table.
 *
 * One default AntD `Tag` per asset (Principle VI: foreign-key values are
 * tags), the quantity through `<Price>` in the strong tone and the asset name
 * muted, so the number leads and the ticker is the label. Tags wrap inside
 * the cell; the real data holds at most five assets per portfolio.
 */
import { Space, Tag } from 'antd';
import { EmptyValue } from '@/components/EmptyValue';
import { Price } from '@/components/Price';

export interface HoldingLike {
  asset_id?: string;
  asset_name: string;
  /** Net quantity — a balance, so it renders unsigned (a minus survives). */
  quantity: string;
}

export interface HoldingTagsProps {
  holdings: readonly HoldingLike[];
}

export function HoldingTags({ holdings }: HoldingTagsProps) {
  if (holdings.length === 0) return <EmptyValue />;
  return (
    <Space size={[4, 4]} wrap>
      {holdings.map((h) => (
        <Tag key={h.asset_id ?? h.asset_name} style={{ marginInlineEnd: 0 }}>
          <Price value={h.quantity} asset={h.asset_name} plain mutedUnit />
        </Tag>
      ))}
    </Space>
  );
}
