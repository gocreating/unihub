import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { EntityOffsetFooter } from './EntityOffsetFooter';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={enUS}>
      {children}
    </IntlProvider>
  </MemoryRouter>
);

describe('EntityOffsetFooter', () => {
  // O-01: total count shown on left via i18n key
  it('displays total count using i18n format', () => {
    render(
      <EntityOffsetFooter total={42} pageSize={25} current={1} onChange={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByText('42 records')).toBeInTheDocument();
  });

  // O-02: zero total
  it('displays 0 records when total is 0', () => {
    render(
      <EntityOffsetFooter total={0} pageSize={25} current={1} onChange={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByText('0 records')).toBeInTheDocument();
  });

  // O-03: undefined total — no count text (prevents "0 records" flash while loading)
  it('shows no total text when total is undefined', () => {
    render(
      <EntityOffsetFooter total={undefined} pageSize={25} current={1} onChange={vi.fn()} />,
      { wrapper },
    );
    expect(screen.queryByText(/\d+ records/)).toBeNull();
  });

  // O-04: onChange fires when a page number is clicked
  it('calls onChange when page 2 is clicked', () => {
    const onChange = vi.fn();
    render(
      <EntityOffsetFooter total={100} pageSize={25} current={1} onChange={onChange} />,
      { wrapper },
    );
    fireEvent.click(screen.getByText('2'));
    expect(onChange).toHaveBeenCalledWith(2, 25);
  });

  // O-10 (constitution v1.19.0): information left, controls right — the count
  // text leads; the per-page selector and pagination are grouped flush right,
  // selector before pagination.
  it('places the record count left and selector+pagination grouped right', () => {
    const { container } = render(
      <EntityOffsetFooter total={100} pageSize={25} current={1} onChange={vi.fn()} />,
      { wrapper },
    );
    const root = container.firstElementChild!;
    const children = Array.from(root.children);
    const left = children[0]!;
    const right = children[children.length - 1]!;
    expect(left.textContent).toContain('100 records');
    // No interactive control on the left side.
    expect(left.querySelector('.ant-select')).toBeNull();
    expect(left.querySelector('.ant-pagination')).toBeNull();
    // Selector and pagination live together on the right, selector first.
    const select = right.querySelector('.ant-select');
    const pagination = right.querySelector('.ant-pagination');
    expect(select).toBeTruthy();
    expect(pagination).toBeTruthy();
    expect(
      select!.compareDocumentPosition(pagination!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // O-05: page size selector combobox present
  it('renders a page size selector combobox', () => {
    render(
      <EntityOffsetFooter total={100} pageSize={25} current={1} onChange={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  // O-06: current page is reflected
  it('marks current page as active', () => {
    render(
      <EntityOffsetFooter total={100} pageSize={25} current={2} onChange={vi.fn()} />,
      { wrapper },
    );
    const activePage = document.querySelector('.ant-pagination-item-active');
    expect(activePage?.textContent?.trim()).toBe('2');
  });

  // O-07: custom pageSizeOptions are shown in the selector dropdown
  it('shows custom pageSizeOptions in selector dropdown', () => {
    render(
      <EntityOffsetFooter total={100} pageSize={10} current={1} onChange={vi.fn()} pageSizeOptions={[10, 20]} />,
      { wrapper },
    );
    fireEvent.mouseDown(screen.getByRole('combobox'));
    expect(screen.getAllByText(/10 \/ page/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/20 \/ page/i)).toBeInTheDocument();
  });

  // O-08: selecting a different size calls onChange(1, newSize) — resets to page 1
  it('calls onChange(1, newSize) when a page size option is selected', () => {
    const onChange = vi.fn();
    render(
      <EntityOffsetFooter total={100} pageSize={25} current={3} onChange={onChange} pageSizeOptions={[25, 50]} />,
      { wrapper },
    );
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('50 / page'));
    expect(onChange).toHaveBeenCalledWith(1, 50);
  });

  // O-09: typing a number not in the preset list adds it as a custom option
  it('adds a custom page size option when user types a number', () => {
    render(
      <EntityOffsetFooter total={100} pageSize={25} current={1} onChange={vi.fn()} pageSizeOptions={[25, 50]} />,
      { wrapper },
    );
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '75' } });
    expect(screen.getByText('75 / page')).toBeInTheDocument();
  });
});

// Iteration 15: custom info-side text replaces "{total} records" when provided.
describe('EntityOffsetFooter totalText slot', () => {
  it('renders the custom total text instead of the default records line', () => {
    render(
      <EntityOffsetFooter
        total={90}
        pageSize={25}
        current={1}
        onChange={vi.fn()}
        totalText="68 acquisitions, 90 items"
      />,
      { wrapper },
    );
    expect(screen.getByText('68 acquisitions, 90 items')).toBeInTheDocument();
    expect(screen.queryByText('90 records')).toBeNull();
  });
});
