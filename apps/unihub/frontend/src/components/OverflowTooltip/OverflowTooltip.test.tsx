import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OverflowTooltip } from './index';

function setOverflow(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
}

describe('OverflowTooltip (constitution v1.20.0 truncation-gated tooltips)', () => {
  // OTP-01: fully visible content gets NO tooltip.
  it('attaches no tooltip when the text fits', async () => {
    render(<OverflowTooltip title="fits">fits</OverflowTooltip>);
    const el = screen.getByText('fits');
    setOverflow(el, 100, 100);
    fireEvent.mouseOver(el);
    await new Promise((r) => setTimeout(r, 300));
    expect(document.querySelector('.ant-tooltip-inner')).toBeNull();
  });

  // OTP-02: truncated content gets the tooltip.
  it('attaches the tooltip when the text overflows', async () => {
    render(<OverflowTooltip title="long text">long text</OverflowTooltip>);
    const el = screen.getByText('long text');
    setOverflow(el, 500, 100);
    fireEvent.mouseOver(el);
    await waitFor(() => expect(document.querySelector('.ant-tooltip-inner')).toBeTruthy());
  });
});
