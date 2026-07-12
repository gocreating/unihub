import type { AttributeDefinition } from '@/services/unihub-backend/core';
import type { ItemParameter, ItemParameterWrite } from '@/services/unihub-backend/inventory';

// Drop trailing zeros: "10.0000" → "10", "59.9000" → "59.9".
export function formatDecimal(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

/** The badge-relevant shape of a parameter row (read or resolved draft). */
export type ParameterLike = Pick<ItemParameter, 'name' | 'data_type' | 'value' | 'unit'>;

// The seven seeded system keys keep their compact value-style formats.
const SYSTEM_FORMATS: Record<string, (p: ParameterLike) => string> = {
  color: (p) => p.value,
  size: (p) => p.value,
  weight: (p) => `${formatDecimal(p.value)} ${p.unit}`.trim(),
  length: (p) => `L ${formatDecimal(p.value)}${p.unit}`,
  width: (p) => `W ${formatDecimal(p.value)}${p.unit}`,
  height: (p) => `H ${formatDecimal(p.value)}${p.unit}`,
  volume: (p) => `${formatDecimal(p.value)} ${p.unit}`.trim(),
};

/** One badge string per parameter row (FR-003a formats). */
export function parameterBadge(p: ParameterLike): string {
  const system = SYSTEM_FORMATS[p.name];
  if (system) return system(p);
  if (p.data_type === 'dimension') return `${p.name}: ${formatDecimal(p.value)} ${p.unit}`.trim();
  if (p.data_type === 'number') return `${p.name}: ${formatDecimal(p.value)}`;
  return `${p.name}: ${p.value}`;
}

export function parameterBadges(params: ParameterLike[] | undefined): string[] {
  return (params ?? []).map(parameterBadge);
}

/** Core (non-parameter) card badges: quantity ≠ 1, sku price, spec. */
export function itemCoreBadges(d: {
  quantity?: number;
  sku_price?: string | null;
  sku_price_currency?: string;
  spec?: string;
}): string[] {
  const badges: string[] = [];
  if (d.quantity != null && d.quantity !== 1) badges.push(`× ${d.quantity}`);
  if (d.sku_price) badges.push(`${formatDecimal(d.sku_price)} ${d.sku_price_currency ?? ''}`.trim());
  if (d.spec) badges.push(d.spec);
  return badges;
}

/** Acquisition-card badges: core fields followed by every parameter row. */
export function itemCardBadges(
  d: Parameters<typeof itemCoreBadges>[0],
  params: ParameterLike[] | undefined,
): string[] {
  return [...itemCoreBadges(d), ...parameterBadges(params)];
}

/** Resolve pending ItemWrite parameter rows against the definitions list. */
export function draftParameters(
  rows: ItemParameterWrite[] | undefined,
  definitions: AttributeDefinition[] | undefined,
): ParameterLike[] {
  const byId = new Map((definitions ?? []).map((definition) => [definition.id, definition]));
  const resolved: ParameterLike[] = [];
  for (const row of rows ?? []) {
    const definition = byId.get(row.definition_id);
    if (!definition) continue;
    resolved.push({
      name: definition.name,
      data_type: definition.data_type,
      value: row.value,
      unit: row.unit ?? '',
    });
  }
  return resolved;
}
