# Tasks: UI Fixes and Enhancements

**Input**: Design documents from `specs/011-ui-fixes-enhancements/`

**Prerequisites**: plan.md ✅, spec.md ✅, data-model.md ✅

**Organization**: 7 independent UI fixes, each as its own phase. No shared state — all stories can be worked in parallel after Phase 1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story label (US1–US7)
- TDD approach applied: test tasks precede implementation tasks for each story

## Path Conventions

- Frontend source: `apps/unihub/frontend/src/`
- Tests colocated with source (e.g., `BalanceSheetsPage.test.tsx` beside `index.tsx`)

---

## Phase 1: Setup (Baseline Verification)

**Purpose**: Verify clean state before any changes are made

- [ ] T001 Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/` and confirm zero errors — all subsequent fixes must preserve this baseline

**Checkpoint**: Baseline clean — all 7 fixes can begin independently

---

## Phase 2: User Story 1 — Open Entity Pages in New Tab (Priority: P1) 🎯 MVP

**Goal**: View and Edit buttons on the balance-sheet list and detail pages render as anchor elements, enabling right-click → "Open in New Tab" and middle-click.

**Independent Test**: Navigate to `/finance/balance-sheets`. Right-click the View or Edit button for any row. The browser context menu shows "Open in New Tab". Middle-clicking opens the detail/edit page in a new tab.

### Tests for User Story 1

> **Write these tests FIRST — they must FAIL before implementation**

- [ ] T002 [P] [US1] Create `apps/unihub/frontend/src/pages/finance/balance-sheets/BalanceSheetsPage.test.tsx` — render the actions column for a mocked balance sheet row and assert that the View button renders as `<a>` with the correct `href` (`/finance/balance-sheets/<id>`) and the Edit button renders as `<a>` with `href` `/finance/balance-sheets/<id>/edit`
- [ ] T003 [P] [US1] In the same test file, assert that the Delete button does NOT have an `href` attribute (it opens a modal, not a page)

### Implementation for User Story 1

- [ ] T004 [P] [US1] In `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` (actions column, lines ~467–487): add `href={/finance/balance-sheets/${record.id}}` and `onClick={(e) => { e.preventDefault(); navigate(...); }}` to the View Button; same pattern for the Edit Button; Delete Button unchanged
- [ ] T005 [P] [US1] In `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` (New Balance Sheet action button, line ~717): add `href="/finance/balance-sheets/new"` with `onClick={(e) => { e.preventDefault(); navigate('/finance/balance-sheets/new'); }}`
- [ ] T006 [US1] In `apps/unihub/frontend/src/pages/finance/balance-sheets/detail.tsx` (Edit action button, line ~568): add `href={/finance/balance-sheets/${id}/edit}` with the same prevent-default pattern
- [ ] T007 [US1] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/` — all tests including T002/T003 must pass

**Checkpoint**: View/Edit/New buttons on balance-sheet pages are now real anchor elements — new-tab support works

---

## Phase 3: User Story 2 — Balance Sheet Amount Input Usability (Priority: P1)

**Goal**: The amount field in balance-sheet create and edit forms is empty by default and rejects non-numeric input including Chinese IME characters.

**Independent Test**: Open the balance-sheet creation form. Verify the amount field is empty. Attempt to type Chinese characters via IME — nothing should appear. Type `123.45` — it appears correctly.

### Tests for User Story 2

> **Write these tests FIRST — they must FAIL before implementation**

- [ ] T008 [P] [US2] Create `apps/unihub/frontend/src/pages/finance/balance-sheets/BalanceSheetNewPage.test.tsx` — render the page with mocked accounts data and assert that the amount cell renders an `InputNumber` component (not a plain `Input`) for each account row
- [ ] T009 [P] [US2] Create `apps/unihub/frontend/src/pages/finance/balance-sheets/BalanceSheetEditPage.test.tsx` — render the page with mocked accounts and existing balances and assert that the amount cells use `InputNumber`; assert that the pre-seeded value from existing balances is reflected in the `value` prop

### Implementation for User Story 2

- [ ] T010 [P] [US2] In `apps/unihub/frontend/src/pages/finance/balance-sheets/new.tsx`: replace the `Input` component in the amount column `render` with `InputNumber<string> stringMode`, `value={amountMap[record.id] ?? null}`, `onChange={(val) => setAmountMap((prev) => ({ ...prev, [record.id]: val ?? '' }))}`, `placeholder="0.00"`, `addonBefore={getCurrencySymbol(record.currency)}`, `style={{ width: '100%' }}`; remove `Input` from imports if unused
- [ ] T011 [P] [US2] In `apps/unihub/frontend/src/pages/finance/balance-sheets/edit.tsx`: apply the same `InputNumber<string> stringMode` substitution as T010; the existing-balance seeding logic in `setAmountMap` is unchanged
- [ ] T012 [US2] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/` — T008/T009 must pass

**Checkpoint**: Balance-sheet amount fields are numeric-only and IME-safe

---

## Phase 4: User Story 3 — Side Menu Expands Without Background Scroll (Priority: P2)

**Goal**: When the side navigation drawer is open, the main page content cannot be scrolled. Scroll position is preserved when the drawer closes.

**Independent Test**: Scroll a long page (e.g., balance-sheet list with many rows) partially down. Open the side menu. Attempt to scroll with mouse wheel — the page must not move. Close the menu — scroll position unchanged.

### Tests for User Story 3

> **Write these tests FIRST — they must FAIL before implementation**

- [ ] T013 [US3] Create `apps/unihub/frontend/src/components/AppShell/AppShell.test.tsx` — render `AppShell` with mocked auth query; simulate calling the `onCollapse` callback with `false` (sidebar expanding); assert `document.body.style.overflowY === 'hidden'`; then simulate `onCollapse(true)` and assert `document.body.style.overflowY === ''`

### Implementation for User Story 3

- [ ] T014 [US3] In `apps/unihub/frontend/src/components/AppShell/AppShell.tsx`: add `const [siderCollapsed, setSiderCollapsed] = useState(true)` state; add a `useEffect` that sets `document.body.style.overflowY = siderCollapsed ? '' : 'hidden'` with cleanup `() => { document.body.style.overflowY = ''; }`; add `collapsed={siderCollapsed}` and `onCollapse={setSiderCollapsed}` to `<ProLayout>`; import `useState` and `useEffect` if not already imported
- [ ] T015 [US3] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/` — T013 must pass

**Checkpoint**: Side menu open/close correctly locks and restores page scroll

---

## Phase 5: User Story 4 — Balance Sheet Aggregation Tabs in Current Language (Priority: P2)

**Goal**: The aggregation card tab labels on the balance-sheet list and detail pages are internationalised and display in the active interface language.

**Independent Test**: Set the interface to Traditional Chinese. Open the balance-sheet list page. The two chart card tabs should display in Chinese. Open a balance-sheet detail page. All four chart card tabs should display in Chinese.

### Tests for User Story 4

> **Write these tests FIRST — they must FAIL before implementation**

- [ ] T016 [P] [US4] In `apps/unihub/frontend/src/pages/finance/balance-sheets/BalanceSheetsPage.test.tsx` (from T002): add a test asserting that the chart card `tabList` labels are NOT the hardcoded strings `'Equity Curve'` or `'Account Trend'` — they must be i18n message values; verify by rendering with a custom intl provider that overrides the keys to sentinel values and confirming the sentinels appear
- [ ] T017 [P] [US4] Create `apps/unihub/frontend/src/pages/finance/balance-sheets/BalanceSheetDetailPage.test.tsx` — render `BalanceSheetDetailPage` with mocked data and assert that the chart card `tabList` labels are not the literal strings `'A/L'`, `'Assets Breakdown'`, `'Debts Breakdown'`, or `'Statistics'`

### Implementation for User Story 4

- [ ] T018 [P] [US4] In `apps/unihub/frontend/src/locales/en-US/pages.ts`: add the 6 new keys under the `pages.finance.balanceSheets` namespace as specified in plan.md Phase 1 (R-004):
  - `pages.finance.balanceSheets.tab.equityCurve`: `'Equity Curve'`
  - `pages.finance.balanceSheets.tab.accountTrend`: `'Account Trend'`
  - `pages.finance.balanceSheets.detail.tab.assetVsDebt`: `'A/L'`
  - `pages.finance.balanceSheets.detail.tab.assetsBreakdown`: `'Assets Breakdown'`
  - `pages.finance.balanceSheets.detail.tab.debtsBreakdown`: `'Debts Breakdown'`
  - `pages.finance.balanceSheets.detail.tab.statistics`: `'Statistics'`
- [ ] T019 [P] [US4] In `apps/unihub/frontend/src/locales/zh-TW/pages.ts`: add the matching 6 zh-TW keys:
  - `pages.finance.balanceSheets.tab.equityCurve`: `'股權曲線'`
  - `pages.finance.balanceSheets.tab.accountTrend`: `'帳戶趨勢'`
  - `pages.finance.balanceSheets.detail.tab.assetVsDebt`: `'資產/負債'`
  - `pages.finance.balanceSheets.detail.tab.assetsBreakdown`: `'資產明細'`
  - `pages.finance.balanceSheets.detail.tab.debtsBreakdown`: `'負債明細'`
  - `pages.finance.balanceSheets.detail.tab.statistics`: `'統計'`
- [ ] T020 [US4] In `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` (tabList around line 535): replace hardcoded labels with `t({ id: 'pages.finance.balanceSheets.tab.equityCurve' })` and `t({ id: 'pages.finance.balanceSheets.tab.accountTrend' })`
- [ ] T021 [US4] In `apps/unihub/frontend/src/pages/finance/balance-sheets/detail.tsx` (tabList around line 489): replace all 4 hardcoded labels with their locale key equivalents from T018/T019
- [ ] T022 [US4] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/` — T016/T017 must pass; TypeScript must report zero errors on both locale files (ensures both locales stay in sync)

**Checkpoint**: Balance-sheet chart tab labels fully internationalised — constitution violation resolved

---

## Phase 6: User Story 5 — Confirm Before Deletion (Priority: P2)

**Goal**: The "confirm before delete" behaviour is codified as a mandatory global rule in the UniHub Constitution. All existing finance pages already comply — no code changes needed.

**Independent Test**: Audit every delete action in the finance pages (`currencies`, `accounts`, `exchange-rates`, `balance-sheets`). Each must trigger a `Modal.confirm` dialog before executing. Confirmed in plan.md: all 4 finance pages already use `Modal.confirm`.

### Implementation for User Story 5

- [ ] T023 [US5] In `.specify/memory/constitution.md`: add a "Delete Confirmation (NON-NEGOTIABLE)" rule to the Development Constraints section stating: every destructive delete action MUST use `Modal.confirm` with `okType: 'danger'`; title and body text MUST use locale keys; inline or silent deletion is a constitution violation; bump version comment in the file from `1.13.0` → `1.13.1` and add a SYNC IMPACT REPORT entry for this PATCH amendment

**Checkpoint**: Constitution documents the delete-confirmation invariant; all existing code already compliant

---

## Phase 7: User Story 6 — No Redundant Tooltips on Fully Visible Content (Priority: P3)

**Goal**: The `open_datetime` and `close_datetime` columns in the accounts page no longer wrap their content in a `<Tooltip>` because the column is sized to show the full formatted datetime string.

**Independent Test**: Open the accounts page. Hover over an open-time or close-time cell. No tooltip should appear. The full `YYYY-MM-DD HH:mm (X days ago)` string is already visible in the cell.

### Tests for User Story 6

> **Write these tests FIRST — they must FAIL before implementation**

- [ ] T024 [US6] In a new `apps/unihub/frontend/src/pages/finance/accounts/AccountsPage.test.tsx`: render the page with mocked accounts that have `open_datetime` and `close_datetime` set; assert that NO `Tooltip` component is rendered wrapping the datetime cells (the datetime string appears directly in the cell without a tooltip ancestor)

### Implementation for User Story 6

- [ ] T025 [US6] In `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` (lines ~255–264): remove the `<Tooltip>` wrapper from the `open_datetime` column render — replace with direct return of `formatted` or the empty placeholder; same for `close_datetime` (lines ~271–280); remove `Tooltip` from the import line if it is no longer used elsewhere in the file
- [ ] T026 [US6] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/` — T024 must pass; Tooltip import warnings must be gone

**Checkpoint**: Accounts page datetime cells show no redundant tooltip

---

## Phase 8: User Story 7 — User Dropdown Menu Right-Aligned (Priority: P3)

**Goal**: The user avatar/name dropdown in the site header opens aligned to its right edge, staying fully within the viewport.

**Independent Test**: Click the user avatar/name in the site header on any page. The dropdown menu opens below and aligns to the right edge of the trigger — it does not overflow to the right of the viewport.

### Tests for User Story 7

> **Write these tests FIRST — they must FAIL before implementation**

- [ ] T027 [US7] In `apps/unihub/frontend/src/components/AppShell/AppShell.test.tsx` (from T013): add an assertion that the `Dropdown` component wrapping the avatar has `placement="bottomRight"` prop

### Implementation for User Story 7

- [ ] T028 [US7] In `apps/unihub/frontend/src/components/AppShell/AppShell.tsx` (avatarProps render, line ~103): add `placement="bottomRight"` to the `<Dropdown>` element
- [ ] T029 [US7] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/` — T027 must pass

**Checkpoint**: User dropdown no longer overflows viewport at the right edge

---

## Phase N: Polish & Final Quality Gate

**Purpose**: Confirm all 7 fixes are integrated, the quality loop is clean, and the spec is closed

- [ ] T030 [P] Run the full quality loop from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test` — confirm zero lint warnings, zero type errors, all tests pass
- [ ] T031 [P] Manual smoke test: open the browser at the local dev server; verify each of the 7 fix acceptance scenarios from `spec.md` passes (new-tab buttons, numeric input, scroll lock, translated tabs, delete confirmation, no tooltip, right-aligned dropdown)
- [ ] T032 Verify both locale files (`en-US/pages.ts` and `zh-TW/pages.ts`) have matching key counts for the 6 new tab-label keys added in T018/T019 — TypeScript should catch asymmetry at T022 but do a final eyes-on review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phases 2–8 (User Stories)**: All depend on Phase 1 baseline; all independent of each other — can proceed in any order or fully in parallel
- **Phase N (Polish)**: Depends on all desired stories complete

### User Story Dependencies

All 7 user stories are independent of each other:

| Story | Files Changed | Depends On |
|-------|--------------|------------|
| US1 — Hyperlink buttons | `balance-sheets/index.tsx`, `balance-sheets/detail.tsx` | None |
| US2 — Numeric input | `balance-sheets/new.tsx`, `balance-sheets/edit.tsx` | None |
| US3 — Scroll lock | `AppShell.tsx` | None |
| US4 — Tab i18n | `balance-sheets/index.tsx`, `balance-sheets/detail.tsx`, locale files | None |
| US5 — Constitution amendment | `.specify/memory/constitution.md` | None |
| US6 — Tooltip suppression | `accounts/index.tsx` | None |
| US7 — Dropdown alignment | `AppShell.tsx` | None (independent of US3 changes to same file) |

**Note on US3 and US7**: Both modify `AppShell.tsx`. If worked in parallel, merge the changes carefully to avoid conflicts.

### Within Each User Story

1. Write tests first (T_test) → verify they FAIL
2. Implement fix (T_impl) → verify tests now PASS
3. Run quality loop → confirm no regressions

---

## Parallel Opportunities

**All stories are fully parallelisable** after Phase 1. Example parallel execution for two developers:

```
Dev A:  T002 → T003 → T004 → T005 → T006 → T007  (US1)
        T008 → T009 → T010 → T011 → T012           (US2)

Dev B:  T013 → T014 → T015                         (US3)
        T027 → T028 → T029                         (US7)
        T016 → T017 → T018 → T019 → T020 → T021 → T022  (US4)
```

---

## Implementation Strategy

### MVP First (US1 + US2 — P1 stories only)

1. Complete Phase 1: baseline check
2. Complete Phase 2 (US1): hyperlink buttons — most user-visible improvement
3. Complete Phase 3 (US2): numeric-only input — unblocks accurate data entry
4. **STOP and VALIDATE**: verify both P1 fixes work in the browser
5. Continue to P2 stories

### Incremental Delivery

1. Baseline → US1 → US2 → validate P1 done
2. US3 → US4 → US5 → validate P2 done
3. US6 → US7 → validate P3 done
4. Phase N: final quality gate + smoke test

---

## Notes

- [P] tasks touch different files — safe to run in parallel
- US3 and US7 both modify `AppShell.tsx` — coordinate if worked simultaneously; T014 (scroll lock) and T028 (dropdown placement) are non-overlapping changes within the file
- US5 (constitution amendment) has no tests; it is a documentation-only change
- Quality loop (`pnpm lint && pnpm typecheck && pnpm test`) is run at the end of each story phase; a final run at Phase N confirms full integration
- The i18n fix (US4) resolves a pre-existing constitution violation — prioritise it even if delivering P2 stories last
