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

export interface DropTarget {
  container_id: string | null;
  index: number;
}

export interface MovePayload extends DropTarget {
  organized: boolean;
}

/** Left→right background drop: append at the end of the organized top level. */
export function organizeAtTopLevel(lines: ScenarioItem[], dragId: string): MovePayload {
  const index = childrenOf(lines, null).filter((l) => l.id !== dragId).length;
  return { container_id: null, index, organized: true };
}

/** Left→right node drop: nest at the end of the node's organized children. */
export function organizeInto(
  lines: ScenarioItem[],
  dragId: string,
  containerId: string,
): MovePayload {
  const index = childrenOf(lines, containerId).filter((l) => l.id !== dragId).length;
  return { container_id: containerId, index, organized: true };
}

/** Right→left drop: send the line back (server ignores container/index). */
export function sendBack(): MovePayload {
  return { container_id: null, index: 0, organized: false };
}

/**
 * Translate an AntD Tree drop into the move API's (container, index).
 *
 * Args:
 *   lines: The scenario's membership lines.
 *   dragId: The line being dragged.
 *   dropId: The line it was dropped on (or next to).
 *   dropToGap: True when dropped BETWEEN nodes (sibling reorder), false when
 *     dropped ONTO a node (nest inside it).
 *   relPosition: AntD's relative drop position (-1 = before the node, 1 = after).
 *
 * Returns:
 *   The target container id (null = top level) and sibling index computed
 *   against the sibling list EXCLUDING the dragged line (the server inserts
 *   the line at that index after excluding it too).
 */
export function computeDropTarget(
  lines: ScenarioItem[],
  dragId: string,
  dropId: string,
  dropToGap: boolean,
  relPosition: number,
): DropTarget {
  if (!dropToGap) {
    // Nest inside the drop node, at the end of its children.
    const count = childrenOf(lines, dropId).filter((l) => l.id !== dragId).length;
    return { container_id: dropId, index: count };
  }
  const dropLine = lines.find((l) => l.id === dropId);
  const parentId = dropLine?.container?.id ?? null;
  const siblings = childrenOf(lines, parentId).filter((l) => l.id !== dragId);
  const dropIndex = siblings.findIndex((l) => l.id === dropId);
  const index = relPosition === -1 ? Math.max(dropIndex, 0) : dropIndex + 1;
  return { container_id: parentId, index };
}
