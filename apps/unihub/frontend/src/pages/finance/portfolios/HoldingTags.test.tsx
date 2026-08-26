import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoldingTags } from './HoldingTags';

/**
 * FR-052 / I9-2: holdings render as badges — one default Tag per asset with
 * the quantity in the strong tone and the asset name muted. ONE component
 * serves the Portfolios list Position column and the Accumulated Position
 * column of the transactions table.
 */
const HOLDINGS = [
  { asset_id: 'a1', asset_name: '00918.TW', quantity: '2145.000000000000000000' },
  { asset_id: 'a2', asset_name: '0050.TW', quantity: '20' },
];

describe('<HoldingTags>', () => {
  it('renders one tag per holding, quantity first', () => {
    const { container } = render(<HoldingTags holdings={HOLDINGS} />);
    const tags = [...container.querySelectorAll('.ant-tag')];
    expect(tags.map((t) => t.textContent)).toEqual(['2,145 00918.TW', '20 0050.TW']);
  });

  it('shows the quantity and the asset name in different tones', () => {
    render(<HoldingTags holdings={HOLDINGS} />);
    expect(screen.getByText('00918.TW')).toHaveClass('ant-typography-secondary');
    expect(screen.getByText(/2,145/)).not.toHaveClass('ant-typography-secondary');
  });

  it('shows no plus sign — a holding is a balance — but keeps a minus', () => {
    const { container } = render(
      <HoldingTags holdings={[{ asset_id: 'x', asset_name: 'ETH', quantity: '-0.5' }]} />,
    );
    expect(container.textContent).toBe('−0.5 ETH');
  });

  it('renders the shared empty placeholder for no holdings, never an empty tag', () => {
    const { container } = render(<HoldingTags holdings={[]} />);
    expect(container.textContent).toBe('-');
    expect(container.querySelector('.ant-tag')).toBeNull();
  });

  it('works without asset ids (the running totals carry only names)', () => {
    const { container } = render(
      <HoldingTags holdings={[{ asset_name: 'BTC', quantity: '0.25' }]} />,
    );
    expect(container.querySelectorAll('.ant-tag')).toHaveLength(1);
  });
});
