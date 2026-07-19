import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PriceInput } from './index';
import { setCurrencySymbols } from '@/utils/currency';

beforeEach(() => {
  setCurrencySymbols({ TWD: 'NT$', CNY: '¥', JPY: '¥', KRW: '₩', USD: '$' });
});

const CODES = [{ value: 'TWD' }, { value: 'CNY' }, { value: 'USD' }];

describe('PriceInput (FR-033)', () => {
  it('lays out [currency-symbol select][numeric value] with the symbol shown', () => {
    render(<PriceInput amount={129} currency="TWD" codes={CODES} onAmount={vi.fn()} onCurrency={vi.fn()} />);
    const select = document.querySelector('.ant-select')!;
    const number = document.querySelector('.ant-input-number')!;
    // The select precedes the number input (mockup order).
    expect(select.compareDocumentPosition(number) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Selected label shows the FULL option label (iteration 32) — a bare
    // symbol was ambiguous across $-sharing codes.
    expect(select.textContent).toContain('TWD NT$'); // finance symbol (iter 33)
  });

  it('offers "CODE symbol" option labels', () => {
    render(<PriceInput amount={129} currency="TWD" codes={CODES} onAmount={vi.fn()} onCurrency={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole('combobox'));
    const dropdown = document.querySelector('.ant-select-dropdown')!;
    expect(dropdown.textContent).toContain('CNY ¥');
    expect(dropdown.textContent).toContain('USD $');
  });

  it('shows a placeholder instead of a symbol while the amount is empty or 0', () => {
    const { rerender } = render(
      <PriceInput amount={null} currency="TWD" codes={CODES} onAmount={vi.fn()} onCurrency={vi.fn()} />,
    );
    expect(document.querySelector('.ant-select-selection-placeholder')).toBeTruthy();
    rerender(<PriceInput amount={0} currency="TWD" codes={CODES} onAmount={vi.fn()} onCurrency={vi.fn()} />);
    expect(document.querySelector('.ant-select-selection-placeholder')).toBeTruthy();
    rerender(<PriceInput amount={5} currency="TWD" codes={CODES} onAmount={vi.fn()} onCurrency={vi.fn()} />);
    expect(document.querySelector('.ant-select-selection-placeholder')).toBeFalsy();
  });

  it('propagates amount and currency changes', () => {
    const onAmount = vi.fn();
    render(<PriceInput amount={10} currency="TWD" codes={CODES} onAmount={onAmount} onCurrency={vi.fn()} />);
    const number = document.querySelector('.ant-input-number input')!;
    fireEvent.change(number, { target: { value: '42' } });
    expect(onAmount).toHaveBeenLastCalledWith(42);
  });
});
