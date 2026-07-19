import type { CSSProperties } from 'react';
import { InputNumber, Select, Space } from 'antd';
import { currencySymbol } from '@/utils/currency';

export interface CurrencyCode {
  value: string;
}

export interface CurrencySymbolSelectProps {
  value?: string;
  onChange?: (code: string | undefined) => void;
  codes: CurrencyCode[];
  /** While true the select shows `placeholder` instead of a symbol (FR-033). */
  hideSymbol?: boolean;
  disabled?: boolean;
  placeholder?: string;
  style?: CSSProperties;
}

/**
 * Currency select that displays the SYMBOL when selected and "CODE symbol"
 * in its dropdown options (FR-033).
 */
export function CurrencySymbolSelect({
  value,
  onChange,
  codes,
  hideSymbol,
  disabled,
  placeholder = '-',
  style,
}: CurrencySymbolSelectProps) {
  return (
    <Select
      style={style}
      showSearch
      allowClear
      disabled={disabled}
      value={hideSymbol ? undefined : value || undefined}
      onChange={(v) => onChange?.(v ?? undefined)}
      placeholder={placeholder}
      options={codes.map((c) => ({
        value: c.value,
        // The selected display shows this SAME full label (iteration 32) — a
        // bare symbol was ambiguous across $-sharing codes.
        label: `${c.value} ${currencySymbol(c.value)}`.trim(),
      }))}
      filterOption={(input, option) =>
        String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
      }
    />
  );
}

export interface PriceInputProps {
  amount: number | null;
  currency?: string;
  codes: CurrencyCode[];
  onAmount: (value: number | null) => void;
  onCurrency: (code: string | undefined) => void;
  /** Extra reason to lock the currency (e.g. system-managed rows). */
  currencyDisabled?: boolean;
  min?: number;
  style?: CSSProperties;
}

/**
 * Compact price input per the FR-033 mockup: [currency symbol][numeric value].
 * While the amount is empty or 0, the currency select shows a placeholder
 * (no symbol) and is disabled.
 */
export function PriceInput({
  amount,
  currency,
  codes,
  onAmount,
  onCurrency,
  currencyDisabled,
  min,
  style,
}: PriceInputProps) {
  const empty = amount == null || amount === 0;
  return (
    <Space.Compact style={{ width: '100%', ...style }}>
      <CurrencySymbolSelect
        style={{ width: '35%' }}
        codes={codes}
        value={currency}
        onChange={onCurrency}
        hideSymbol={empty}
        disabled={empty || currencyDisabled}
      />
      <InputNumber
        style={{ width: '65%' }}
        min={min}
        value={amount}
        onChange={(v) => onAmount(v == null ? null : Number(v))}
      />
    </Space.Compact>
  );
}
