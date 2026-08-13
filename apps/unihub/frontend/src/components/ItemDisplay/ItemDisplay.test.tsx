import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ItemDisplay, parameterPairs } from './index';
import type { ParameterDisplay } from './index';

const wrap = (ui: ReactElement) =>
  render(
    <IntlProvider locale="en" messages={enUS}>
      {ui}
    </IntlProvider>,
  );

const base = {
  name: 'Seller Product Name',
  alias_name: '',
  url: '',
  spec: '',
  quantity: 1,
};

const PARAMS: ParameterDisplay[] = [
  { name: 'color', data_type: 'text', value: 'red', unit: '' },
  {
    name: 'weight',
    data_type: 'dimension',
    value: '5-10',
    unit: 'kg',
    value_number: '5000.0000',
    value_number_max: '10000.0000',
  },
  { name: 'capacity', data_type: 'number', value: '1500.0000', unit: '' },
];

describe('ItemDisplay (FR-031)', () => {
  it('renders the primary name as a new-tab link when a url exists', () => {
    wrap(<ItemDisplay item={{ ...base, url: 'https://x.example/p' }} />);
    const link = screen.getByText('Seller Product Name').closest('a')!;
    expect(link).toHaveAttribute('href', 'https://x.example/p');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('prefers the alias with the original name in a tooltip (FR-030)', async () => {
    wrap(<ItemDisplay item={{ ...base, alias_name: 'My Torch' }} />);
    const alias = screen.getByText('My Torch');
    expect(screen.queryByText('Seller Product Name')).toBeNull();
    fireEvent.mouseEnter(alias);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Seller Product Name');
  });

  it('renders the spec as secondary text', () => {
    wrap(<ItemDisplay item={{ ...base, spec: 'black edition' }} />);
    expect(screen.getByText('black edition')).toBeInTheDocument();
  });

  it('renders a ×N quantity line only when quantity exceeds one', () => {
    const { rerender } = wrap(<ItemDisplay item={{ ...base, quantity: 3 }} />);
    expect(screen.getByText('×3')).toBeInTheDocument();
    rerender(
      <IntlProvider locale="en" messages={enUS}>
        <ItemDisplay item={base} />
      </IntlProvider>,
    );
    expect(screen.queryByText(/^×/)).toBeNull();
  });

  it('hides parameters unless opted in', () => {
    wrap(<ItemDisplay item={base} parameters={PARAMS} />);
    expect(screen.queryByText(/Color/)).toBeNull();
  });

  it('shows opt-in parameters as localized key-value pairs incl. ranges', () => {
    wrap(<ItemDisplay item={base} parameters={PARAMS} showParameters />);
    expect(screen.getByText('Color: red')).toBeInTheDocument();
    // Range values display both canonical bounds with the entered unit.
    expect(screen.getByText('Weight: 5 ~ 10 kg')).toBeInTheDocument();
    // User-created definitions keep their raw name; decimals lose zero-padding.
    expect(screen.getByText('capacity: 1500')).toBeInTheDocument();
  });

  it('highlights search matches inside the primary text', () => {
    wrap(<ItemDisplay item={base} highlight="product" />);
    const mark = screen.getByText('Product');
    expect(mark.tagName).toBe('MARK');
  });

  it('renders extra secondary context when provided', () => {
    wrap(<ItemDisplay item={base} extraSecondary={<span>淘寶 · 2026-06-26</span>} />);
    expect(screen.getByText('淘寶 · 2026-06-26')).toBeInTheDocument();
  });
});

describe('parameterPairs', () => {
  it('formats single dimension values with their unit', () => {
    const pairs = parameterPairs(
      [{ name: 'length', data_type: 'dimension', value: '14', unit: 'cm' }],
      (id) => ({ 'pages.inventory.items.col.length': 'Length' })[id] ?? id,
    );
    expect(pairs).toEqual([{ emoji: '', label: 'Length: 14 cm' }]);
  });

  it('formats number-typed ranges without a unit (FR-002b, iteration 28)', () => {
    const pairs = parameterPairs(
      [{ name: 'stretch', data_type: 'number', value: '74~164', unit: '' }],
      (id) => id,
    );
    expect(pairs).toEqual([{ emoji: '', label: 'stretch: 74 ~ 164' }]);
  });

  it('formats tilde ranges', () => {
    const pairs = parameterPairs(
      [{ name: 'temp', data_type: 'dimension', value: '-10~40', unit: '°C' }],
      (id) => id,
    );
    expect(pairs).toEqual([{ emoji: '', label: 'temp: -10 ~ 40 °C' }]);
  });
});

describe('parameter emoji (FR-032)', () => {
  const EMOJI_PARAMS: ParameterDisplay[] = [
    { name: 'color', data_type: 'text', value: 'red', unit: '', emoji: '🎨' },
    { name: 'capacity', data_type: 'number', value: '1500', unit: '', emoji: '' },
  ];

  it('parameterPairs returns emoji alongside the localized label', () => {
    const pairs = parameterPairs(EMOJI_PARAMS, (id) =>
      ({ 'pages.inventory.items.col.color': 'Color' })[id] ?? id,
    );
    expect(pairs).toEqual([
      { emoji: '🎨', label: 'Color: red' },
      { emoji: '', label: 'capacity: 1500' },
    ]);
  });

  it('renders a monochrome emoji prefix before the key', () => {
    wrap(<ItemDisplay item={base} parameters={EMOJI_PARAMS} showParameters />);
    const emoji = screen.getByText('🎨');
    // Silhouette technique: transparent fill + currentColor shadow inherits text color.
    expect(emoji.style.webkitTextFillColor).toBe('transparent');
    expect(emoji.style.textShadow).toContain('currentcolor');
    // Vertically centered on the key's text line (iteration 41).
    expect(emoji.style.display).toBe('inline-flex');
    expect(emoji.style.alignItems).toBe('center');
    expect(emoji.style.verticalAlign).toBe('middle');
    expect(screen.getByText(/Color: red/)).toBeInTheDocument();
    // No emoji span for definitions without one.
    expect(screen.getByText('capacity: 1500').textContent).toBe('capacity: 1500');
  });
});

describe('remark icon + deprecated warning (iteration 36)', () => {
  it('shows a comment icon with the remark in a tooltip when remark is set', async () => {
    wrap(<ItemDisplay item={{ ...base, remark: 'gifted by A\nsecond line' }} />);
    const icon = document.querySelector('[data-testid="remark-icon"]')!;
    expect(icon).toBeTruthy();
    // Suffixed to the NAME (iteration 37): the name wrapper shrinks-to-fit so
    // the icon hugs the text end, never the row's far edge.
    const nameWrap = icon.parentElement!.querySelector('div')!;
    expect(nameWrap.style.flex).toBe('0 1 auto');
    // Vertically centered on the name's row (iteration 38) — baseline floats
    // SVG icons off the text line.
    expect((icon.parentElement as HTMLElement).style.alignItems).toBe('center');
    fireEvent.mouseEnter(icon);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('gifted by A');
    // No icon without a remark.
    wrap(<ItemDisplay item={base} />);
    expect(document.querySelectorAll('[data-testid="remark-icon"]')).toHaveLength(1);
  });

  it('shows the deprecated warning only when opted in', async () => {
    const dep = { ...base, deprecated: true, deprecate_time: '2026-01-05T00:00:00Z' };
    const { rerender } = wrap(<ItemDisplay item={dep} />);
    expect(document.querySelector('[data-testid="deprecated-warning"]')).toBeNull();
    rerender(
      <IntlProvider locale="en" messages={enUS}>
        <ItemDisplay item={dep} showDeprecatedWarning />
      </IntlProvider>,
    );
    const warn = document.querySelector('[data-testid="deprecated-warning"]')!;
    expect(warn).toBeTruthy();
    fireEvent.mouseEnter(warn);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/Deprecated/);
    expect(tooltip).toHaveTextContent(/2026-01-05/);
  });

  it('omits the warning for active items even when opted in', () => {
    wrap(<ItemDisplay item={{ ...base, deprecated: false }} showDeprecatedWarning />);
    expect(document.querySelector('[data-testid="deprecated-warning"]')).toBeNull();
  });
});

// Quick search (019 US3): parameter tags carry the highlight too.
describe('ParameterTag highlight (019)', () => {
  it('marks query matches inside parameter tag labels', () => {
    const { container } = wrap(
      <ItemDisplay
        item={base}
        parameters={[{ name: 'color', data_type: 'text', value: 'crimson red', unit: '' }]}
        showParameters
        highlight="crimson"
      />,
    );
    const mark = container.querySelector('.ant-tag mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('crimson');
  });

  it('renders no marks in tags without a highlight', () => {
    const { container } = wrap(
      <ItemDisplay
        item={base}
        parameters={[{ name: 'color', data_type: 'text', value: 'crimson red', unit: '' }]}
        showParameters
      />,
    );
    expect(container.querySelector('.ant-tag mark')).toBeNull();
  });
});
