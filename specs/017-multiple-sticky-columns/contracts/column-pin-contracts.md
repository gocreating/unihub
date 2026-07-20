# Interface Contracts: Multiple Sticky Columns

**Feature**: 017-multiple-sticky-columns | **Date**: 2026-07-20

No HTTP API is exposed or consumed by this feature (frontend-only; constitution IV untouched). The contracts below are the internal interfaces other frontend code relies on.

## C1. `useColumnConfig` hook contract

```ts
function useColumnConfig(initialColumns: ColumnDef[]): UseColumnConfigReturn
```

- `visibleColumns` MUST return visible columns in display order: left-pinned group (by `order`), unpinned (by `order`), right-pinned group (by `order`).
- `fixedForKey(key)` MUST return `'left'`/`'right'` for a **visible** pinned column, `undefined` for unpinned, hidden, or unknown keys.
- `pinFingerprint` MUST be a stable string that changes iff the set/side/display-order of visible pinned columns changes (format: `key:side` pairs joined with `|`; empty string when nothing pinned). Visibility changes of pinned columns DO change it; changes to unpinned columns MUST NOT.
- `apply`/`cancel`/`reset`/`isDirty`/`isCustomised` keep constitution-XII apply-gate semantics, now covering pin diffs.
- The async label-patch MUST preserve `visible`, `order`, and `pin` on kept columns, and return referentially-equal state when nothing changed (test-hang guard, existing rule).
- Removed members: `firstColumnFixed`, `lastColumnFixed`, `defaultSticky` parameter. Compile-time breaking — all six consumer pages updated in this feature.

## C2. `ColumnPanel` DOM contract (RTL + e2e selectors)

- Each column row: `[data-column-row="<colKey>"]`.
- Inside each row, exactly two pin buttons: `[data-sticky-pin="left"]` and `[data-sticky-pin="right"]` (attribute names retained from the single-pin UI for selector continuity; now present on EVERY row).
- Active pin renders the filled pushpin (blue `#1677ff`), inactive the outlined pushpin (gray `#bfbfbf`) — same visual language as today.
- Buttons carry i18n tooltips: `common.entityOps.columns.pinLeft` / `common.entityOps.columns.pinRight` (both locales).
- Clicking updates `pendingState` ONLY (Apply commits; Cancel discards; Reset restores defaults). Mutual exclusion: activating one side clears the other in the same update.

## C3. Page integration contract (all 6 consumer pages)

- Column `fixed` MUST come from `cols.fixedForKey(columnKey)` — no page-local first/last-visible logic.
- The catalog's `expandable.fixed` MUST use `cols.fixedForKey('__caret')`.
- The PageTable remount `key` MUST embed `cols.pinFingerprint` (replacing first/last-visible identity + boolean flags). Other key components (e.g. catalog `flatMode`) are unchanged.
- Default pins are declared on the page's `ColumnDef`s via `pin` (catalog: `__caret` → `'left'`, `actions` → `'right'`; other pages: no defaults).

## C4. Rendered-table contract (what e2e asserts)

- With N left-pinned visible columns: the first N rendered columns carry `.ant-table-cell-fix-left`, and ONLY the N-th carries `.ant-table-cell-fix-left-last` (boundary shadow host). Mirror for right (`.ant-table-cell-fix-right`, `.ant-table-cell-fix-right-first`).
- At any horizontal scroll offset, pinned header and body cells keep viewport-edge-flush bounding boxes and header/body x-alignment (SC-005; asserted with real-browser geometry, not JSDOM styles).
- With no horizontal overflow, no pin shadows render (rc-table ping classes absent).
