/** Drop trailing zeros: "10.0000" → "10", "59.9000" → "59.9". */
export function formatDecimal(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

/** The display-relevant shape of a parameter row (read or resolved draft). */
export interface ParameterDisplay {
  name: string;
  data_type: string;
  value: string;
  unit?: string;
  emoji?: string;
  value_number?: string | null;
  value_number_max?: string | null;
}

/** One renderable `key: value` pair — emoji renders monochrome via KeyEmoji. */
export interface ParameterPair {
  emoji: string;
  label: string;
}

/** Plain-text form of a pair (width measurement, tooltips). */
export function pairText(pair: ParameterPair): string {
  return pair.emoji ? `${pair.emoji} ${pair.label}` : pair.label;
}

// Mirrors the backend range grammar (core.attributes): "5-10" or "-10~40".
const RANGE_RE = /^\s*(-?\d+(?:\.\d+)?)\s*(?:~\s*(-?\d+(?:\.\d+)?)|-\s*(\d+(?:\.\d+)?))\s*$/;

// Seeded system parameter keys localize; user-created keys display verbatim.
const SYSTEM_KEY_IDS: Record<string, string> = {
  color: 'pages.inventory.items.col.color',
  size: 'pages.inventory.items.col.size',
  weight: 'pages.inventory.items.col.weight',
  length: 'pages.inventory.items.col.length',
  width: 'pages.inventory.items.col.width',
  height: 'pages.inventory.items.col.height',
  diameter: 'pages.inventory.items.col.diameter',
  waist: 'pages.inventory.items.col.waist',
  volume: 'pages.inventory.items.col.volume',
  temperature: 'pages.inventory.items.col.temperature',
};

function parameterValueText(p: ParameterDisplay): string {
  // Ranges render with a tilde (FR-002b, iteration 28) for BOTH dimension and
  // number types — the sheets' own notation ("74~164cm").
  if (p.data_type === 'dimension' || p.data_type === 'number') {
    const unit = p.data_type === 'dimension' ? p.unit ?? '' : '';
    const range = RANGE_RE.exec(p.value);
    if (range) {
      const low = formatDecimal(range[1]);
      const high = formatDecimal(range[2] ?? range[3]);
      return `${low} ~ ${high} ${unit}`.trim();
    }
    return `${formatDecimal(p.value)} ${unit}`.trim();
  }
  return p.value;
}

/** One localized `key: value` pair per parameter row (FR-031/FR-032). */
export function parameterPairs(
  params: ParameterDisplay[] | undefined,
  translate: (id: string) => string,
): ParameterPair[] {
  return (params ?? []).map((p) => {
    const keyId = SYSTEM_KEY_IDS[p.name];
    const key = keyId ? translate(keyId) : p.name;
    return { emoji: p.emoji ?? '', label: `${key}: ${parameterValueText(p)}` };
  });
}
