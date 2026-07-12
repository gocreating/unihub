import type { ScenarioItem } from '@/services/unihub-backend/inventory';

/**
 * Children of a container line (null = top level), in persisted order.
 * Only ORGANIZED lines participate in the tree (iteration 16) — unorganized
 * memberships live in the flat pane regardless of their container column.
 */
export function childrenOf(lines: ScenarioItem[], parentId: string | null): ScenarioItem[] {
  return lines
    .filter((line) => line.organized && (line.container?.id ?? null) === parentId)
    .sort(
      (a, b) =>
        a.display_order - b.display_order || a.created_at.localeCompare(b.created_at),
    );
}

/** Unorganized memberships (the flat pane), oldest first. */
export function unorganizedLines(lines: ScenarioItem[]): ScenarioItem[] {
  return lines
    .filter((line) => !line.organized)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export interface MovePayload {
  container_id: string | null;
  index: number;
  organized: boolean;
}

/** One row of the flattened (depth-indented) organized tree. */
export interface FlatRow {
  line: ScenarioItem;
  depth: number;
  parentId: string | null;
}

/** DFS-flatten the organized tree: children directly under their parents. */
export function flattenOrganized(lines: ScenarioItem[]): FlatRow[] {
  const walk = (parentId: string | null, depth: number): FlatRow[] =>
    childrenOf(lines, parentId).flatMap((line) => [
      { line, depth, parentId },
      ...walk(line.id, depth + 1),
    ]);
  return walk(null, 0);
}

/**
 * The rows a drag operates over: the active row and its entire subtree are
 * excluded (the subtree travels with its container — inherent cycle
 * prevention, mirroring the server's cycle check).
 */
export function workingRows(rows: FlatRow[], activeId: string | null): FlatRow[] {
  if (!activeId) return rows;
  const excluded = new Set<string>([activeId]);
  for (const row of rows) {
    if (row.parentId && excluded.has(row.parentId)) excluded.add(row.line.id);
  }
  return rows.filter((row) => !excluded.has(row.line.id));
}

export interface DropProjection extends MovePayload {
  organized: true;
  /** The clamped depth — drives the drop indicator's indentation. */
  depth: number;
}

/**
 * Project a drop into the organized tree (dnd-kit sortable-tree math).
 *
 * Args:
 *   rows: The FULL flattened organized rows.
 *   activeId: The dragged line id (null for an external/flat-pane drag).
 *   gapIndex: The insertion slot in the WORKING list (0..working.length) —
 *     before the row at that position.
 *   dragDepth: The pointer-desired depth (unclamped; from horizontal offset).
 *
 * Returns:
 *   The move payload (container + dense sibling index) plus the clamped depth.
 */
export function projectDrop(
  rows: FlatRow[],
  activeId: string | null,
  gapIndex: number,
  dragDepth: number,
): DropProjection {
  const working = workingRows(rows, activeId);
  const at = Math.max(0, Math.min(gapIndex, working.length));
  const prev = working[at - 1];
  const next = working[at];
  const maxDepth = prev ? prev.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.max(minDepth, Math.min(dragDepth, maxDepth));

  let parentId: string | null = null;
  if (depth > 0) {
    for (let j = at - 1; j >= 0; j--) {
      const candidate = working[j]!;
      if (candidate.depth === depth - 1) {
        parentId = candidate.line.id;
        break;
      }
      if (candidate.depth < depth - 1) break;
    }
  }

  let index = 0;
  for (let j = 0; j < at; j++) {
    const row = working[j]!;
    if ((row.parentId ?? null) === parentId && row.depth === depth) index++;
  }
  return { container_id: parentId, index, depth, organized: true };
}

/** Right→left drop: send the line back (server ignores container/index). */
export function sendBack(): MovePayload {
  return { container_id: null, index: 0, organized: false };
}
