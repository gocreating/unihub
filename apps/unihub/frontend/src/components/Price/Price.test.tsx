import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Price } from './index';
import {
  COST_COLOR,
  INCOME_COLOR,
  NEUTRAL_COLOR,
  formatMoney,
  moneyFormatter,
  normalizeAmount,
} from './format';
import { setCurrencySymbols } from '@/utils/currency';

beforeEach(() => {
  setCurrencySymbols({ TWD: 'NT$', USD: '$' });
});

describe('normalizeAmount — the one precision policy', () => {
  it('trims the (38,18) zero padding', () => {
    expect(normalizeAmount('168.000000000000000000', { currency: 'TWD' })!.magnitude).toBe('168');
  });

  it('groups the integer part', () => {
    expect(normalizeAmount('1234567.5', { currency: 'TWD' })!.magnitude).toBe('1,234,567.5');
  });

  it('rounds money to 2 decimals and flags that it rounded', () => {
    const parts = normalizeAmount('1.239', { currency: 'USD' })!;
    expect(parts.magnitude).toBe('1.24');
    expect(parts.rounded).toBe(true);
    expect(parts.exact).toBe('1.239');
  });

  it('does NOT flag rounding when the value is shown exactly', () => {
    expect(normalizeAmount('1.25', { currency: 'USD' })!.rounded).toBe(false);
  });

  it('allows a quantity more decimals than money', () => {
    expect(normalizeAmount('0.00000067', { asset: 'ETH' })!.magnitude).toBe('0.00000067');
    expect(normalizeAmount('0.00000067', { currency: 'USD' })!.magnitude).toBe('0');
  });

  it('never goes through float — 18 decimals survive in `exact`', () => {
    const parts = normalizeAmount('1.000000067305900768', { asset: 'ETH' })!;
    expect(parts.exact).toBe('1.000000067305900768');
    expect(parts.exact).not.toMatch(/e/i);
  });

  it('resolves the symbol from the registry, falling back to the code', () => {
    expect(normalizeAmount('1', { currency: 'TWD' })!.unit).toBe('NT$');
    expect(normalizeAmount('1', { currency: 'XYZ' })!.unit).toBe('XYZ');
  });

  it('returns null for absent values rather than printing 0 or NaN', () => {
    expect(normalizeAmount(null)).toBeNull();
    expect(normalizeAmount(undefined)).toBeNull();
    expect(normalizeAmount('')).toBeNull();
    expect(normalizeAmount('not a number')).toBeNull();
  });
});

describe('formatMoney — composition', () => {
  it('leads with the currency symbol and spaces the sign: "+ NT$ 168"', () => {
    expect(formatMoney('168', { currency: 'TWD', signed: true })).toBe('+ NT$ 168');
  });

  it('uses a real minus sign for a negative change', () => {
    expect(formatMoney('-168', { currency: 'TWD', signed: true })).toBe('− NT$ 168');
  });

  it('omits the sign for a balance', () => {
    expect(formatMoney('168', { currency: 'TWD' })).toBe('NT$ 168');
  });

  it('keeps the minus on a NEGATIVE balance — only the plus is omitted', () => {
    // A debt or an oversold holding must never read as positive.
    expect(formatMoney('-168', { currency: 'TWD' })).toBe('− NT$ 168');
    expect(formatMoney('-0.5', { asset: 'ETH' })).toBe('−0.5 ETH');
  });

  it('trails the unit for a quantity: "+123 0050.TW"', () => {
    expect(formatMoney('123', { asset: '0050.TW', signed: true })).toBe('+123 0050.TW');
  });
});

describe('moneyFormatter — charts share the logic, not a copy', () => {
  it('produces the same string a cell would', () => {
    const fmt = moneyFormatter('TWD');
    expect(fmt(1234.5)).toBe('NT$ 1,234.5');
    expect(fmt(1234.5)).toBe(formatMoney(1234.5, { currency: 'TWD' }));
  });
});

describe('<Price>', () => {
  it('colours a negative change red and a positive one green', () => {
    const { rerender } = render(<Price value="-100" currency="TWD" signed />);
    expect(screen.getByText('− NT$ 100')).toHaveStyle({ color: COST_COLOR });
    rerender(<Price value="100" currency="TWD" signed />);
    expect(screen.getByText('+ NT$ 100')).toHaveStyle({ color: INCOME_COLOR });
  });

  it('renders a position grey — a quantity has no profit or loss', () => {
    render(<Price value="-123" asset="0050.TW" signed neutral />);
    expect(screen.getByText('−123 0050.TW')).toHaveStyle({ color: NEUTRAL_COLOR });
  });

  it('uses tabular figures so columns of digits line up', () => {
    render(<Price value="1234" currency="TWD" />);
    expect(screen.getByText('NT$ 1,234')).toHaveStyle({ fontVariantNumeric: 'tabular-nums' });
  });

  it('falls back to the shared empty placeholder, never to 0', () => {
    const { container } = render(<Price value={null} currency="TWD" />);
    expect(container.textContent).toBe('-');
  });

  it('exposes the full precision on hover when it rounded', async () => {
    render(<Price value="1.239" currency="USD" />);
    fireEvent.mouseEnter(screen.getByText('$ 1.24'));
    expect(await screen.findByText('$ 1.239')).toBeInTheDocument();
  });

  it('attaches NO tooltip when the value is shown exactly', async () => {
    render(<Price value="1.25" currency="USD" />);
    fireEvent.mouseEnter(screen.getByText('$ 1.25'));
    // A same-content tooltip on fully visible content is the annoyance
    // Principle VI bans; only one node may ever carry this text.
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.getAllByText('$ 1.25')).toHaveLength(1);
  });
});

// FR-052 / I9-2: a holding badge shows the quantity and the asset name in
// different tones. The variant lives IN the component (Principle XIII) — a
// page must not split the string and restyle half of it.
describe('<Price mutedUnit>', () => {
  it('renders the unit in its own span in the secondary tone, magnitude in the strong tone', () => {
    const { container } = render(<Price value="2145.000000000000000000" asset="00918.TW" plain mutedUnit />);
    expect(container.textContent).toBe('2,145 00918.TW');
    const unit = screen.getByText('00918.TW');
    expect(unit.tagName).toBe('SPAN');
    expect(unit).toHaveClass('ant-typography-secondary');
    // The magnitude is NOT inside the muted span.
    expect(unit.textContent).toBe('00918.TW');
    expect(screen.getByText(/2,145/)).not.toHaveClass('ant-typography-secondary');
  });

  it('changes nothing without the flag', () => {
    const { container } = render(<Price value="2145" asset="00918.TW" plain />);
    expect(container.textContent).toBe('2,145 00918.TW');
    expect(container.querySelector('.ant-typography-secondary')).toBeNull();
  });

  it('keeps the rounding-gated precision tooltip', async () => {
    render(<Price value="0.123456789" asset="ETH" plain mutedUnit />);
    fireEvent.mouseEnter(screen.getByText(/0\.12345679/));
    expect(await screen.findByText('0.123456789 ETH')).toBeInTheDocument();
  });
});
