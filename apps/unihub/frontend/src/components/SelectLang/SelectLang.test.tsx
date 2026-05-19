import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SelectLang } from './index';
import { LocaleProvider } from '@/contexts/LocaleContext';

function renderWithLocale() {
  return render(
    <LocaleProvider>
      <SelectLang />
    </LocaleProvider>,
  );
}

describe('SelectLang', () => {
  it('renders the translate icon SVG trigger', () => {
    const { container } = renderWithLocale();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('trigger span contains only the SVG (no flag text)', () => {
    const { container } = renderWithLocale();
    // The outer trigger span should render no visible text — only the SVG icon
    const spans = container.querySelectorAll('span');
    const triggerSpan = spans[0];
    // SVG aria-hidden; text content of the span should be empty
    expect(triggerSpan?.querySelector('svg')).not.toBeNull();
    // No emoji flag characters in the trigger
    const text = triggerSpan?.textContent ?? '';
    expect(text).not.toMatch(/🇺🇸|🇹🇼/);
  });
});
