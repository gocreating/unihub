import { DEFAULT_PAGE_SIZE } from './useEntityTable';
import type { ColumnDef, ViewConfig } from './types';

/**
 * The baseline configuration an entity page hands to its view tabs (016 round
 * 12) — the single definition of "this table, untouched".
 *
 * A page contributes its COLUMNS and nothing else: no filter, no sorting, the
 * shared default page size. Whatever the table should actually open with lives
 * in the account's stored default view, which is editable and shareable, rather
 * than in page code that competes with it (round 11 removed the catalog's).
 *
 * It exists as a helper because the five pages previously hand-copied the same
 * object literal, page size included. Any difference between that literal and
 * what `useEntityTable` really starts with reads as unsaved changes on a view
 * nobody touched — the round-11 defect, one drifted constant away from
 * returning (FR-039).
 */
export function viewConfigFromColumns(columnDefs: ColumnDef[]): ViewConfig {
  return {
    filters: [],
    sort: [],
    columns: columnDefs.map((c) => ({
      key: c.key,
      visible: c.visible,
      order: c.order,
      pin: c.pin,
    })),
    pageSize: DEFAULT_PAGE_SIZE,
  };
}
