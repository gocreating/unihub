import { useState } from 'react';
import type { CSSProperties } from 'react';
import { InputNumber, Select, Space } from 'antd';
import { useIntl } from 'react-intl';

// Mirrors the backend range grammar (core.attributes): "74~164" / "-40~230".
const RANGE_RE = /^\s*(-?\d+(?:\.\d+)?)?\s*(?:~\s*(-?\d+(?:\.\d+)?)?|-\s*(\d+(?:\.\d+)?)?)\s*$/;

type Mode = 'exact' | 'range';

function parseBounds(text: string): { low: number | null; high: number | null; range: boolean } {
  if (text === '') return { low: null, high: null, range: false };
  const single = Number(text);
  if (Number.isFinite(single)) return { low: single, high: null, range: false };
  const m = RANGE_RE.exec(text);
  if (!m) return { low: null, high: null, range: false };
  const low = m[1] != null ? Number(m[1]) : null;
  const rawHigh = m[2] ?? m[3];
  const high = rawHigh != null ? Number(rawHigh) : null;
  return { low, high, range: true };
}

export interface RangeValueInputProps {
  /** Canonical value text: "42" (exact) or "74~164" (range). */
  value: string;
  onChange: (text: string) => void;
  status?: 'error';
  style?: CSSProperties;
}

/**
 * Explicit-mode numeric value input (FR-002b, iteration 30): the user picks
 * EXACT (one field) or RANGE (min ~ max, two fields). Emits the canonical
 * value text; an incomplete range emits partial text so the parent's
 * validation flags it inline.
 */
export function RangeValueInput({ value, onChange, status, style }: RangeValueInputProps) {
  const { formatMessage: t } = useIntl();
  const parsed = parseBounds(value);
  const [mode, setMode] = useState<Mode>(parsed.range ? 'range' : 'exact');

  const emit = (m: Mode, low: number | null, high: number | null) => {
    if (m === 'exact') {
      onChange(low == null ? '' : String(low));
      return;
    }
    if (low == null && high == null) {
      onChange('');
      return;
    }
    onChange(`${low ?? ''}~${high ?? ''}`);
  };

  const onMode = (m: Mode) => {
    setMode(m);
    emit(m, parsed.low, m === 'range' ? parsed.high : null);
  };

  return (
    <Space.Compact block style={style}>
      <Select<Mode>
        style={{ width: mode === 'range' ? '32%' : '38%' }}
        value={mode}
        onChange={onMode}
        options={[
          { value: 'exact', label: t({ id: 'pages.inventory.params.mode.exact' }) },
          { value: 'range', label: t({ id: 'pages.inventory.params.mode.range' }) },
        ]}
      />
      {mode === 'exact' ? (
        <InputNumber
          style={{ width: '62%' }}
          status={status}
          value={parsed.low}
          onChange={(v) => emit('exact', v == null ? null : Number(v), null)}
        />
      ) : (
        <>
          <InputNumber
            style={{ width: '30%' }}
            status={status}
            placeholder={t({ id: 'pages.inventory.params.mode.min' })}
            value={parsed.low}
            onChange={(v) => emit('range', v == null ? null : Number(v), parsed.high)}
          />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 6px',
              border: '1px solid #d9d9d9',
              borderLeft: 'none',
              borderRight: 'none',
              color: 'rgba(0,0,0,0.45)',
            }}
          >
            ~
          </span>
          <InputNumber
            style={{ width: '30%' }}
            status={status}
            placeholder={t({ id: 'pages.inventory.params.mode.max' })}
            value={parsed.high}
            onChange={(v) => emit('range', parsed.low, v == null ? null : Number(v))}
          />
        </>
      )}
    </Space.Compact>
  );
}
