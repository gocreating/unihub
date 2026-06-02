import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { EntityToolbar } from './EntityToolbar';
import type { UseEntityFilterReturn } from './hooks/useEntityFilter';
import type { UseEntitySortReturn } from './hooks/useEntitySort';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={enUS}>
      {children}
    </IntlProvider>
  </MemoryRouter>
);

const makeFilter = (overrides: Partial<UseEntityFilterReturn> = {}): UseEntityFilterReturn =>
  ({
    isActive: false, isDirty: false,
    activeGroups: [], pendingGroups: [],
    pendingRoot: { id: '1', type: 'group', logic: 'and', rules: [] },
    setPendingGroups: vi.fn(), setPendingRoot: vi.fn(),
    apply: vi.fn(), cancel: vi.fn(), reset: vi.fn(),
    toApiParam: vi.fn().mockReturnValue(undefined),
    ...overrides,
  }) as unknown as UseEntityFilterReturn;

const makeSort = (overrides: Partial<UseEntitySortReturn> = {}): UseEntitySortReturn =>
  ({
    isActive: false, isDirty: false,
    activeRules: [], pendingRules: [],
    apply: vi.fn(), cancel: vi.fn(), reset: vi.fn(),
    handleHeaderClick: vi.fn(),
    sortOrderForField: vi.fn().mockReturnValue(null),
    toOrderingParam: vi.fn().mockReturnValue(undefined),
    ...overrides,
  }) as unknown as UseEntitySortReturn;

const emptyColumnState = { columns: [], stickyLeft: false, stickyRight: false };

const makeColumns = (overrides: Partial<UseColumnConfigReturn> = {}): UseColumnConfigReturn =>
  ({
    isCustomised: false, isDirty: false,
    visibleColumns: [],
    activeState: emptyColumnState,
    pendingState: emptyColumnState,
    firstColumnFixed: undefined, lastColumnFixed: undefined,
    apply: vi.fn(), cancel: vi.fn(), reset: vi.fn(), setPendingState: vi.fn(),
    ...overrides,
  }) as unknown as UseColumnConfigReturn;

const defaultProps = {
  filterProps: { attrs: [], hook: makeFilter() },
  sortProps:   { attrs: [], hook: makeSort() },
  columnProps: { hook: makeColumns() },
};

function renderToolbar(overrides: Partial<typeof defaultProps> = {}) {
  return render(<EntityToolbar {...defaultProps} {...overrides} />, { wrapper });
}

const isPrimary = (btn: HTMLElement) => btn.classList.contains('ant-btn-primary');

describe('EntityToolbar button variant', () => {
  // T-01: all buttons default when nothing applied
  it('renders all buttons as default when no config is applied', () => {
    renderToolbar();
    expect(isPrimary(screen.getByRole('button', { name: /filter/i }))).toBe(false);
    expect(isPrimary(screen.getByRole('button', { name: /sort/i }))).toBe(false);
    expect(isPrimary(screen.getByRole('button', { name: /columns/i }))).toBe(false);
  });

  // T-02: opening filter panel must NOT change button style
  it('filter button stays default when panel is opened without active filter', () => {
    renderToolbar();
    const btn = screen.getByRole('button', { name: /filter/i });
    fireEvent.click(btn);
    expect(isPrimary(btn)).toBe(false);
  });

  // T-03: filter active → primary
  it('filter button is primary when filter is active', () => {
    renderToolbar({ filterProps: { attrs: [], hook: makeFilter({ isActive: true }) } });
    expect(isPrimary(screen.getByRole('button', { name: /filter/i }))).toBe(true);
  });

  // T-04: sort active → primary
  it('sort button is primary when sort is active', () => {
    renderToolbar({ sortProps: { attrs: [], hook: makeSort({ isActive: true }) } });
    expect(isPrimary(screen.getByRole('button', { name: /sort/i }))).toBe(true);
  });

  // T-05: opening columns panel must NOT change button style
  it('columns button stays default when panel is opened without customisation', () => {
    renderToolbar();
    const btn = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(btn);
    expect(isPrimary(btn)).toBe(false);
  });

  // T-06: columns customised → primary
  it('columns button is primary when columns are customised', () => {
    renderToolbar({ columnProps: { hook: makeColumns({ isCustomised: true }) } });
    expect(isPrimary(screen.getByRole('button', { name: /columns/i }))).toBe(true);
  });
});

describe('EntityToolbar cross-panel dirty blocking', () => {
  // T-07: clicking Sort button while Filter panel is dirty keeps Sort closed
  it('does not open Sort panel when Filter panel is dirty', () => {
    renderToolbar({
      filterProps: { attrs: [], hook: makeFilter({ isDirty: true }) },
    });
    const sortBtn = screen.getByRole('button', { name: /sort/i });
    fireEvent.click(sortBtn);
    // Sort dropdown should NOT open (no sort panel content visible)
    expect(document.querySelector('.ant-dropdown-open')).toBeNull();
  });

  // T-08: clicking Columns button while Sort panel is dirty keeps Columns closed
  it('does not open Columns panel when Sort panel is dirty', () => {
    renderToolbar({
      sortProps: { attrs: [], hook: makeSort({ isDirty: true }) },
    });
    fireEvent.click(screen.getByRole('button', { name: /columns/i }));
    expect(document.querySelector('.ant-dropdown-open')).toBeNull();
  });
});
