# Research: Multiple Sticky Columns

**Feature**: 017-multiple-sticky-columns | **Date**: 2026-07-20

No `NEEDS CLARIFICATION` markers remained in the Technical Context; the decisions below resolve the design choices the spec left to planning (the issue explicitly left UI/UX open).

## D1. Pin state model — `pin?: 'left' | 'right'` on each column entry

**Decision**: Add `pin?: 'left' | 'right'` to `ColumnDef` (the per-column record inside `ColumnState.columns`) and delete `ColumnState.stickyLeft` / `stickyRight`. A column is pinned to at most one side; `undefined` = unpinned.

**Rationale**: The column list is already the single source of truth for visibility and order — pin is the same kind of per-column display attribute. The existing label-patch effect (async `attr:<id>` columns appearing/disappearing) already preserves per-column fields on kept columns, so pin state survives definition reloads for free. Mutual exclusion ("at most one side") is guaranteed structurally by a single field rather than by cross-checking two sets.

**Alternatives considered**: (a) Two ordered arrays `pinnedLeftKeys[]`/`pinnedRightKeys[]` on `ColumnState` — rejected: second source of truth beside `columns`, needs reconciliation on column append/drop and duplicates ordering information. (b) "Freeze first N columns" counters — rejected: spec FR-001 requires pinning arbitrary columns, and the catalog's default (caret + Actions on opposite edges) isn't expressible as prefix counts alone.

## D2. Display ordering — one shared pin-group-major comparator

**Decision**: A single exported ordering function sorts visible columns by `(pinRank, order)` where `pinRank` is left=0, unpinned=1, right=2. `useColumnConfig.visibleColumns` and the ColumnPanel row list both use it, so the panel shows exactly the order the table renders.

**Rationale**: rc-table (AntD Table's engine) requires fixed columns to be **contiguous at the array edges** — non-contiguous `fixed` columns trigger the "Index of fixed columns should be continuous" warning and broken sticky offsets. Deriving the grouped order (rather than mutating `order` when pinning) preserves each column's relative order within its group (spec FR-003) and means unpinning returns a column to its natural position. Pin toggles never rewrite `order`; drag-reorder in the panel keeps writing sequential `order` values from the displayed arrangement (existing `handleReorder` logic), which composes correctly with the group-major sort.

**Alternatives considered**: Rewriting `order` so pinned columns get extreme values — rejected: destroys the column's home position on unpin and complicates Reset/isCustomised comparisons.

## D3. Defaults — seed `pin` in page `columnDefs`, delete `defaultSticky`

**Decision**: Pages declare default pins directly on their `ColumnDef` entries (catalog: `__caret` gets `pin: 'left'`, `actions` gets `pin: 'right'`). The `defaultSticky?: { left; right }` option on `useEntityTable`/`useColumnConfig` is removed.

**Rationale**: One declaration site for all column defaults (visibility, order, pin). Catalog is the **only** consumer of `defaultSticky` (verified by grep), so the removal touches one page. `reset()` and `isCustomised` already anchor on `initialColumns`, so default pins flow through Reset with no extra code.

**Alternatives considered**: Keeping `defaultSticky` and translating booleans to first/last-visible pins — rejected: dead compatibility API with a single consumer, and "first visible" is ambiguous once pins reorder the view.

## D4. Page integration — `fixedForKey()` + `pinFingerprint`

**Decision**: `useColumnConfig` returns `fixedForKey(key): 'left' | 'right' | undefined` (replacing `firstColumnFixed`/`lastColumnFixed`) and `pinFingerprint: string` — the display-ordered `key:side` pairs of visible pinned columns joined (e.g. `"__caret:left|actions:right"`, `""` when nothing is pinned). Pages set `fixed: cols.fixedForKey(colKey)` per column (and the catalog's `expandable.fixed` from `fixedForKey('__caret')`) and embed `cols.pinFingerprint` in the PageTable remount `key` where they currently embed first/last-visible identity + boolean flags.

**Rationale**: Constitution XII requires a ProTable remount when pin state changes (ProTable's internal sticky/column-layout state ignores post-mount `fixed` prop changes). The fingerprint captures exactly the state whose change requires a remount — which columns are pinned, to which side, in which order — and removes the per-page first/last special-casing (`getFixed` helpers comparing `visibleColumns[0]`/`.at(-1)`).

**Alternatives considered**: JSON-stringifying the whole column state into the key — rejected: remounts on visibility/order changes that don't need one, losing scroll position unnecessarily.

## D5. Panel UX — pin-left + pin-right buttons on every row

**Decision**: Every row in the ColumnPanel renders two pushpin buttons: pin-left (pushpin icon, filled blue when active) and pin-right (same, mirrored/rotated to distinguish side). Clicking an inactive side pins the column there — clearing the other side if set (mutual exclusion); clicking the active side unpins. Buttons keep the existing `data-sticky-pin="left" | "right"` attributes, now scoped per-row inside the existing `data-column-row="<key>"` wrapper, so e2e/RTL selectors compose as `[data-column-row="name"] [data-sticky-pin="left"]`. Each button gets an i18n tooltip (`common.entityOps.columns.pinLeft`/`pinRight`). Pin changes go through `pendingState` and only take effect on Apply (constitution XII apply-gate), exactly like visibility/order today. Hidden columns keep their pin buttons active-state visible (FR-010: hiding retains pin state).

**Rationale**: The issue left UI/UX open; the spec (Assumptions) picked per-column pin controls as the natural generalization of the panel's existing first/last pushpins — same iconography, same location, no new surfaces. Distinct left/right buttons make the target side a one-click action and make the current state glanceable; a single cycling button (none→left→right→none) was rejected as less discoverable and slower for the common "pin right" case.

**Alternatives considered**: Drag-into-pin-zones inside the panel — rejected: heavier interaction redesign, conflicts with the existing drag-to-reorder gesture, and explicitly deferred by the spec.

## D6. No persistence — session-scoped state (spec corrected)

**Decision**: Pin state lives in the same in-memory React state as the rest of the column configuration. No `localStorage`, no migration code.

**Rationale**: Investigation showed the presumed persistence does not exist: `useEntityFilter`/`useEntitySort` receive an unused `_key`, `useColumnConfig` has no storage, and the only `localStorage` uses in the app are locale and base currency. The page-level `key: 'inventory-catalog-v7'` comment about "previously-saved state" is historical. Adding cross-session persistence would be scope creep beyond issue #37; the spec was amended (US3, FR-005, FR-007, SC-003/SC-004, Assumptions) to match reality. Consequently there are **no saved single-pin preferences to migrate** — FR-007 reduces to removing the global toggles without capability loss.

## D7. AntD multi-fixed behavior — native support, verified expectations

**Decision**: Rely on rc-table's native multi-fixed-column support; no custom sticky CSS.

**Rationale / facts to verify in e2e**: multiple `fixed: 'left'` columns stack with cumulative `left` offsets computed by rc-table; the boundary shadow is applied via `.ant-table-cell-fix-left-last` (only on the LAST left-fixed column) and `.ant-table-cell-fix-right-first` (only on the FIRST right-fixed column) — which directly satisfies FR-008 (one shadow per side, never between pinned columns) and gives e2e stable class hooks. Shadows only render when `.ant-table-ping-left`/`-ping-right` indicate hidden overflow on that side (edge case "narrow tables"). The existing PageTable sticky header/footer/scrollbar machinery is orthogonal to column fixing and needs no changes.

## D8. Locale changes

**Decision**: Add `common.entityOps.columns.pinLeft` ("Pin left" / 「固定於左側」-style zh-TW) and `common.entityOps.columns.pinRight` to both locale files in the same commit; delete the now-unused `common.entityOps.columns.stickyLeft`/`stickyRight` keys from both.

**Rationale**: Constitution VIII — keys in sync, no orphans. Exact zh-TW phrasing to follow the existing translation style in `locales/zh-TW/pages.ts`.

## D9. Test strategy — TDD inside-out, geometry in a real browser

**Decision**:
1. **Hook first** (`useColumnConfig.test.ts`, red-green): pin set/clear/mutual-exclusion via `setPendingState` + `apply`; grouped `visibleColumns` order; `fixedForKey`; `pinFingerprint` (incl. hidden-pinned exclusion); `reset` restoring seeded pins; label-patch preserving pins; append/drop preserving pins; `isCustomised`/`isDirty` with pin-only changes.
2. **Panel** (`ColumnPanel.test.tsx`): every row shows both pin buttons; active-state rendering; mutual exclusion on click; hidden column keeps pin; apply-gate (no effect until Apply, Cancel discards, Reset restores defaults + disabled states).
3. **Pages** (existing page tests): catalog/accounts assert `fixed` classes (`ant-table-cell-fix-left`/`-fix-right`) land on multi-pinned columns in JSDOM render, and the remount key changes when pins change.
4. **e2e** (`column-pin.spec.ts`, real browser, 600px viewport for natural overflow): pin 2 left + 2 right on a wide table → scroll to both extremes → assert pinned header/body cells' bounding boxes stay flush at the viewport-edge positions (per the visual-geometry memory rule: real-browser geometry assertions, not JSDOM style checks); assert exactly one `.ant-table-cell-fix-left-last` / `.ant-table-cell-fix-right-first` boundary per side; assert header/body x-alignment of pinned cells mid-scroll (SC-005).

**Rationale**: Matches the project's TDD preference (test the abstraction first, not the callers) and the standing visual-geometry verification rule.

## D10. Constitution amendment — v1.23.0 (MINOR)

**Decision**: Amend Principle XII in the same feature: (a) remount-key bullet — "Pages using `useColumnConfig` MUST also include the sticky-pin state (**the pin fingerprint: visible pinned columns + sides, in display order**) in the `key`"; (b) label-patch bullet — "Only `label` is updated; `visible`, `order`, **`pin`** are never touched by the patch." Update the Sync Impact Report header and bump to v1.23.0 (material change to existing guidance = MINOR under the versioning policy).

**Rationale**: The constitution currently hardcodes the two-boolean mechanism this feature replaces; leaving it stale would make the constitution prescribe a removed API. Governance procedure requires the amendment to ride with the change.
