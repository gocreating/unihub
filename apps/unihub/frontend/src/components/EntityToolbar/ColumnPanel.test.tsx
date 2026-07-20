import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ColumnPanel } from './ColumnPanel';
import { useColumnConfig } from './hooks/useColumnConfig';
import PageTable from '@/components/PageTable';
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
};

const makeHook = (overrides: Partial<UseColumnConfigReturn> = {}): UseColumnConfigReturn => ({
  isCustomised: false,
  isDirty: false,
  pendingState: defaultPending,
  activeState: defaultPending,
  visibleColumns: defaultPending.columns,
  fixedForKey: () => undefined,
  pinFingerprint: '',
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

/** Pin buttons of one column row. */
function pinButtons(key: string) {
  const row = document.querySelector(`[data-column-row="${key}"]`);
  return {
    row,
    left: row?.querySelector<HTMLButtonElement>('[data-sticky-pin="left"]') ?? null,
    right: row?.querySelector<HTMLButtonElement>('[data-sticky-pin="right"]') ?? null,
  };
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

  // CP-08: column rows are rendered in DISPLAY order — pin groups at the edges,
  // `order` within each group (WYSIWYG with the table).
  it('renders column rows in display order (left group, middle, right group)', () => {
    const cols: ColumnDef[] = [
      { key: 'c', label: 'C', dataType: 'text', visible: true, order: 2, pin: 'left' },
      { key: 'a', label: 'A', dataType: 'text', visible: true, order: 0 },
      { key: 'b', label: 'B', dataType: 'text', visible: true, order: 1, pin: 'right' },
    ];
    const hook = makeHook({ pendingState: { columns: cols } });
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });

    const rows = Array.from(document.querySelectorAll('[data-column-row]'));
    // Display order: c (pinned left), a (unpinned), b (pinned right)
    expect(rows.map((r) => r.getAttribute('data-column-row'))).toEqual(['c', 'a', 'b']);
  });

  // CP-08b: drag-and-drop reorder logic is tested via SortableList.test.tsx reorderById.
  // dnd-kit pointer-event drag simulation is covered by Playwright E2E tests.

  // CP-09: EVERY column row carries a pin-left and a pin-right button (017: per-column pins)
  it('shows pin-left and pin-right buttons on every column row', () => {
    renderPanel();
    for (const key of ['name', 'score']) {
      const { left, right } = pinButtons(key);
      expect(left, `${key} pin-left`).toBeInTheDocument();
      expect(right, `${key} pin-right`).toBeInTheDocument();
    }
    // 2 columns × 2 sides = 4 buttons; none outside a column row (no global toggles)
    expect(document.querySelectorAll('[data-sticky-pin]')).toHaveLength(4);
    expect(document.querySelectorAll('[data-column-row] [data-sticky-pin]')).toHaveLength(4);
  });

  // CP-09b: pin buttons carry i18n tooltips via aria-label
  it('pin buttons have Pin left / Pin right accessible labels', () => {
    renderPanel();
    const { left, right } = pinButtons('name');
    expect(left?.getAttribute('aria-label')).toBe('Pin left');
    expect(right?.getAttribute('aria-label')).toBe('Pin right');
  });

  // Last pendingState pushed into the mocked hook.
  const lastPending = (hook: UseColumnConfigReturn): ColumnState =>
    (hook.setPendingState as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as ColumnState;

  // CP-10: clicking an inactive pin-left sets that column's pin to 'left'
  it('clicking pin-left on a row sets that column pin to left in pendingState', () => {
    const hook = makeHook();
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });
    fireEvent.click(pinButtons('score').left!);
    const state = lastPending(hook);
    expect(state.columns.find((c) => c.key === 'score')?.pin).toBe('left');
    expect(state.columns.find((c) => c.key === 'name')?.pin).toBeUndefined();
  });

  // CP-11: clicking an inactive pin-right sets that column's pin to 'right'
  it('clicking pin-right on a row sets that column pin to right in pendingState', () => {
    const hook = makeHook();
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });
    fireEvent.click(pinButtons('name').right!);
    const state = lastPending(hook);
    expect(state.columns.find((c) => c.key === 'name')?.pin).toBe('right');
    expect(state.columns.find((c) => c.key === 'score')?.pin).toBeUndefined();
  });

  // CP-11b: clicking the ACTIVE side unpins; clicking the OTHER side swaps (mutual exclusion)
  it('clicking the active side unpins and the opposite side swaps', () => {
    const cols: ColumnDef[] = [
      { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0, pin: 'left' },
      { key: 'score', label: 'Score', dataType: 'number', visible: true, order: 1 },
    ];
    const hook = makeHook({ pendingState: { columns: cols } });
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });

    // Active left → click left = unpin
    fireEvent.click(pinButtons('name').left!);
    let state = lastPending(hook);
    expect(state.columns.find((c) => c.key === 'name')?.pin).toBeUndefined();
    expect(state.columns.find((c) => c.key === 'score')?.pin).toBeUndefined();

    // Active left → click right = swap to right (clears left in the same update)
    fireEvent.click(pinButtons('name').right!);
    state = lastPending(hook);
    expect(state.columns.find((c) => c.key === 'name')?.pin).toBe('right');
    expect(state.columns.find((c) => c.key === 'score')?.pin).toBeUndefined();
  });

  // CP-11c: a hidden column keeps its pin buttons (and active state) — FR-010
  it('hidden columns still render pin buttons with their active state', () => {
    const cols: ColumnDef[] = [
      { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0 },
      { key: 'score', label: 'Score', dataType: 'number', visible: false, order: 1, pin: 'left' },
    ];
    const hook = makeHook({ pendingState: { columns: cols } });
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });
    const { left } = pinButtons('score');
    expect(left).toBeInTheDocument();
    // Active pin renders the filled pushpin (blue)
    expect(left?.querySelector('.anticon-pushpin')).toBeTruthy();
    expect(left?.style.color).toBe('rgb(22, 119, 255)');
  });

  // CP-12: the old view-wide "pin first/last column" toggles are gone (FR-007)
  it('does not show the old global pin-first/pin-last controls', () => {
    renderPanel();
    expect(screen.queryByText(/pin first|pin last/i)).toBeNull();
    // Every pin button lives inside a column row.
    const all = document.querySelectorAll('[data-sticky-pin]');
    const scoped = document.querySelectorAll('[data-column-row] [data-sticky-pin]');
    expect(all.length).toBe(scoped.length);
  });
});

// ── Integration tests (real useColumnConfig hook) ─────────────────────────────

const TWO_COLS: ColumnDef[] = [
  { key: 'a', label: 'A', dataType: 'text', visible: true, order: 0 },
  { key: 'b', label: 'B', dataType: 'text', visible: true, order: 1 },
];

const THREE_COLS: ColumnDef[] = [
  { key: 'a', label: 'A', dataType: 'text', visible: true, order: 0 },
  { key: 'b', label: 'B', dataType: 'text', visible: true, order: 1 },
  { key: 'c', label: 'C', dataType: 'text', visible: true, order: 2 },
];

describe('ColumnPanel — pin integration (real hook)', () => {
  // CP-Int-01: pin a left + apply → fixedForKey('a') is 'left'
  it('pin left then Apply sets fixedForKey to left', () => {
    let capturedHook!: UseColumnConfigReturn;
    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      capturedHook = hook;
      return <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />;
    }
    render(<Page />, { wrapper });

    expect(capturedHook.fixedForKey('a')).toBeUndefined();

    fireEvent.click(pinButtons('a').left!);
    expect(capturedHook.isDirty).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(capturedHook.fixedForKey('a')).toBe('left');
    expect(capturedHook.pinFingerprint).toBe('a:left');
    expect(capturedHook.isDirty).toBe(false);
  });

  // CP-Int-02: pin b right + apply → fixedForKey('b') is 'right'
  it('pin right then Apply sets fixedForKey to right', () => {
    let capturedHook!: UseColumnConfigReturn;
    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      capturedHook = hook;
      return <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />;
    }
    render(<Page />, { wrapper });

    fireEvent.click(pinButtons('b').right!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(capturedHook.fixedForKey('b')).toBe('right');
    expect(capturedHook.pinFingerprint).toBe('b:right');
  });

  // CP-Int-03b-DOM: after pinning TWO columns left + Apply, BOTH ProTable columns
  // carry ant-table-cell-fix-left in the DOM. AntD ProTable initialises its column
  // layout on MOUNT, so the PageTable key embeds pinFingerprint (constitution XII).
  it('two left-pinned columns both get ant-table-cell-fix-left after Apply', () => {
    function Page() {
      const hook = useColumnConfig(THREE_COLS);
      return (
        <>
          <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />
          <PageTable
            key={hook.pinFingerprint}
            rowKey="key"
            columns={hook.visibleColumns.map((c) => ({
              key: c.key,
              dataIndex: c.key,
              title: c.label,
              width: 200,
              fixed: hook.fixedForKey(c.key),
            }))}
            dataSource={[{ key: '1', a: 'val-a', b: 'val-b', c: 'val-c' }]}
            scroll={{ x: 500 }}
          />
        </>
      );
    }

    render(<Page />, { wrapper });
    expect(document.querySelector('th.ant-table-cell-fix-left')).toBeNull();

    fireEvent.click(pinButtons('a').left!);
    fireEvent.click(pinButtons('b').left!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    const fixedThs = document.querySelectorAll('th.ant-table-cell-fix-left');
    expect(fixedThs, 'both pinned columns must be fixed left').toHaveLength(2);
    // The boundary shadow class sits ONLY on the last left-fixed column (FR-008).
    const lastMarked = document.querySelectorAll('th.ant-table-cell-fix-left-last');
    expect(lastMarked).toHaveLength(1);
    expect(lastMarked[0]?.textContent).toContain('B');
  });

  // CP-Int-03-right: pinning two right columns marks both fix-right, boundary on first
  it('two right-pinned columns get ant-table-cell-fix-right after Apply', () => {
    function Page() {
      const hook = useColumnConfig(THREE_COLS);
      return (
        <>
          <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />
          <PageTable
            key={hook.pinFingerprint}
            rowKey="key"
            columns={hook.visibleColumns.map((c) => ({
              key: c.key, dataIndex: c.key, title: c.label, width: 200, fixed: hook.fixedForKey(c.key),
            }))}
            dataSource={[{ key: '1', a: 'x', b: 'y', c: 'z' }]}
            scroll={{ x: 500 }}
          />
        </>
      );
    }
    render(<Page />, { wrapper });
    expect(document.querySelector('th.ant-table-cell-fix-right')).toBeNull();
    fireEvent.click(pinButtons('b').right!);
    fireEvent.click(pinButtons('c').right!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(document.querySelectorAll('th.ant-table-cell-fix-right')).toHaveLength(2);
    const firstMarked = document.querySelectorAll('th.ant-table-cell-fix-right-first');
    expect(firstMarked).toHaveLength(1);
    expect(firstMarked[0]?.textContent).toContain('B');
  });

  // CP-Int-03-reorder: the pin follows the COLUMN identity through reorders —
  // a pinned-right column stays fixed right even when its `order` becomes first.
  it('a right pin follows its column through reordering', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hookRef = { current: null as any };

    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      hookRef.current = hook;
      return (
        <>
          <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />
          <PageTable
            key={hook.pinFingerprint}
            rowKey="key"
            columns={hook.visibleColumns.map((c) => ({
              key: c.key, dataIndex: c.key, title: c.label, width: 200, fixed: hook.fixedForKey(c.key),
            }))}
            dataSource={[{ key: '1', a: 'x', b: 'y' }]}
            scroll={{ x: 500 }}
          />
        </>
      );
    }
    render(<Page />, { wrapper });

    // 1) Pin b right → Apply
    fireEvent.click(pinButtons('b').right!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    const ths = () => Array.from(document.querySelectorAll<HTMLElement>('th'));
    expect(ths().find((th) => th.textContent?.includes('B'))?.classList.contains('ant-table-cell-fix-right')).toBe(true);

    // 2) Reorder: b's order becomes 0 (dnd-kit drag → pointer events in E2E).
    act(() => {
      hookRef.current?.setPendingState({
        columns: [
          { key: 'a', label: 'A', dataType: 'text', visible: true, order: 1 },
          { key: 'b', label: 'B', dataType: 'text', visible: true, order: 0, pin: 'right' },
        ],
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    // b stays pinned right (pin follows the column, not the position) and
    // displays LAST via group-major ordering; a is unpinned.
    expect(ths().find((th) => th.textContent?.includes('B'))?.classList.contains('ant-table-cell-fix-right')).toBe(true);
    expect(ths().find((th) => th.textContent?.includes('A'))?.classList.contains('ant-table-cell-fix-right')).toBe(false);
    expect(hookRef.current.visibleColumns.map((c: ColumnDef) => c.key)).toEqual(['a', 'b']);
  });

  // CP-Int-03: toggling pin off + apply clears the fixed side
  it('pinning then un-pinning then Apply clears fixedForKey', () => {
    let capturedHook!: UseColumnConfigReturn;
    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      capturedHook = hook;
      return <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />;
    }
    render(<Page />, { wrapper });

    // Pin on
    fireEvent.click(pinButtons('a').left!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(capturedHook.fixedForKey('a')).toBe('left');

    // Pin off
    fireEvent.click(pinButtons('a').left!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(capturedHook.fixedForKey('a')).toBeUndefined();
    expect(capturedHook.pinFingerprint).toBe('');
  });
});

// Constitution v1.20.0: the panel's list scrolls internally, never overflowing
// the viewport (the Catalog's per-parameter columns made the list unbounded).
describe('ColumnPanel viewport fit (constitution v1.20.0)', () => {
  it('caps the column list height with internal scrolling', () => {
    renderPanel();
    const scroller = document.querySelector('[data-panel-scroll]') as HTMLElement;
    expect(scroller).toBeTruthy();
    expect(scroller.style.maxHeight).toBe('60vh');
    expect(scroller.style.overflowY).toBe('auto');
  });
});
