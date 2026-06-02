import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ColumnPanel } from './ColumnPanel';
import { useColumnConfig } from './hooks/useColumnConfig';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';
import type { ColumnDef, ColumnState } from './types';

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

  // CP-08: drag first item onto third item places it at second position (off-by-one fix)
  it('dragging first column onto third places it at second position', () => {
    const cols: ColumnDef[] = [
      { key: 'a', label: 'A', dataType: 'text', visible: true, order: 0 },
      { key: 'b', label: 'B', dataType: 'text', visible: true, order: 1 },
      { key: 'c', label: 'C', dataType: 'text', visible: true, order: 2 },
    ];
    const hook = makeHook({
      pendingState: { columns: cols, stickyLeft: false, stickyRight: false },
    });
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });

    const rows = document.querySelectorAll('[data-column-row]');
    // dragStart on 'a' (row 0), drop on 'c' (row 2)
    fireEvent.dragStart(rows[0]!);
    fireEvent.drop(rows[2]!);

    const call = (hook.setPendingState as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ColumnState;
    const aOrder = call.columns.find((c) => c.key === 'a')!.order;
    const bOrder = call.columns.find((c) => c.key === 'b')!.order;
    const cOrder = call.columns.find((c) => c.key === 'c')!.order;
    // After dragging 'a' onto 'c': expected [b(0), a(1), c(2)]
    expect(bOrder).toBe(0);
    expect(aOrder).toBe(1);
    expect(cOrder).toBe(2);
  });

  // CP-09: sticky-left pin appears on the right of the first visible column row
  it('shows sticky-left pin only on the first visible column row', () => {
    renderPanel();
    const pinBtns = document.querySelectorAll('[data-sticky-pin]');
    // Two pins total: one for first column, one for last
    expect(pinBtns).toHaveLength(2);
    const leftPin = document.querySelector('[data-sticky-pin="left"]');
    expect(leftPin).toBeInTheDocument();
    const rightPin = document.querySelector('[data-sticky-pin="right"]');
    expect(rightPin).toBeInTheDocument();
  });

  // CP-10: sticky-left pin button toggles stickyLeft in pendingState
  it('clicking sticky-left pin calls setPendingState with stickyLeft toggled', () => {
    const hook = makeHook({ pendingState: { ...defaultPending, stickyLeft: false } });
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });
    fireEvent.click(document.querySelector('[data-sticky-pin="left"]')!);
    expect(hook.setPendingState).toHaveBeenCalledWith(
      expect.objectContaining({ stickyLeft: true }),
    );
  });

  // CP-11: sticky-right pin button toggles stickyRight in pendingState
  it('clicking sticky-right pin calls setPendingState with stickyRight toggled', () => {
    const hook = makeHook({ pendingState: { ...defaultPending, stickyRight: false } });
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });
    fireEvent.click(document.querySelector('[data-sticky-pin="right"]')!);
    expect(hook.setPendingState).toHaveBeenCalledWith(
      expect.objectContaining({ stickyRight: true }),
    );
  });

  // CP-12: no separate "Sticky Left" / "Sticky Right" text labels at the top
  it('does not show separate sticky-left / sticky-right label text', () => {
    renderPanel();
    expect(screen.queryByText(/sticky left|pin first/i)).toBeNull();
    expect(screen.queryByText(/sticky right|pin last/i)).toBeNull();
  });
});

// ── Integration tests (real useColumnConfig hook) ─────────────────────────────

const TWO_COLS: ColumnDef[] = [
  { key: 'a', label: 'A', dataType: 'text', visible: true, order: 0 },
  { key: 'b', label: 'B', dataType: 'text', visible: true, order: 1 },
];

describe('ColumnPanel — sticky integration (real hook)', () => {
  // CP-Int-01: pin left + apply → firstColumnFixed becomes 'left'
  it('pin left then Apply sets firstColumnFixed to left', () => {
    let capturedHook!: UseColumnConfigReturn;
    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      capturedHook = hook;
      return <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />;
    }
    render(<Page />, { wrapper });

    expect(capturedHook.firstColumnFixed).toBeUndefined();

    fireEvent.click(document.querySelector('[data-sticky-pin="left"]')!);
    expect(capturedHook.isDirty).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(capturedHook.firstColumnFixed).toBe('left');
    expect(capturedHook.isDirty).toBe(false);
  });

  // CP-Int-02: pin right + apply → lastColumnFixed becomes 'right'
  it('pin right then Apply sets lastColumnFixed to right', () => {
    let capturedHook!: UseColumnConfigReturn;
    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      capturedHook = hook;
      return <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />;
    }
    render(<Page />, { wrapper });

    expect(capturedHook.lastColumnFixed).toBeUndefined();

    fireEvent.click(document.querySelector('[data-sticky-pin="right"]')!);
    expect(capturedHook.isDirty).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(capturedHook.lastColumnFixed).toBe('right');
    expect(capturedHook.isDirty).toBe(false);
  });

  // CP-Int-03: toggling pin off + apply clears the sticky
  it('pinning then un-pinning then Apply clears firstColumnFixed', () => {
    let capturedHook!: UseColumnConfigReturn;
    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      capturedHook = hook;
      return <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />;
    }
    render(<Page />, { wrapper });

    // Pin on
    fireEvent.click(document.querySelector('[data-sticky-pin="left"]')!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(capturedHook.firstColumnFixed).toBe('left');

    // Pin off
    fireEvent.click(document.querySelector('[data-sticky-pin="left"]')!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(capturedHook.firstColumnFixed).toBeUndefined();
  });
});
