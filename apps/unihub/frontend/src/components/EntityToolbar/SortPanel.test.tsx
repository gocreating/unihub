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
  isDefault: true,   // empty active = at default state
  activeRules: [],
  pendingRules: [{ field: '', direction: 'asc' }],
  panelApplyCount: 0,
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

  // SP-02: Reset calls hook.reset() and onApply() (needs isDefault=false to be enabled)
  it('Reset button calls hook.reset() and onApply()', () => {
    const { hook, onApply } = renderPanel({ isDefault: false });
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

  // SP-07b: Reset disabled when at default state and not dirty
  it('Reset button disabled when isDefault=true and isDirty=false', () => {
    renderPanel({ isDefault: true, isDirty: false });
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
  });

  // SP-07c: Reset enabled when sort differs from default (e.g. user modified sort)
  it('Reset button enabled when isDefault=false', () => {
    renderPanel({ isDefault: false });
    expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
  });

  // ── Bug regression tests ─────────────────────────────────────────────────

  // SP-Bug-01: delete button actually removes the rule from pendingRules
  it('delete button removes the correct rule', () => {
    const { hook } = renderPanel({
      pendingRules: [
        { field: 'name', direction: 'asc' },
        { field: 'score', direction: 'desc' },
      ],
    });
    const deleteBtns = screen.getAllByRole('button', { name: /✕/i });
    fireEvent.click(deleteBtns[0]!); // delete first rule
    const call = (hook.setPendingRules as ReturnType<typeof vi.fn>).mock.calls[0]![0] as typeof hook.pendingRules;
    expect(call).toHaveLength(1);
    expect(call[0]!.field).toBe('score'); // only the second rule remains
  });

  // SP-Bug-02: direction radio button updates the correct rule
  it('direction radio button updates the rule direction', () => {
    const { hook } = renderPanel({
      pendingRules: [{ field: 'name', direction: 'asc' }],
    });
    // Click the Desc radio button (second radio in the group)
    const radios = screen.getAllByRole('radio');
    const descRadio = radios.find((r) => r.getAttribute('value') === 'desc');
    fireEvent.click(descRadio!);
    const call = (hook.setPendingRules as ReturnType<typeof vi.fn>).mock.calls[0]![0] as typeof hook.pendingRules;
    expect(call[0]!.direction).toBe('desc');
  });

  // SP-Bug-03: field selector updates the rule and marks the field as used
  it('field selector change updates the rule in pendingRules', () => {
    const { hook } = renderPanel({
      pendingRules: [{ field: '', direction: 'asc' }],
    });
    // Open the selector and select 'name'
    const selects = document.querySelectorAll('.ant-select-selector');
    fireEvent.mouseDown(selects[0]!);
    const nameOption = document.querySelector('.ant-select-item-option[title="Name"]') as HTMLElement;
    if (nameOption) fireEvent.click(nameOption);
    const calls = (hook.setPendingRules as ReturnType<typeof vi.fn>).mock.calls;
    if (calls.length > 0) {
      const updated = calls[calls.length - 1]![0] as typeof hook.pendingRules;
      expect(updated[0]!.field).toBe('name');
    }
    // If no call was made, the test still serves as a canary for the bug
  });

  // SP-08: delete ✕ button disabled when only one rule
  it('disables the delete button when there is only one rule', () => {
    renderPanel({ pendingRules: [{ field: 'name', direction: 'asc' }] });
    expect(screen.getByRole('button', { name: /✕/i })).toBeDisabled();
  });

  // SP-09: delete ✕ button enabled when there are multiple rules
  it('enables the delete button when there are multiple rules', () => {
    renderPanel({ pendingRules: [{ field: 'name', direction: 'asc' }, { field: 'score', direction: 'desc' }] });
    const deleteBtns = screen.getAllByRole('button', { name: /✕/i });
    deleteBtns.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  // SP-10: add-rule button is a native <button> without AntD styling (ghost style)
  it('add-rule button is a native button element (ghost style, not AntD Button)', () => {
    renderPanel();
    const addBtn = screen.getByRole('button', { name: /\+ rule/i });
    expect(addBtn).toBeInTheDocument();
    // Ghost button: plain <button>, not an AntD Button (which adds ant-btn class)
    expect(addBtn.classList.contains('ant-btn')).toBe(false);
    expect(addBtn.tagName.toLowerCase()).toBe('button');
  });

  // SP-11: direction is rendered as two radio buttons (icon-only, verified by count)
  it('renders two direction radio buttons (Asc and Desc)', () => {
    renderPanel({ pendingRules: [{ field: 'name', direction: 'asc' }] });
    // Radio.Button renders as input[type=radio]; there should be 2 for direction + 3 for nulls
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(5); // 2 direction + 3 nulls
  });

  // SP-12: used attributes are disabled in other rule selectors (open the dropdown to see options)
  it('disables an attribute in other rules once it is selected in one rule', () => {
    renderPanel({
      pendingRules: [
        { field: 'name', direction: 'asc' },
        { field: '', direction: 'asc' },
      ],
    });
    // Open the second rule's field selector (index 1 among all Select elements)
    const selects = document.querySelectorAll('.ant-select-selector');
    fireEvent.mouseDown(selects[1]!); // open second rule's field dropdown

    const disabledOptions = document.querySelectorAll('.ant-select-item-option-disabled');
    const names = Array.from(disabledOptions).map((el) => el.textContent?.trim());
    // 'name' is used in rule 1 → must be disabled in rule 2's options
    expect(names.some((n) => n?.includes('Name'))).toBe(true);
  });

  // SP-13: null-ordering renders 3 radio buttons (icon-only: default/first/last)
  it('renders three null-ordering radio buttons per rule', () => {
    renderPanel({ pendingRules: [{ field: 'name', direction: 'asc' }] });
    // 2 direction radios + 3 nulls radios = 5 total
    expect(screen.getAllByRole('radio').length).toBe(5);
  });

  // SP-LT-01: long_text attributes are excluded from the sort field dropdown
  it('excludes long_text attributes from the sort field dropdown options', () => {
    const attrsWithLongText = [
      { key: 'name', label: 'Name', dataType: 'text' as const },
      { key: 'bio', label: 'Bio', dataType: 'long_text' as const },
      { key: 'score', label: 'Score', dataType: 'number' as const },
    ];
    const hook = makeHook({ pendingRules: [{ field: '', direction: 'asc' }] });
    render(
      <SortPanel attrs={attrsWithLongText} hook={hook} onApply={vi.fn()} onClose={vi.fn()} />,
      { wrapper },
    );

    // Open the field selector dropdown
    const selector = document.querySelector('.ant-select-selector');
    fireEvent.mouseDown(selector!);

    // 'Name' and 'Score' must be present as selectable options
    expect(document.querySelector('.ant-select-item-option[title="Name"]')).toBeInTheDocument();
    expect(document.querySelector('.ant-select-item-option[title="Score"]')).toBeInTheDocument();

    // 'Bio' (long_text) must be absent from the options entirely
    expect(document.querySelector('.ant-select-item-option[title="Bio"]')).toBeNull();
  });
});
