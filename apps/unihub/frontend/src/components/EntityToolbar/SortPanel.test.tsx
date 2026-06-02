import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { SortPanel } from './SortPanel';
import type { UseEntitySortReturn } from './hooks/useEntitySort';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={enUS}>
      {children}
    </IntlProvider>
  </MemoryRouter>
);

const makeHook = (overrides: Partial<UseEntitySortReturn> = {}): UseEntitySortReturn => ({
  isActive: false,
  isDirty: false,
  activeRules: [],
  pendingRules: [{ field: '', direction: 'asc' }],
  apply: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
  setPendingRules: vi.fn(),
  handleHeaderClick: vi.fn(),
  sortOrderForField: vi.fn().mockReturnValue(null),
  toOrderingParam: vi.fn().mockReturnValue(undefined),
  ...overrides,
} as unknown as UseEntitySortReturn);

const ATTRS = [
  { key: 'name', label: 'Name', dataType: 'text' as const },
  { key: 'score', label: 'Score', dataType: 'number' as const },
];

function renderPanel(hookOverrides: Partial<UseEntitySortReturn> = {}) {
  const hook = makeHook(hookOverrides);
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<SortPanel attrs={ATTRS} hook={hook} onApply={onApply} onClose={onClose} />, { wrapper });
  return { hook, onApply, onClose };
}

describe('SortPanel', () => {
  // SP-01: Reset button is present
  it('renders a Reset button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  // SP-02: Reset calls hook.reset() and onApply() (needs isActive=true to be enabled)
  it('Reset button calls hook.reset() and onApply()', () => {
    const { hook, onApply } = renderPanel({ isActive: true });
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(hook.reset).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalled();
  });

  // SP-03: Apply calls hook.apply() and onApply() (needs isDirty=true to be enabled)
  it('Apply button calls hook.apply() and onApply()', () => {
    const { hook, onApply } = renderPanel({ isDirty: true });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(hook.apply).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalled();
  });

  // SP-04: Cancel calls cancel() and onClose()
  it('Cancel button calls hook.cancel() and onClose()', () => {
    const { hook, onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(hook.cancel).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // SP-07: Reset and Cancel are on the left side (both inside the same Space)
  it('Reset and Cancel buttons are in the same Space container (left side)', () => {
    renderPanel();
    const reset = screen.getByRole('button', { name: /reset/i });
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(reset.closest('.ant-space')).toBe(cancel.closest('.ant-space'));
  });

  // SP-05: Cancel button gets a visible box-shadow highlight when focusCancelOn changes
  it('highlights the Cancel button when focusCancelOn changes', () => {
    const { rerender } = render(
      <SortPanel attrs={ATTRS} hook={makeHook()} onApply={vi.fn()} onClose={vi.fn()} focusCancelOn={0} />,
      { wrapper },
    );
    rerender(
      <SortPanel attrs={ATTRS} hook={makeHook()} onApply={vi.fn()} onClose={vi.fn()} focusCancelOn={1} />,
    );
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(cancelBtn.style.boxShadow).not.toBe('');
  });

  // SP-06: Apply disabled when not dirty, enabled when dirty
  it('Apply button disabled when not dirty, enabled when dirty', () => {
    const { rerender } = render(
      <SortPanel attrs={ATTRS} hook={makeHook({ isDirty: false })} onApply={vi.fn()} onClose={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    rerender(
      <SortPanel attrs={ATTRS} hook={makeHook({ isDirty: true })} onApply={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled();
  });

  // SP-07b: Reset disabled when nothing active and not dirty
  it('Reset button disabled when isActive=false and isDirty=false', () => {
    renderPanel({ isActive: false, isDirty: false });
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
  });

  // SP-07c: Reset enabled when isActive or isDirty
  it('Reset button enabled when isActive=true', () => {
    renderPanel({ isActive: true });
    expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
  });
});
