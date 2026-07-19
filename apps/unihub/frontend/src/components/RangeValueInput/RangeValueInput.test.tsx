import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { RangeValueInput } from './index';

const wrap = (ui: ReactElement) =>
  render(
    <IntlProvider locale="en-US" messages={enUS}>
      {ui}
    </IntlProvider>,
  );

const numberInputs = () => document.querySelectorAll('.ant-input-number input');

describe('RangeValueInput (FR-002b, iteration 30)', () => {
  it('seeds EXACT mode from a single value — one numeric field', () => {
    wrap(<RangeValueInput value="42" onChange={vi.fn()} />);
    expect(numberInputs()).toHaveLength(1);
    expect((numberInputs()[0] as HTMLInputElement).value).toBe('42');
  });

  it('seeds RANGE mode from a range value — two numeric fields joined by ~', () => {
    wrap(<RangeValueInput value="74~164" onChange={vi.fn()} />);
    expect(numberInputs()).toHaveLength(2);
    expect((numberInputs()[0] as HTMLInputElement).value).toBe('74');
    expect((numberInputs()[1] as HTMLInputElement).value).toBe('164');
    expect(screen.getByText('~')).toBeInTheDocument();
  });

  it('emits canonical text when both range bounds are set', () => {
    const onChange = vi.fn();
    wrap(<RangeValueInput value="74~164" onChange={onChange} />);
    fireEvent.change(numberInputs()[1]!, { target: { value: '200' } });
    expect(onChange).toHaveBeenLastCalledWith('74~200');
  });

  it('switches modes via the picker and re-emits accordingly', () => {
    const onChange = vi.fn();
    wrap(<RangeValueInput value="42" onChange={onChange} />);
    // exact → range keeps the value as the minimum.
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(document.querySelector('.ant-select-dropdown .ant-select-item[title="Range"]')!);
    expect(numberInputs()).toHaveLength(2);
    fireEvent.change(numberInputs()[1]!, { target: { value: '50' } });
    expect(onChange).toHaveBeenLastCalledWith('42~50');
    // range → exact keeps the minimum only.
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(document.querySelector('.ant-select-dropdown .ant-select-item[title="Exact"]')!);
    expect(onChange).toHaveBeenLastCalledWith('42');
  });

  it('emits an incomplete range as invalid partial text (parent flags it)', () => {
    const onChange = vi.fn();
    wrap(<RangeValueInput value="42~50" onChange={onChange} />);
    fireEvent.change(numberInputs()[1]!, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('42~');
  });
});
