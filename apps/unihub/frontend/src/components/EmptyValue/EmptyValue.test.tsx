import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyValue } from './index';

describe('EmptyValue (constitution v1.20.0 empty placeholder)', () => {
  // EV-01: short hyphen, dimmed/disabled, non-selectable.
  it('renders a short dimmed non-selectable hyphen', () => {
    render(<EmptyValue />);
    const el = screen.getByText('-');
    expect(el.textContent).toBe('-'); // SHORT hyphen, not the em-dash "—"
    expect(el).toHaveStyle({ userSelect: 'none' });
    expect(el.className).toContain('ant-typography-disabled');
  });
});
