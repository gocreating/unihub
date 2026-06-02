/**
 * Tests for the shared SortableList component and its reorderById helper.
 *
 * Drag simulation in jsdom is unreliable (no layout engine, pointer events
 * partially implemented). We test the PURE reorder logic via reorderById, and
 * verify the component renders correctly and calls onReorder. Real drag-and-drop
 * behaviour is covered by the Playwright E2E tests (e2e/column-pin.spec.ts).
 */
import { render, screen } from '@testing-library/react';
import { SortableList, reorderById } from './SortableList';

interface Item { id: string; label: string; }

const ITEMS: Item[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

function renderList(items: Item[], onReorder: (next: Item[]) => void) {
  return render(
    <SortableList
      items={items}
      onReorder={onReorder}
      renderItem={(item, handleProps) => (
        <div data-testid={`row-${item.id}`}>
          <span data-drag-handle={item.id} {...handleProps}>⠿</span>
          {item.label}
        </div>
      )}
    />,
  );
}

// ── Component rendering ───────────────────────────────────────────────────────

describe('SortableList — rendering', () => {
  // SL-01: renders all items
  it('renders all items', () => {
    renderList(ITEMS, vi.fn());
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  // SL-02: drag handle element is rendered for each item
  it('renders a drag handle for each item', () => {
    renderList(ITEMS, vi.fn());
    expect(document.querySelector('[data-drag-handle="a"]')).toBeInTheDocument();
    expect(document.querySelector('[data-drag-handle="b"]')).toBeInTheDocument();
    expect(document.querySelector('[data-drag-handle="c"]')).toBeInTheDocument();
  });

  // SL-03: each item wrapper has data-sortable-id so E2E and mock-layout tests can target it
  it('wraps each item with data-sortable-id', () => {
    renderList(ITEMS, vi.fn());
    expect(document.querySelector('[data-sortable-id="a"]')).toBeInTheDocument();
    expect(document.querySelector('[data-sortable-id="b"]')).toBeInTheDocument();
    expect(document.querySelector('[data-sortable-id="c"]')).toBeInTheDocument();
  });
});

// ── Pure reorder logic (reorderById) ─────────────────────────────────────────

describe('reorderById', () => {
  // R-01: moves first item to last position
  it('moves first item to last position', () => {
    const result = reorderById(ITEMS, 'a', 'c');
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  // R-02: moves last item to first position
  it('moves last item to first position', () => {
    const result = reorderById(ITEMS, 'c', 'a');
    expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  // R-03: moves middle item to first position
  it('moves middle item to first position', () => {
    const result = reorderById(ITEMS, 'b', 'a');
    expect(result.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  // R-04: same-position drop returns the original array (no-op)
  it('returns the original array when active === over (no-op)', () => {
    const result = reorderById(ITEMS, 'b', 'b');
    expect(result).toBe(ITEMS); // exact same reference
  });

  // R-05: unknown id returns original array
  it('returns the original array when id not found', () => {
    const result = reorderById(ITEMS, 'z', 'a');
    expect(result).toBe(ITEMS);
  });

  // R-06: two-item list — swap
  it('swaps two items correctly', () => {
    const two: Item[] = [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }];
    expect(reorderById(two, 'x', 'y').map((i) => i.id)).toEqual(['y', 'x']);
    expect(reorderById(two, 'y', 'x').map((i) => i.id)).toEqual(['y', 'x']);
  });
});
