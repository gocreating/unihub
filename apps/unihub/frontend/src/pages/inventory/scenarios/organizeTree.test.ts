import { describe, it, expect } from 'vitest';
import type { Item, ScenarioItem } from '@/services/unihub-backend/inventory';
import {
  childrenOf,
  flattenOrganized,
  projectDrop,
  sendBack,
  unorganizedLines,
  workingRows,
} from './organizeTree';

const line = (
  id: string,
  containerId: string | null,
  order: number,
  organized: boolean,
): ScenarioItem => ({
  id,
  item: { id: `item-${id}`, name: id, alias_name: '' } as Item,
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
const ROWS = flattenOrganized(LINES);

describe('organizeTree (iteration 18 — flatten + projection)', () => {
  // OT18-01: DFS flatten with depths and parent ids; unorganized excluded.
  it('flattenOrganized orders children under parents with depths', () => {
    expect(ROWS.map((r) => r.line.id)).toEqual(['l-bag', 'l-cam', 'l-tent']);
    expect(ROWS.map((r) => r.depth)).toEqual([0, 1, 0]);
    expect(ROWS.map((r) => r.parentId)).toEqual([null, 'l-bag', null]);
  });

  it('unorganizedLines and childrenOf are unchanged', () => {
    expect(unorganizedLines(LINES).map((l) => l.id)).toEqual(['l-rope', 'l-mat']);
    expect(childrenOf(LINES, 'l-bag').map((l) => l.id)).toEqual(['l-cam']);
  });

  // OT18-02: workingRows removes the active row AND its descendants.
  it('workingRows excludes the active subtree', () => {
    expect(workingRows(ROWS, 'l-bag').map((r) => r.line.id)).toEqual(['l-tent']);
    expect(workingRows(ROWS, null).map((r) => r.line.id)).toEqual(['l-bag', 'l-cam', 'l-tent']);
  });

  // OT18-03: external drop at the very end → top-level append.
  it('projects an external drop at the end to a top-level append', () => {
    expect(projectDrop(ROWS, null, 3, 0)).toEqual({
      container_id: null,
      index: 2,
      depth: 0,
      organized: true,
    });
  });

  // OT18-04: external drop right after the container at depth 1 nests first.
  it('projects an external nested drop before the first child', () => {
    expect(projectDrop(ROWS, null, 1, 1)).toEqual({
      container_id: 'l-bag',
      index: 0,
      depth: 1,
      organized: true,
    });
  });

  // OT18-05: the same gap resolves by depth — sibling of cam vs top level.
  it('resolves the between-subtrees gap by projected depth', () => {
    expect(projectDrop(ROWS, null, 2, 1)).toEqual({
      container_id: 'l-bag',
      index: 1,
      depth: 1,
      organized: true,
    });
    expect(projectDrop(ROWS, null, 2, 0)).toEqual({
      container_id: null,
      index: 1,
      depth: 0,
      organized: true,
    });
  });

  // OT18-06: depth clamps to neighbor bounds (both directions).
  it('clamps the projected depth to neighbor bounds', () => {
    // Slot between bag and cam: prev depth 0 → max 1; next depth 1 → min 1.
    expect(projectDrop(ROWS, null, 1, 5).depth).toBe(1);
    expect(projectDrop(ROWS, null, 1, 0).depth).toBe(1);
  });

  // OT18-07: internal move — tent nests under bag before cam.
  it('projects an internal move with the active row excluded', () => {
    expect(projectDrop(ROWS, 'l-tent', 1, 1)).toEqual({
      container_id: 'l-bag',
      index: 0,
      depth: 1,
      organized: true,
    });
  });

  // OT18-08: dragging a container excludes its own subtree (cycle prevention).
  it('never targets the active row own subtree', () => {
    // Working list while dragging bag = [tent]; depth clamps to 1 under tent.
    expect(projectDrop(ROWS, 'l-bag', 1, 3)).toEqual({
      container_id: 'l-tent',
      index: 0,
      depth: 1,
      organized: true,
    });
  });

  // OT18-09: send-back payload unchanged.
  it('sendBack unorganizes', () => {
    expect(sendBack()).toEqual({ container_id: null, index: 0, organized: false });
  });
});
