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
    expect(screen.getByText('Weight: 5 - 10 kg')).toBeInTheDocument();
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
    expect(pairs).toEqual(['Length: 14 cm']);
  });

  it('formats tilde ranges', () => {
    const pairs = parameterPairs(
      [{ name: 'temp', data_type: 'dimension', value: '-10~40', unit: '°C' }],
      (id) => id,
    );
    expect(pairs).toEqual(['temp: -10 - 40 °C']);
  });
});
