import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ColumnPanel } from './ColumnPanel';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';
import type { ColumnState } from './types';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={enUS}>
      {children}
    </IntlProvider>
  </MemoryRouter>
);

const defaultPending: ColumnState = {
  columns: [
    { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0 },
    { key: 'score', label: 'Score', dataType: 'number', visible: true, order: 1 },
  ],
  stickyLeft: false,
  stickyRight: false,
};

const makeHook = (overrides: Partial<UseColumnConfigReturn> = {}): UseColumnConfigReturn => ({
  isCustomised: false,
  isDirty: false,
  pendingState: defaultPending,
  activeState: defaultPending,
  visibleColumns: defaultPending.columns,
  firstColumnFixed: undefined,
  lastColumnFixed: undefined,
  apply: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
  setPendingState: vi.fn(),
  ...overrides,
} as unknown as UseColumnConfigReturn);

function renderPanel(hookOverrides: Partial<UseColumnConfigReturn> = {}) {
  const hook = makeHook(hookOverrides);
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<ColumnPanel hook={hook} onApply={onApply} onClose={onClose} />, { wrapper });
  return { hook, onApply, onClose };
}

describe('ColumnPanel', () => {
  // CP-01: Reset button is present
  it('renders a Reset button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  // CP-02: Reset calls hook.reset() and onApply() (needs isCustomised=true to be enabled)
  it('Reset button calls hook.reset() and onApply()', () => {
    const { hook, onApply } = renderPanel({ isCustomised: true });
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(hook.reset).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalled();
  });

  // CP-03: Apply calls hook.apply() and onApply() (needs isDirty=true to be enabled)
  it('Apply button calls hook.apply() and onApply()', () => {
    const { hook, onApply } = renderPanel({ isDirty: true });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(hook.apply).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalled();
  });

  // CP-04: Cancel calls hook.cancel() and onClose()
  it('Cancel button calls hook.cancel() and onClose()', () => {
    const { hook, onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(hook.cancel).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // CP-05: Cancel button gets a visible box-shadow highlight when focusCancelOn changes
  it('highlights the Cancel button when focusCancelOn changes', () => {
    const { rerender } = render(
      <ColumnPanel hook={makeHook()} onApply={vi.fn()} onClose={vi.fn()} focusCancelOn={0} />,
      { wrapper },
    );
    rerender(
      <ColumnPanel hook={makeHook()} onApply={vi.fn()} onClose={vi.fn()} focusCancelOn={1} />,
    );
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(cancelBtn.style.boxShadow).not.toBe('');
  });

  // CP-06: Apply disabled when not dirty, enabled when dirty
  it('Apply button disabled when not dirty, enabled when dirty', () => {
    const { rerender } = render(
      <ColumnPanel hook={makeHook({ isDirty: false })} onApply={vi.fn()} onClose={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    rerender(
      <ColumnPanel hook={makeHook({ isDirty: true })} onApply={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled();
  });

  // CP-07b: Reset disabled when not customised and not dirty
  it('Reset button disabled when isCustomised=false and isDirty=false', () => {
    renderPanel({ isCustomised: false, isDirty: false });
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
  });

  // CP-07c: Reset enabled when customised
  it('Reset button enabled when isCustomised=true', () => {
    renderPanel({ isCustomised: true });
    expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
  });

  // CP-07: Reset and Cancel are on the left side (both inside the same Space)
  it('Reset and Cancel buttons are in the same Space container (left side)', () => {
    renderPanel();
    const reset = screen.getByRole('button', { name: /reset/i });
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(reset.closest('.ant-space')).toBe(cancel.closest('.ant-space'));
  });
});
