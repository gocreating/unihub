import { describe, it, expect } from 'vitest';
import type { Item, ScenarioItem } from '@/services/unihub-backend/inventory';
import {
  childrenOf,
  computeDropTarget,
  organizeAtTopLevel,
  organizeInto,
  sendBack,
  unorganizedLines,
} from './organizeTree';

const line = (
  id: string,
  containerId: string | null,
  order: number,
  organized: boolean,
): ScenarioItem => ({
  id,
  item: { id: `item-${id}`, name: id } as Item,
  container: containerId ? { id: containerId, item_name: '' } : null,
  display_order: order,
  organized,
  notes: '',
  created_at: `2026-07-0${1 + order}T00:00:00Z`,
});

// Organized: bag(top,0) > cam(0); tent(top,1). Unorganized: rope, mat.
const LINES = [
  line('l-bag', null, 0, true),
  line('l-tent', null, 1, true),
  line('l-cam', 'l-bag', 0, true),
  line('l-rope', null, 0, false),
  line('l-mat', null, 1, false),
];

describe('organizeTree (iteration 16 — organized flag)', () => {
  // OT16-01: the tree sees only organized lines.
  it('childrenOf ignores unorganized lines', () => {
    expect(childrenOf(LINES, null).map((l) => l.id)).toEqual(['l-bag', 'l-tent']);
    expect(childrenOf(LINES, 'l-bag').map((l) => l.id)).toEqual(['l-cam']);
  });

  // OT16-02: the flat pane lists unorganized lines by creation time.
  it('unorganizedLines returns only unorganized lines, oldest first', () => {
    expect(unorganizedLines(LINES).map((l) => l.id)).toEqual(['l-rope', 'l-mat']);
  });

  // OT16-03: tree-internal drops compute indexes among organized siblings only.
  it('computeDropTarget counts only organized siblings', () => {
    // Drop tent AFTER bag at top level: organized siblings excl. tent = [bag].
    expect(computeDropTarget(LINES, 'l-tent', 'l-bag', true, 1)).toEqual({
      container_id: null,
      index: 1,
    });
    // Nest tent inside bag: existing organized children = [cam].
    expect(computeDropTarget(LINES, 'l-tent', 'l-bag', false, 0)).toEqual({
      container_id: 'l-bag',
      index: 1,
    });
  });

  // OT16-04: left→right background drop appends at the organized top level.
  it('organizeAtTopLevel appends after the organized top-level lines', () => {
    expect(organizeAtTopLevel(LINES, 'l-rope')).toEqual({
      container_id: null,
      index: 2,
      organized: true,
    });
    // Re-organizing an already-organized line excludes itself from the count.
    expect(organizeAtTopLevel(LINES, 'l-tent')).toEqual({
      container_id: null,
      index: 1,
      organized: true,
    });
  });

  // OT16-05: left→right node drop nests at the end of the node's children.
  it('organizeInto nests at the end of the target children', () => {
    expect(organizeInto(LINES, 'l-rope', 'l-bag')).toEqual({
      container_id: 'l-bag',
      index: 1,
      organized: true,
    });
  });

  // OT16-06: right→left send-back unorganizes.
  it('sendBack unorganizes (container/index ignored by the server)', () => {
    expect(sendBack()).toEqual({ container_id: null, index: 0, organized: false });
  });
});
