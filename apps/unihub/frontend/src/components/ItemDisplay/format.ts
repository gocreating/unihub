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
  value_number?: string | null;
  value_number_max?: string | null;
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
  volume: 'pages.inventory.items.col.volume',
};

function parameterValueText(p: ParameterDisplay): string {
  if (p.data_type === 'dimension') {
    const range = RANGE_RE.exec(p.value);
    if (range) {
      const low = formatDecimal(range[1]);
      const high = formatDecimal(range[2] ?? range[3]);
      return `${low} - ${high} ${p.unit ?? ''}`.trim();
    }
    return `${formatDecimal(p.value)} ${p.unit ?? ''}`.trim();
  }
  if (p.data_type === 'number') return formatDecimal(p.value);
  return p.value;
}

/** One localized `key: value` string per parameter row (FR-031). */
export function parameterPairs(
  params: ParameterDisplay[] | undefined,
  translate: (id: string) => string,
): string[] {
  return (params ?? []).map((p) => {
    const keyId = SYSTEM_KEY_IDS[p.name];
    const key = keyId ? translate(keyId) : p.name;
    return `${key}: ${parameterValueText(p)}`;
  });
}
