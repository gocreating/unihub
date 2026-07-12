import type { Measurement } from '@/services/unihub-backend/inventory';

/** Badge-relevant item fields — satisfied by both read `Item`s and pending `ItemWrite` drafts. */
export interface BadgeableItem {
  quantity?: number;
  sku_price?: string | null;
  sku_price_currency?: string;
  size?: string;
  color?: string;
  length?: Measurement | null;
  width?: Measurement | null;
  height?: Measurement | null;
  weight?: Measurement | null;
  volume?: Measurement | null;
  spec?: string;
}

// Drop trailing zeros: "10.0000" → "10", "59.9000" → "59.9".
export function formatDecimal(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

// Available (non-empty) item attributes to show as badges on a card body.
export function itemCardBadges(d: BadgeableItem): string[] {
  const b: string[] = [];
  if (d.quantity != null && d.quantity !== 1) b.push(`× ${d.quantity}`);
  if (d.sku_price) b.push(`${formatDecimal(d.sku_price)} ${d.sku_price_currency ?? ''}`.trim());
  if (d.size) b.push(d.size);
  if (d.color) b.push(d.color);
  if (d.length) b.push(`L ${d.length.value}${d.length.unit}`);
  if (d.width) b.push(`W ${d.width.value}${d.width.unit}`);
  if (d.height) b.push(`H ${d.height.value}${d.height.unit}`);
  if (d.weight) b.push(`${d.weight.value} ${d.weight.unit}`);
  if (d.volume) b.push(`${d.volume.value} ${d.volume.unit}`);
  if (d.spec) b.push(d.spec);
  return b;
}

// Catalog "Parameters" derived column (FR-003a): exactly the non-empty of
// color, weight, length, width, height, volume, size — trailing zeros dropped.
export function parameterBadges(d: BadgeableItem): string[] {
  const b: string[] = [];
  if (d.color) b.push(d.color);
  if (d.weight) b.push(`${formatDecimal(d.weight.value)} ${d.weight.unit}`);
  if (d.length) b.push(`L ${formatDecimal(d.length.value)}${d.length.unit}`);
  if (d.width) b.push(`W ${formatDecimal(d.width.value)}${d.width.unit}`);
  if (d.height) b.push(`H ${formatDecimal(d.height.value)}${d.height.unit}`);
  if (d.volume) b.push(`${formatDecimal(d.volume.value)} ${d.volume.unit}`);
  if (d.size) b.push(d.size);
  return b;
}
