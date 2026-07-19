import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemName } from './index';

const base = { name: 'Seller Product Name', alias_name: '', url: '' };

describe('ItemName (FR-030)', () => {
  it('renders the raw name when no alias is set', () => {
    render(<ItemName item={base} />);
    expect(screen.getByText('Seller Product Name')).toBeInTheDocument();
  });

  it('prefers the alias and shows the original name in a tooltip', async () => {
    render(<ItemName item={{ ...base, alias_name: 'My Torch' }} />);
    const alias = screen.getByText('My Torch');
    expect(screen.queryByText('Seller Product Name')).toBeNull();
    fireEvent.mouseEnter(alias);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Seller Product Name');
  });

  it('wraps in a new-tab link when linkify and a url exist', () => {
    render(<ItemName item={{ ...base, url: 'https://x.example/p' }} linkify />);
    const link = screen.getByText('Seller Product Name').closest('a')!;
    expect(link).toHaveAttribute('href', 'https://x.example/p');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('renders plain text when linkify but no url', () => {
    render(<ItemName item={base} linkify />);
    expect(screen.getByText('Seller Product Name').closest('a')).toBeNull();
  });
});

describe('ItemName truncate mode (iteration 19)', () => {
  it('aliased: single tooltip carries the original name (no nesting)', async () => {
    render(<ItemName item={{ ...base, alias_name: 'Torchy' }} truncate />);
    const el = screen.getByText('Torchy');
    fireEvent.mouseEnter(el);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Seller Product Name');
    // Exactly one tooltip layer.
    expect(document.querySelectorAll('.ant-tooltip').length).toBe(1);
  });

  it('unaliased and fully visible: no tooltip', async () => {
    render(<ItemName item={base} truncate />);
    fireEvent.mouseEnter(screen.getByText('Seller Product Name'));
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('.ant-tooltip-open')).toBeNull();
  });

  it('unaliased and truncated: tooltip gated on actual overflow', async () => {
    render(<ItemName item={base} truncate />);
    const span = screen.getByText('Seller Product Name').closest('span')!;
    Object.defineProperty(span, 'scrollWidth', { value: 300, configurable: true });
    Object.defineProperty(span, 'clientWidth', { value: 100, configurable: true });
    fireEvent.mouseEnter(span);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Seller Product Name');
  });
});
