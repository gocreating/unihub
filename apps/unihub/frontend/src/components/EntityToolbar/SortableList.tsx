/**
 * SortableList — shared drag-and-drop sortable list component.
 *
 * Used by FilterPanel (rules within a group), SortPanel (sort rules), and
 * ColumnPanel (column ordering) so all three panels use the exact same
 * drag-and-drop mechanism.
 *
 * Built on @dnd-kit/sortable which:
 *  - handles drop-at-end naturally (no hidden workaround rows needed)
 *  - only shows a drop indicator when the order would actually change
 *  - provides accessible keyboard sorting as well as pointer drag
 */
import React from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Pure reorder helper (exported for unit testing) ───────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function reorderById<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string,
): T[] {
  if (activeId === overId) return items;
  const oldIdx = items.findIndex((i) => i.id === activeId);
  const newIdx = items.findIndex((i) => i.id === overId);
  if (oldIdx === -1 || newIdx === -1) return items;
  return arrayMove(items, oldIdx, newIdx);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SortableListProps<T extends { id: string }> {
  items: T[];
  /** Called with the reordered array when a drag completes. Never called when
   *  the drag ends in the same position (no-op drops are suppressed). */
  onReorder: (newItems: T[]) => void;
  /** Render one list item. The second argument is the spread-able props for
   *  the drag-handle element (listeners + attributes). */
  renderItem: (
    item: T,
    handleProps: React.HTMLAttributes<HTMLElement>,
    isDragging: boolean,
  ) => React.ReactNode;
  disabled?: boolean;
  /** Layout axis of the list. `'horizontal'` is used by the entity-views tab
   *  strip (016 round 3); every other caller keeps the vertical default. */
  orientation?: 'vertical' | 'horizontal';
}

// ── Internal per-item component ───────────────────────────────────────────────

interface SortableItemProps<T extends { id: string }> {
  item: T;
  renderItem: SortableListProps<T>['renderItem'];
  orientation: 'vertical' | 'horizontal';
}

function SortableItem<T extends { id: string }>({
  item,
  renderItem,
  orientation,
}: SortableItemProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // In a flex row the wrapper must not stretch or shrink — the rendered item
    // owns its own width (tab labels stay legible under overflow).
    ...(orientation === 'horizontal' ? { flex: 'none', display: 'flex' } : null),
  };

  return (
    <div ref={setNodeRef} data-sortable-id={item.id} style={style}>
      {renderItem(item, { ...listeners, ...attributes }, isDragging)}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  orientation = 'vertical',
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return; // no-op: same position
    const result = reorderById(items, String(active.id), String(over.id));
    if (result !== items) onReorder(result);
  };

  if (disabled) {
    return (
      <>
        {items.map((item) => (
          <div key={item.id}>{renderItem(item, {}, false)}</div>
        ))}
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={
          orientation === 'horizontal' ? horizontalListSortingStrategy : verticalListSortingStrategy
        }
      >
        {items.map((item) => (
          <SortableItem
            key={item.id}
            item={item}
            renderItem={renderItem}
            orientation={orientation}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
