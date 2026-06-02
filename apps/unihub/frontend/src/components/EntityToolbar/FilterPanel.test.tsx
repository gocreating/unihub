import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { FilterPanel } from './FilterPanel';
import { emptyRoot, emptyRule } from './hooks/useEntityFilter';
import type { FilterGroupItem } from './types';
import type { UseEntityFilterReturn } from './hooks/useEntityFilter';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={enUS}>
      {children}
    </IntlProvider>
  </MemoryRouter>
);

const ATTRS = [
  { key: 'name',   label: 'Name',   dataType: 'text' as const },
  { key: 'score',  label: 'Score',  dataType: 'number' as const },
  { key: 'status', label: 'Status', dataType: 'single_select' as const, options: ['Active', 'Inactive'] },
];

const makeRoot = (overrides: Partial<FilterGroupItem> = {}): FilterGroupItem => ({
  ...emptyRoot(),
  ...overrides,
});

const makeHook = (overrides: Partial<UseEntityFilterReturn> = {}): UseEntityFilterReturn => ({
  pendingRoot: makeRoot(),
  setPendingRoot: vi.fn(),
  pendingGroups: [],
  activeGroups: [],
  setPendingGroups: vi.fn(),
  apply: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
  isActive: false,
  isDirty: false,
  toApiParam: vi.fn().mockReturnValue(undefined),
  ...overrides,
} as unknown as UseEntityFilterReturn);

function renderPanel(hookOverrides: Partial<UseEntityFilterReturn> = {}) {
  const hook = makeHook(hookOverrides);
  const onApply = vi.fn();
  const onClose  = vi.fn();
  render(
    <FilterPanel attrs={ATTRS} hook={hook} onApply={onApply} onClose={onClose} />,
    { wrapper },
  );
  return { hook, onApply, onClose };
}

describe('FilterPanel', () => {
  // FP-01: default root has exactly one rule
  it('renders one rule row by default (emptyRoot has one rule)', () => {
    renderPanel();
    // 1 rule = field selector + operator selector = 2 comboboxes minimum
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBeGreaterThanOrEqual(2);
  });

  // FP-01b: no AND/OR badge when there is only one rule
  it('shows no AND/OR badge when root has only one rule', () => {
    renderPanel(); // emptyRoot() has 1 rule
    expect(screen.queryByTestId('logic-badge')).toBeNull();
  });

  // FP-02: AND badge appears between two rules
  it('renders AND badge between two rules', () => {
    const root = makeRoot({ rules: [emptyRule(), emptyRule()] });
    renderPanel({ pendingRoot: root });
    expect(screen.getByTestId('logic-badge')).toHaveTextContent('AND');
  });

  // FP-03: clicking AND badge calls setPendingRoot with logic toggled to OR
  it('toggles logic from AND to OR when badge is clicked', () => {
    const root = makeRoot({ rules: [emptyRule(), emptyRule()] });
    const { hook } = renderPanel({ pendingRoot: root });
    fireEvent.click(screen.getByTestId('logic-badge'));
    expect(hook.setPendingRoot).toHaveBeenCalledWith(
      expect.objectContaining({ logic: 'or' }),
    );
  });

  // FP-04: clicking OR badge toggles back to AND
  it('toggles logic from OR to AND when badge is clicked', () => {
    const root = makeRoot({ logic: 'or', rules: [emptyRule(), emptyRule()] });
    const { hook } = renderPanel({ pendingRoot: root });
    fireEvent.click(screen.getByTestId('logic-badge'));
    expect(hook.setPendingRoot).toHaveBeenCalledWith(
      expect.objectContaining({ logic: 'and' }),
    );
  });

  // FP-08b: ✕ button disabled when there is only one rule (no auto-reset needed)
  it('disables the ✕ button when there is only one rule', () => {
    const root = makeRoot({ rules: [emptyRule()] });
    renderPanel({ pendingRoot: root });
    const deleteBtn = screen.getByRole('button', { name: /✕/i });
    expect(deleteBtn).toBeDisabled();
  });

  // FP-08c: ✕ button enabled when there are multiple rules
  it('enables the ✕ button when there are multiple rules', () => {
    const root = makeRoot({ rules: [emptyRule(), emptyRule()] });
    renderPanel({ pendingRoot: root });
    const deleteBtns = screen.getAllByRole('button', { name: /✕/i });
    expect(deleteBtns[0]).not.toBeDisabled();
  });

  // FP-05: Apply button calls apply() and onApply() (needs isDirty=true to be enabled)
  it('calls apply() and onApply() when Apply is clicked', () => {
    const { hook, onApply } = renderPanel({ isDirty: true });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(hook.apply).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalled();
  });

  // FP-06: Cancel button calls cancel() and onClose()
  it('calls cancel() and onClose() when Cancel is clicked', () => {
    const { hook, onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(hook.cancel).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // FP-07: no-value operator shows hint text instead of input
  it('shows "no value needed" when operator has no value', () => {
    const root = makeRoot({
      rules: [{ id: 'r1', attr: 'name', op: 'is_empty', val: '' }],
    });
    renderPanel({ pendingRoot: root });
    expect(screen.getByText(/no value needed/i)).toBeInTheDocument();
  });

  // FP-08: removing a rule calls setPendingRoot without that rule (needs 2 rules so button is enabled)
  it('removes a rule when its ✕ button is clicked', () => {
    const root = makeRoot({ rules: [emptyRule(), emptyRule()] });
    const { hook } = renderPanel({ pendingRoot: root });
    const deleteBtns = screen.getAllByRole('button', { name: /✕/i });
    fireEvent.click(deleteBtns[0]!);
    const call = (hook.setPendingRoot as ReturnType<typeof vi.fn>).mock.calls[0]![0] as FilterGroupItem;
    expect(call.rules).toHaveLength(1);
  });

  // FP-09: + Rule button adds a rule to the root group
  it('adds a rule when + Rule is clicked', () => {
    const root = makeRoot({ rules: [emptyRule()] });
    const { hook } = renderPanel({ pendingRoot: root });
    fireEvent.click(screen.getByRole('button', { name: /rule/i }));
    const call = (hook.setPendingRoot as ReturnType<typeof vi.fn>).mock.calls[0]![0] as FilterGroupItem;
    expect(call.rules).toHaveLength(2);
  });

  // FP-10: + Group button adds a nested group (type: 'group')
  it('adds a nested group when + Group is clicked', () => {
    const { hook } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /group/i }));
    const call = (hook.setPendingRoot as ReturnType<typeof vi.fn>).mock.calls[0]![0] as FilterGroupItem;
    const added = call.rules[call.rules.length - 1]!;
    expect((added as FilterGroupItem).type).toBe('group');
  });

  // FP-11: nested group renders with its own AND/OR badge and + Rule / no + Group (depth limit)
  it('nested group does not show + Group button (depth limit)', () => {
    const root = makeRoot({
      rules: [
        emptyRule(),
        { id: 'g1', type: 'group', logic: 'or', rules: [emptyRule(), emptyRule()] } satisfies FilterGroupItem,
      ],
    });
    renderPanel({ pendingRoot: root });
    // Outer group shows + Group, inner group does not → only one + Group button
    const groupBtns = screen.getAllByRole('button', { name: /group/i });
    expect(groupBtns).toHaveLength(1);
  });

  // FP-Reset-01: Reset button is present
  it('renders a Reset button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  // FP-Reset-02: Reset calls hook.reset() and onApply() (needs isActive=true to be enabled)
  it('Reset button calls hook.reset() and onApply()', () => {
    const { hook, onApply } = renderPanel({ isActive: true });
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(hook.reset).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalled();
  });

  // FP-Focus-01: Cancel button gets a visible box-shadow highlight when focusCancelOn changes
  it('highlights the Cancel button when focusCancelOn changes', () => {
    const { rerender } = render(
      <FilterPanel attrs={ATTRS} hook={makeHook()} onApply={vi.fn()} onClose={vi.fn()} focusCancelOn={0} />,
      { wrapper },
    );
    rerender(
      <FilterPanel attrs={ATTRS} hook={makeHook()} onApply={vi.fn()} onClose={vi.fn()} focusCancelOn={1} />,
    );
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(cancelBtn.style.boxShadow).not.toBe('');
  });

  // FP-Apply-Disabled-01: Apply disabled when not dirty
  it('Apply button is disabled when isDirty is false', () => {
    renderPanel({ isDirty: false });
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  // FP-Apply-Disabled-02: Apply enabled when dirty
  it('Apply button is enabled when isDirty is true', () => {
    renderPanel({ isDirty: true });
    expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled();
  });

  // FP-Reset-Disabled-01: Reset disabled when state is already default (nothing active, not dirty)
  it('Reset button is disabled when isActive is false and isDirty is false', () => {
    renderPanel({ isActive: false, isDirty: false });
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
  });

  // FP-Reset-Disabled-02: Reset enabled when there are active filters
  it('Reset button is enabled when isActive is true', () => {
    renderPanel({ isActive: true, isDirty: false });
    expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
  });

  // FP-Reset-Disabled-03: Reset enabled when panel is dirty (pending changes to clear)
  it('Reset button is enabled when isDirty is true', () => {
    renderPanel({ isActive: false, isDirty: true });
    expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
  });

  // FP-12: nested group ✕ disabled when it is the only item in the parent
  it('disables nested group ✕ when it is the only item in the parent group', () => {
    const root = makeRoot({
      rules: [
        { id: 'g1', type: 'group', logic: 'or', rules: [emptyRule()] } satisfies FilterGroupItem,
      ],
    });
    renderPanel({ pendingRoot: root });
    // The circular group-remove button has a title attribute — check it is disabled
    const groupRemoveBtn = document.querySelector<HTMLButtonElement>('button[title]');
    expect(groupRemoveBtn).not.toBeNull();
    expect(groupRemoveBtn).toBeDisabled();
  });

  // FP-12b: nested group ✕ enabled when parent has multiple items
  it('enables nested group ✕ when parent group has multiple items', () => {
    const root = makeRoot({
      rules: [
        emptyRule(),
        { id: 'g1', type: 'group', logic: 'or', rules: [emptyRule()] } satisfies FilterGroupItem,
      ],
    });
    renderPanel({ pendingRoot: root });
    // The nested group's circular ✕ (the one with title attr) should be enabled
    const groupRemoveBtn = document.querySelector<HTMLButtonElement>(
      'button[title]',
    );
    expect(groupRemoveBtn).not.toBeNull();
    expect(groupRemoveBtn).not.toBeDisabled();
  });

  // ── Drag & drop (logic tested via SortableList.test.tsx reorderById) ─────────
  // FilterPanel now uses dnd-kit (SortableList) for drag sorting — see
  // SortableList.test.tsx for comprehensive reorder logic tests. The actual
  // drag mechanism is verified by the Playwright E2E tests.
});
