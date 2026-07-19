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
type ColDef = { key: string; width?: number; fixed?: 'left' | 'right' | boolean };

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

  // CP-08: column rows are rendered in the sorted order
  it('renders column rows in sorted order by order value', () => {
    const cols: ColumnDef[] = [
      { key: 'c', label: 'C', dataType: 'text', visible: true, order: 2 },
      { key: 'a', label: 'A', dataType: 'text', visible: true, order: 0 },
      { key: 'b', label: 'B', dataType: 'text', visible: true, order: 1 },
    ];
    const hook = makeHook({ pendingState: { columns: cols, stickyLeft: false, stickyRight: false } });
    render(<ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />, { wrapper });

    const rows = Array.from(document.querySelectorAll('[data-column-row]'));
    // Sorted by order: a(0), b(1), c(2)
    expect(rows[0]?.getAttribute('data-column-row')).toBe('a');
    expect(rows[1]?.getAttribute('data-column-row')).toBe('b');
    expect(rows[2]?.getAttribute('data-column-row')).toBe('c');
  });

  // CP-08b: drag-and-drop reorder logic is tested via SortableList.test.tsx reorderById.
  // dnd-kit pointer-event drag simulation is covered by Playwright E2E tests.

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

  // CP-Int-03b: colDefMap pattern — fixed property reaches ProTable column after pin+apply
  // This mirrors the exact pattern used in pages (currencies, exchange-rates, accounts).
  it('fixed: left is set on the first column definition after pin left + Apply', () => {
    let capturedCols: ColDef[] = [];

    function Page() {
      const hook = useColumnConfig(TWO_COLS);

      // Exact same pattern as pages (e.g. currencies colDefMap)
      const colDefMap = React.useMemo<Record<string, ColDef>>(() => ({
        a: {
          key: 'a',
          fixed: hook.visibleColumns[0]?.key === 'a' ? hook.firstColumnFixed
            : hook.visibleColumns.at(-1)?.key === 'a' ? hook.lastColumnFixed : undefined,
        },
        b: {
          key: 'b',
          fixed: hook.visibleColumns[0]?.key === 'b' ? hook.firstColumnFixed
            : hook.visibleColumns.at(-1)?.key === 'b' ? hook.lastColumnFixed : undefined,
        },
      }), [hook.firstColumnFixed, hook.lastColumnFixed, hook.visibleColumns]);

      const columns = React.useMemo(
        () => hook.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ColDef => Boolean(c)),
        [hook.visibleColumns, colDefMap],
      );
      capturedCols = columns;

      return <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />;
    }

    render(<Page />, { wrapper });

    expect(capturedCols[0]?.fixed).toBeUndefined();

    // Pin the first column left
    fireEvent.click(document.querySelector('[data-sticky-pin="left"]')!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    // The first column in the array must now have fixed: 'left'
    expect(capturedCols[0]?.key).toBe('a');
    expect(capturedCols[0]?.fixed).toBe('left');
    // The second column must not be fixed
    expect(capturedCols[1]?.fixed).toBeUndefined();
  });


  // CP-Int-03b-DOM: after pin left + Apply, the ProTable column must have
  // ant-table-cell-fix-left in the rendered DOM. AntD ProTable initialises its
  // internal column layout on MOUNT; changing fixed:'left' on an already-mounted
  // table does not trigger a re-initialisation. The fix: use a key derived from
  // the fixed state so PageTable remounts when fixed columns change.
  it('pinned column has ant-table-cell-fix-left DOM class after pin left + Apply', () => {
    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      // Key changes when fixed state toggles → forces PageTable to remount so
      // AntD initialises its column layout fresh with the new fixed value.
      const fixedKey = `${!!hook.firstColumnFixed}-${!!hook.lastColumnFixed}`;
      return (
        <>
          <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />
          <PageTable
            key={fixedKey}
            rowKey="key"
            columns={hook.visibleColumns.map((c) => ({
              key: c.key,
              dataIndex: c.key,
              title: c.label,
              width: 200,
              fixed: hook.visibleColumns[0]?.key === c.key ? hook.firstColumnFixed
                : hook.visibleColumns.at(-1)?.key === c.key ? hook.lastColumnFixed : undefined,
            }))}
            dataSource={[{ key: '1', a: 'val-a', b: 'val-b' }]}
            scroll={{ x: 500 }}
          />
        </>
      );
    }

    render(<Page />, { wrapper });
    expect(document.querySelector('th.ant-table-cell-fix-left')).toBeNull();

    fireEvent.click(document.querySelector('[data-sticky-pin="left"]')!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    const fixedTh = document.querySelector('th.ant-table-cell-fix-left');
    expect(fixedTh, 'ant-table-cell-fix-left must appear after pin+apply').not.toBeNull();
  });

  // CP-Int-03-right: sticky right also produces DOM class after pin right + Apply
  it('pinned right column has ant-table-cell-fix-right DOM class after pin right + Apply', () => {
    function Page() {
      const hook = useColumnConfig(TWO_COLS);
      const v = hook.visibleColumns;
      const fixedKey = `${v[0]?.key ?? ''}-${v.at(-1)?.key ?? ''}-${!!hook.firstColumnFixed}-${!!hook.lastColumnFixed}`;
      const getFixed = (key: string) =>
        v[0]?.key === key ? hook.firstColumnFixed : v.at(-1)?.key === key ? hook.lastColumnFixed : undefined;
      return (
        <>
          <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />
          <PageTable
            key={fixedKey}
            rowKey="key"
            columns={v.map((c) => ({ key: c.key, dataIndex: c.key, title: c.label, width: 200, fixed: getFixed(c.key) }))}
            dataSource={[{ key: '1', a: 'x', b: 'y' }]}
            scroll={{ x: 500 }}
          />
        </>
      );
    }
    render(<Page />, { wrapper });
    expect(document.querySelector('th.ant-table-cell-fix-right')).toBeNull();
    fireEvent.click(document.querySelector('[data-sticky-pin="right"]')!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(document.querySelector('th.ant-table-cell-fix-right')).not.toBeNull();
  });

  // CP-Int-03-reorder: after reordering columns AND applying, sticky right follows
  // the NEW last column (requires key to include first/last visible column identity)
  it('sticky right follows the new last column after reorder + apply', () => {
    const COLS: ColumnDef[] = [
      { key: 'a', label: 'A', dataType: 'text', visible: true, order: 0 },
      { key: 'b', label: 'B', dataType: 'text', visible: true, order: 1 },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hookRef = { current: null as any };

    function Page() {
      const hook = useColumnConfig(COLS);
      hookRef.current = hook;
      const v = hook.visibleColumns;
      const fixedKey = `${v[0]?.key ?? ''}-${v.at(-1)?.key ?? ''}-${!!hook.firstColumnFixed}-${!!hook.lastColumnFixed}`;
      const getFixed = (key: string) =>
        v[0]?.key === key ? hook.firstColumnFixed : v.at(-1)?.key === key ? hook.lastColumnFixed : undefined;
      return (
        <>
          <ColumnPanel hook={hook} onApply={vi.fn()} onClose={vi.fn()} />
          <PageTable
            key={fixedKey}
            rowKey="key"
            columns={v.map((c) => ({ key: c.key, dataIndex: c.key, title: c.label, width: 200, fixed: getFixed(c.key) }))}
            dataSource={[{ key: '1', a: 'x', b: 'y' }]}
            scroll={{ x: 500 }}
          />
        </>
      );
    }
    render(<Page />, { wrapper });

    // 1) Pin right (b is last) → Apply
    fireEvent.click(document.querySelector('[data-sticky-pin="right"]')!);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    const ths = () => Array.from(document.querySelectorAll<HTMLElement>('th'));
    expect(ths().find((th) => th.textContent?.includes('B'))?.classList.contains('ant-table-cell-fix-right')).toBe(true);

    // 2) Simulate reorder via direct state mutation (dnd-kit drag → pointer events
    //    in E2E). Swap order: b becomes first, a becomes last.
    act(() => {
      hookRef.current?.setPendingState({
        columns: [
          { key: 'a', label: 'A', dataType: 'text', visible: true, order: 1 },
          { key: 'b', label: 'B', dataType: 'text', visible: true, order: 0 },
        ],
        stickyLeft: false,
        stickyRight: true,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    // Now a should be the last visible column → a gets fixed:right
    expect(ths().find((th) => th.textContent?.includes('A'))?.classList.contains('ant-table-cell-fix-right')).toBe(true);
    expect(ths().find((th) => th.textContent?.includes('B'))?.classList.contains('ant-table-cell-fix-right')).toBe(false);
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
