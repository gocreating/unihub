# Data Model: Multiple Sticky Columns

**Feature**: 017-multiple-sticky-columns | **Date**: 2026-07-20

Frontend-only feature — no backend models, migrations, or API schema changes. The "data model" is the in-memory column-configuration state owned by `useColumnConfig` (`apps/unihub/frontend/src/components/EntityToolbar/`).

## Types (before → after)

### `PinSide` (new)

```ts
export type PinSide = 'left' | 'right';
```

### `ColumnDef` (extended)

```ts
export interface ColumnDef {
  key: string;
  label: string;
  dataType: AttributeDataType;
  visible: boolean;
  /** Display position — lower numbers appear further left (within a pin group). */
  order: number;
  /** Pinned edge; undefined = not pinned. At most one side per column. */
  pin?: PinSide;            // NEW
}
```

`ColumnDef` doubles as (a) the page-declared default (in `columnDefs` memos — where `pin` seeds default pins, e.g. catalog `__caret: pin 'left'`, `actions: pin 'right'`) and (b) the live per-column state inside `ColumnState.columns`.

### `ColumnState` (simplified)

```ts
export interface ColumnState {
  columns: ColumnDef[];
  // REMOVED: stickyLeft: boolean;
  // REMOVED: stickyRight: boolean;
}
```

### `UseColumnConfigReturn` (changed members only)

```ts
export interface UseColumnConfigReturn {
  // ... pendingState, activeState, apply, cancel, reset, setPendingState unchanged ...
  /** Visible columns in DISPLAY order: left-pinned group, unpinned, right-pinned group. */
  visibleColumns: ColumnDef[];                       // ordering semantics changed
  /** Pinned edge for a column key (visible columns only), for ProColumns.fixed. */
  fixedForKey: (key: string) => PinSide | undefined; // NEW — replaces firstColumnFixed/lastColumnFixed
  /** Remount-key component: display-ordered "key:side" pairs of visible pinned columns, '|'-joined. */
  pinFingerprint: string;                            // NEW
  isCustomised: boolean;                             // now includes pin diffs
  isDirty: boolean;                                  // now includes pin diffs
}
```

`useColumnConfig(initialColumns)` — the `defaultSticky` second parameter is **removed** (defaults ride on `ColumnDef.pin`). `useEntityTable`'s `defaultSticky` option is removed accordingly.

## Derived ordering

```
pinRank(col) = 0 if col.pin === 'left', 2 if col.pin === 'right', 1 otherwise
displayOrder = sort by (pinRank, order)     // stable within groups
```

- Used by `visibleColumns` (table) AND the ColumnPanel row list (panel is WYSIWYG).
- Pin toggles never mutate `order`; drag-reorder writes sequential `order` values from the displayed arrangement (existing behavior), which composes with group-major sorting.

## Invariants & validation rules

| # | Invariant | Enforced by |
|---|-----------|-------------|
| 1 | A column is pinned to at most one side | Single `pin` field (structural); panel click handler swaps sides |
| 2 | Fixed columns are contiguous at the array edges handed to ProTable | `displayOrder` sort (rc-table requirement) |
| 3 | Relative order within each pin group preserves `order` | Stable sort, pin toggles don't touch `order` |
| 4 | Hidden columns keep their `pin` (FR-010) | Visibility toggle leaves `pin` untouched; `fixedForKey`/`pinFingerprint` consider visible columns only |
| 5 | Label patch (async column defs) never touches `visible`/`order`/`pin` | Patch effect maps `label` only (existing pattern, extended to pin) |
| 6 | Appended columns (new `attr:<id>` defs) enter with their declared default `pin` (usually none); dropped columns vanish with their pin | Patch effect append/drop paths |
| 7 | `reset()` restores `initialColumns` including seeded pins | Existing reset anchored on `initialColumns` |
| 8 | Pin changes are apply-gated: `pendingState` only, until Apply | Constitution XII pattern (unchanged flow) |
| 9 | `pinFingerprint` changes ⇔ ProTable must remount | Pages embed it in the PageTable `key` (constitution XII, amended) |

## State transitions (per column, via panel)

```
unpinned --click pin-left--> pinned-left
unpinned --click pin-right-> pinned-right
pinned-left --click pin-right-> pinned-right   (side swap, one action)
pinned-left --click pin-left--> unpinned       (toggle off)
pinned-* --hide column--> hidden, pin retained (excluded from fingerprint/fixed)
hidden pinned --show column--> visible in its pin group again
any --Reset--> ColumnDef defaults (visibility, order, pin)
```

## No backend entities

No Django models, serializers, filters, or `data_io` descriptors are created or modified. Constitution Principle I's data-portability rule is not triggered.
