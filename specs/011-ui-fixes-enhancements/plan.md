# Implementation Plan: UI Fixes and Enhancements

**Branch**: `011-ui-fixes-enhancements` | **Date**: 2026-06-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-ui-fixes-enhancements/spec.md`

## Summary

Seven UX issues from GitHub issue #28: (1) View/Edit navigation buttons should render as hyperlinks for new-tab support; (2) balance-sheet amount inputs should be numeric-only and IME-safe; (3) side menu expand should lock background scroll; (4) aggregation card tab labels in balance-sheet pages are hardcoded strings violating the i18n constitution; (5) delete actions already use confirmation dialogs in all finance pages — codify this as a constitution amendment; (6) datetime tooltips in the accounts page show redundant content when the cell already displays the full formatted value; (7) the user dropdown in the site header needs right-alignment.

All changes are frontend-only. No backend modifications, no OpenAPI regeneration, no new routes.

## Technical Context

**Language/Version**: TypeScript 5.7, React 18.3

**Primary Dependencies**: Ant Design 5.24, @ant-design/pro-components 2.8, React Router 7, react-intl, TanStack React Query 5, dayjs

**Storage**: N/A (UI-only changes)

**Testing**: Vitest + React Testing Library

**Target Platform**: Desktop/tablet browser (Chrome, Firefox, Safari)

**Project Type**: Single-page web application

**Performance Goals**: Standard SPA — no measurable overhead expected from any of these changes

**Constraints**: Must pass `pnpm lint`, `pnpm typecheck`, `pnpm test` after all changes

**Scale/Scope**: 7 isolated UI fixes across 5 existing source files + 2 locale files; no new files needed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Entity-Centric Domain Architecture | ✅ PASS | No domain entities added or modified |
| II — Domain Independence | ✅ PASS | Changes are cross-cutting UI (AppShell, locale files); no domain-to-domain imports |
| III — Reference Alignment (ov-fleet) | ✅ PASS | Button `href` + onClick, InputNumber, ProLayout collapse hook, AntD Dropdown placement — all standard AntD/React Router patterns |
| IV — API Contract-Driven Frontend | ✅ PASS | No API changes; no new types required |
| V — Quality Loop | ✅ GATE — must pass after every change | `pnpm lint && pnpm typecheck && pnpm test` |
| VI — UI/UX Reference | ✅ PASS | All changes align with or correct deviations from the UI standards |
| VII — PageTable Layout | ✅ PASS | No PageTable layout changes |
| **VIII — i18n (NON-NEGOTIABLE)** | ⚠️ CURRENT VIOLATION — fix required | Six tab labels in `balance-sheets/index.tsx` and `balance-sheets/detail.tsx` are hardcoded English strings. This violates Principle VIII. Fix 4 in this plan resolves it. |
| IX — Base Currency Valuation | ✅ PASS | Existing net-worth logic untouched |
| X — Chart Rendering | ✅ PASS | No chart changes |
| XI — Chart Library | ✅ PASS | No chart changes |
| XII — Entity Toolbar & Sort Controls | ✅ PASS | No toolbar changes |

**Violation finding**: `balance-sheets/index.tsx` lines 535–538 and `balance-sheets/detail.tsx` lines 489–494 use raw string literals in `tabList` labels. Must be fixed before this branch can be merged.

## Project Structure

### Documentation (this feature)

```text
specs/011-ui-fixes-enhancements/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no new data model — short file)
├── contracts/           # Phase 1 output (no API changes — not created)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (affected files only)

```text
apps/unihub/frontend/src/
  components/
    AppShell/
      AppShell.tsx                    # Fix 3 (scroll lock) + Fix 7 (dropdown alignment)
  pages/
    finance/
      accounts/
        index.tsx                     # Fix 6 (tooltip suppression)
      balance-sheets/
        index.tsx                     # Fix 1 (hyperlink buttons) + Fix 4 (i18n tabs)
        detail.tsx                    # Fix 1 (hyperlink Edit button) + Fix 4 (i18n tabs)
        new.tsx                       # Fix 2 (numeric-only InputNumber)
        edit.tsx                      # Fix 2 (numeric-only InputNumber)
  locales/
    en-US/pages.ts                    # Fix 4 — add 6 new keys for tab labels
    zh-TW/pages.ts                    # Fix 4 — matching zh-TW translations
```

## Complexity Tracking

No constitution violations requiring justification. The i18n violation is pre-existing (before this feature branch) and is corrected by this plan.

---

## Phase 0: Research

### R-001: AntD v5 Button `href` behaviour

**Decision**: Use AntD `Button` with the `href` prop for navigation buttons. When `href` is set, AntD v5 renders the button as `<a href="…" …>` — right-click and middle-click trigger the browser's native "Open in New Tab" affordance. Left-click fires the `onClick` handler; guard with `e.preventDefault()` + `navigate(path)` to keep SPA routing.

**Rationale**: No extra dependency. Works with React Router 7. The Delete button (which opens a modal) stays as a plain `<button>` with no `href`.

**Alternatives considered**: Wrapping `<Button>` in React Router `<Link>` — functional but produces nested interactive elements that can confuse assistive technology. The `href`-on-Button approach is cleaner and fully supported in AntD 5.

---

### R-002: Numeric-only amount input — InputNumber vs filtered Input

**Decision**: Replace the `Input` components in `new.tsx` and `edit.tsx` with AntD `InputNumber` using `stringMode={true}`.

**Rationale**: `InputNumber` natively blocks IME composition (the characters are discarded before the value state is updated) and accepts only numeric characters including minus signs and decimal points. `stringMode` preserves the value as a `string`, which matches the existing `amountMap: Record<string, string>` state.

**Handling edge cases**:
- Allow negative values (debt accounts): `InputNumber` permits minus by default.
- Decimal precision: leave unset so arbitrarily long decimals are accepted (the backend validates).
- `value` type: `InputNumber` with `stringMode` gives `string | null`; map `null` → `''` in the `onChange` handler.
- Existing behaviour: the `amountMap[record.id] ?? ''` initialiser is preserved. On load in `edit.tsx`, existing numeric strings from `existingBalances` are pre-populated.
- `addonBefore`: `InputNumber` supports `addonBefore` identically to `Input`. No layout change.

**Alternatives considered**: Keeping `Input` and filtering in `onChange` with `replace(/[^0-9.-]/g, '')` plus `onCompositionEnd` for IME. This works but is more fragile than using a purpose-built numeric component and requires more tests.

---

### R-003: ProLayout sidebar collapse and scroll lock

**Decision**: Track the sidebar open/closed state via ProLayout's `onCollapse` callback, store it in a `useState` hook in `AppShell`, and apply `document.body.style.overflow = 'hidden'` when the sidebar is expanded.

**Details**:
- ProLayout exposes `collapsed` (controlled) and `onCollapse` (change callback) props.
- Currently `AppShell` does not control `collapsed`. We add `const [siderCollapsed, setSiderCollapsed] = useState(true)` and wire `collapsed={siderCollapsed}` + `onCollapse={setSiderCollapsed}` to ProLayout.
- A `useEffect` watches `siderCollapsed` and sets `document.body.style.overflowY`:
  - `siderCollapsed === false` → `'hidden'`
  - `siderCollapsed === true` → `''` (restore)
- Cleanup: effect returns `() => { document.body.style.overflowY = ''; }` to restore on unmount.
- ProLayout's `fixSiderbar={true}` + `layout="mix"` means the sidebar is a fixed overlay on all viewports; this scroll lock applies universally.

**Alternatives considered**: CSS-only `body { overflow: hidden }` via a class toggle — equivalent, slightly messier with the class lifecycle in React. The `style.overflowY` approach is self-contained in the component.

---

### R-004: Balance-sheet aggregation tab i18n keys

**Decision**: Add 6 new locale keys under the `pages.finance.balanceSheets` namespace.

**New keys** (en-US / zh-TW):

| Key | en-US | zh-TW |
|-----|-------|-------|
| `pages.finance.balanceSheets.tab.equityCurve` | Equity Curve | 股權曲線 |
| `pages.finance.balanceSheets.tab.accountTrend` | Account Trend | 帳戶趨勢 |
| `pages.finance.balanceSheets.detail.tab.assetVsDebt` | A/L | 資產/負債 |
| `pages.finance.balanceSheets.detail.tab.assetsBreakdown` | Assets Breakdown | 資產明細 |
| `pages.finance.balanceSheets.detail.tab.debtsBreakdown` | Debts Breakdown | 負債明細 |
| `pages.finance.balanceSheets.detail.tab.statistics` | Statistics | 統計 |

These keys are intentionally distinct from the existing `visualization.netWorthTrend` / `visualization.stackedBreakdown` keys (which were never wired into the tab labels) to preserve backwards compatibility and avoid confusion.

---

### R-005: Datetime tooltip suppression in accounts page

**Decision**: Remove the `<Tooltip>` wrapper from the `open_datetime` and `close_datetime` column renders in `accounts/index.tsx`. Render `{formatted}` directly.

**Rationale**: `formatDateRelative` returns `YYYY-MM-DD HH:mm (X days ago)` — a complete representation of both absolute and relative time as required by Principle VI. The `<Tooltip>` adds `YYYY-MM-DD HH:mm:ss` (adding only seconds-level precision that is not meaningful for account open/close timestamps). The column width is set to `Math.max(220, measureTextWidth(formatDateRelative(...)))`, ensuring the full string is always visible. There is no truncation case, so the Tooltip is unconditionally redundant.

**Alternatives considered**: Making the Tooltip conditional on whether the column is narrow — too complex; column width is already sized to fit. The spec (FR-011) says "a tooltip MUST NOT appear on an element whose full content is already visible."

---

### R-006: User dropdown right-alignment

**Decision**: Add `placement="bottomRight"` to the `<Dropdown>` in `AppShell.tsx`.

**Rationale**: AntD `Dropdown` defaults to `placement="bottomLeft"` which aligns the dropdown's left edge with the trigger. In the site header, the trigger is at the far right, so the menu overflows to the right. `"bottomRight"` aligns the menu's right edge with the trigger's right edge, keeping it within the viewport.

---

## Phase 1: Design & Contracts

### Data Model (`data-model.md`)

No new data entities. No model changes. No migrations. No OpenAPI schema regeneration required.

The only state introduced:
- `siderCollapsed: boolean` — local component state in `AppShell`, not persisted

### API Contracts (`contracts/`)

No API changes. `contracts/` directory is not created.

### Fix-by-Fix Implementation Design

#### Fix 1 — Hyperlink View/Edit buttons (`balance-sheets/index.tsx`, `balance-sheets/detail.tsx`)

**Affected locations**:

1. **`balance-sheets/index.tsx`** — Actions column (lines 467–499): View button and Edit button navigate to separate pages. Delete button opens a modal and stays as-is.
   ```tsx
   // Before
   <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/finance/balance-sheets/${record.id}`)}>
   // After
   <Button size="small" icon={<EyeOutlined />} href={`/finance/balance-sheets/${record.id}`}
     onClick={(e) => { e.preventDefault(); navigate(`/finance/balance-sheets/${record.id}`); }}>
   ```
   Same pattern for Edit button (`/finance/balance-sheets/${record.id}/edit`).

2. **`balance-sheets/index.tsx`** — New Balance Sheet action button (line 717): navigates to `/finance/balance-sheets/new`. Add `href="/finance/balance-sheets/new"` with the same pattern.

3. **`balance-sheets/detail.tsx`** — Edit action button (line 568): navigates to `/finance/balance-sheets/${id}/edit`. Add `href` with the same pattern.

**TypeScript**: AntD `ButtonProps` declares `href?: string` — no type cast needed.

#### Fix 2 — Numeric-only amount input (`balance-sheets/new.tsx`, `balance-sheets/edit.tsx`)

**`new.tsx`**:
```tsx
// Add to imports
import { InputNumber } from 'antd';
// Remove Input from imports if no longer used

// Replace the render in columns:
render: (_, record) => (
  <InputNumber<string>
    stringMode
    value={amountMap[record.id] ?? null}
    onChange={(val) =>
      setAmountMap((prev) => ({ ...prev, [record.id]: val ?? '' }))
    }
    placeholder="0.00"
    addonBefore={getCurrencySymbol(record.currency)}
    style={{ width: '100%' }}
  />
),
```

**`edit.tsx`**: Same substitution. The seeding via `existingBalances` remains unchanged since it only sets string values in `amountMap`.

**Note**: `InputNumber` with `stringMode` returns the value as string on change, matching the existing `Record<string, string>` state.

#### Fix 3 — Side menu scroll lock (`AppShell.tsx`)

```tsx
// Add to state
const [siderCollapsed, setSiderCollapsed] = useState(true);

// Add effect
useEffect(() => {
  document.body.style.overflowY = siderCollapsed ? '' : 'hidden';
  return () => { document.body.style.overflowY = ''; };
}, [siderCollapsed]);

// Wire to ProLayout
<ProLayout
  ...
  collapsed={siderCollapsed}
  onCollapse={setSiderCollapsed}
>
```

#### Fix 4 — Balance sheet aggregation tab i18n

**Locale additions** (both `en-US/pages.ts` and `zh-TW/pages.ts`):

In `balance-sheets/index.tsx`:
```tsx
tabList={[
  { key: 'net-worth-trend',   label: t({ id: 'pages.finance.balanceSheets.tab.equityCurve' }) },
  { key: 'stacked-breakdown', label: t({ id: 'pages.finance.balanceSheets.tab.accountTrend' }) },
]}
```

In `balance-sheets/detail.tsx`:
```tsx
tabList={[
  { key: 'asset-vs-debt',  label: t({ id: 'pages.finance.balanceSheets.detail.tab.assetVsDebt' }) },
  { key: 'assets-only',    label: t({ id: 'pages.finance.balanceSheets.detail.tab.assetsBreakdown' }) },
  { key: 'debts-only',     label: t({ id: 'pages.finance.balanceSheets.detail.tab.debtsBreakdown' }) },
  { key: 'aggregation',    label: t({ id: 'pages.finance.balanceSheets.detail.tab.statistics' }) },
]}
```

#### Fix 5 — Confirm-before-delete: Constitution Amendment

All finance pages already use `Modal.confirm` before executing deletions. No code change is required. This fix consists of an amendment to the UniHub Constitution (`.specify/memory/constitution.md`) that codifies this as a mandatory global rule under a new section in the Development Constraints or as an addendum to Principle VI.

The amendment text:
> **Delete confirmation (NON-NEGOTIABLE)**: Every user-initiated destructive action (entity deletion, batch deletion, irreversible record removal) MUST display an Ant Design `Modal.confirm` dialog before executing. The dialog MUST carry `okType: 'danger'`. Clicking Cancel MUST abort the action with no side effects. The confirmation title and body MUST use locale keys (`formatMessage`). Inline or silent deletion without a confirmation gate is a constitution violation.

This amendment also updates the Constitution version from `1.13.0` → `1.13.1` (PATCH: new deletion safeguard rule).

#### Fix 6 — Tooltip suppression (`accounts/index.tsx`)

```tsx
// Before (open_datetime render):
const formatted = formatDateRelative(record.open_datetime);
return formatted ? (
  <Tooltip title={dayjs(record.open_datetime!).format('YYYY-MM-DD HH:mm:ss')}>
    {formatted}
  </Tooltip>
) : <...empty placeholder...>;

// After:
const formatted = formatDateRelative(record.open_datetime);
return formatted ?? <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>;
```

Same for `close_datetime`. Remove `Tooltip` from the imports if it is no longer used on this page.

#### Fix 7 — User dropdown alignment (`AppShell.tsx`)

```tsx
// Before
<Dropdown menu={{ items: [...] }}>
// After
<Dropdown menu={{ items: [...] }} placement="bottomRight">
```

### Agent Context Update

Update the plan reference in `CLAUDE.md` between the `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers to point to `specs/011-ui-fixes-enhancements/plan.md`.

---

## Post-Design Constitution Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| VIII — i18n | ✅ NOW RESOLVED | Fix 4 wires all 6 hardcoded tab labels through `formatMessage` |
| V — Quality Loop | ✅ GATE | All 7 fixes must pass lint + typecheck + test before tasks are created |
| All others | ✅ PASS | No regressions identified in design review |

No new violations introduced by the design.
