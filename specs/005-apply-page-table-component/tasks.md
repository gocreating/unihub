# Tasks: Apply PageTable Component

**Input**: Design documents from `specs/005-apply-page-table-component/`

**References**: [plan.md](plan.md) | [spec.md](spec.md) | [research.md](research.md) | [test-plan.md](test-plan.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared state)
- **[Story]**: User story label (US1–US4 map to spec.md priorities P1–P4)

---

## Phase 1: Setup — Test Infrastructure

**Purpose**: Extend the test setup so hooks that use `ResizeObserver` and `MutationObserver` can be tested in jsdom.

- [x] T001 Extend `apps/unihub/frontend/src/test-setup.ts` to add a global `ResizeObserver` mock (stores callbacks, exposes `observe`/`disconnect`/`trigger` methods)
- [x] T002 Verify `@testing-library/react` and `@testing-library/jest-dom` are available — confirm in `apps/unihub/frontend/package.json`

**Checkpoint**: `pnpm test` runs without crashing on any file that uses `ResizeObserver`.

---

## Phase 2: Foundational — PageTable Component Parity

**Purpose**: Bring `PageTable/index.tsx` to 100% parity with ov-fleet before writing tests or touching page files.

⚠️ **CRITICAL**: Tests written in Phase 3 target the corrected component. Do these fixes first.

- [x] T003 Add three missing CSS rules to `stickyToolbar` block in `apps/unihub/frontend/src/components/PageTable/index.tsx`:
  - `.ant-pro-table-list-toolbar-container-mobile` → `flexDirection: 'row !important'`, `flexWrap: 'nowrap !important'`, `gap`, `overflowX: 'auto'`
  - `& .ant-pro-table-list-toolbar-right .ant-space` → `gap`, `flexWrap: 'nowrap !important'`
  - `@media (max-width: ${token.screenLG}px)` → `.toolbar-label { display: none }` (copy exactly from ov-fleet)
- [x] T004 Remove `options` from `PageTableProps` interface in `apps/unihub/frontend/src/components/PageTable/index.tsx` so the type matches ov-fleet exactly: `Omit<ProTableProps<T, Record<string, any>>, 'search' | 'options' | 'className'>` — the component already hardcodes `options={false}` internally

**Checkpoint**: `pnpm typecheck` passes. No page passes `options` prop, so removing from the type causes no errors.

---

## Phase 3: Comprehensive Tests (FR-008)

**Purpose**: Write all behavioral tests specified in `test-plan.md` before touching Finance pages.

**Test runner**: Vitest + `@testing-library/react` + jsdom. Use `renderHook` for hook tests. Mock `ResizeObserver` via the global mock from T001. Mock `Object.defineProperty` for layout properties (`scrollWidth`, `clientWidth`, `offsetHeight`) where jsdom returns 0.

### T005–T017: `utils.test.ts` — Extend to 100% coverage

- [x] T005 Add test U-04 to `apps/unihub/frontend/src/components/PageTable/utils.test.ts`: `widthForHeader('A', 0)` → `{ width: 52 }` (floor=0 means no floor)
- [x] T006 Add test U-13: `computeScrollX([{width: 100}], 50)` → `100` (single column, custom fallback not used)

### T007–T012: `useStickyHeaderOffset.test.ts` — New file

- [x] T007 Create `apps/unihub/frontend/src/components/PageTable/useStickyHeaderOffset.test.ts`
- [x] T008 [P] Implement H-01: initial state returns `toolbarTop=56`, `offsetHeader=56` before any DOM is present
- [x] T009 [P] Implement H-02: site header `offsetHeight=72`, no toolbar → `toolbarTop=72`, `offsetHeader=72`
- [x] T010 [P] Implement H-03: site header=72 + toolbar `offsetHeight=48` → `toolbarTop=72`, `offsetHeader=120`
- [x] T011 [P] Implement H-04: no `.ant-layout-header` or `header` element → fallback `toolbarTop=56`
- [x] T012 [P] Implement H-05 + H-06: ResizeObserver triggers update on header resize; observer disconnected on unmount

### T013–T026: `PageTable.test.tsx` — New file

- [x] T013 Create `apps/unihub/frontend/src/components/PageTable/PageTable.test.tsx` with necessary imports and a minimal `renderPageTable` helper
- [x] T014 [P] Implement F-01 + F-02: render PageTable → `data-sticky-fix` attribute on `document.documentElement` and `<style data-sticky-fix>` in `document.head`
- [x] T015 [P] Implement F-03 + F-04: injected style contains `height:auto!important` and `overflow:visible!important` rules
- [x] T016 [P] Implement F-05 + F-06: unmount removes `data-sticky-fix` attribute and style tag
- [x] T017 [P] Implement P-01 + P-02 + P-03: renders `pageTitle`, renders `action`, renders without action when omitted
- [x] T018 [P] Implement P-04 + P-05 + P-06: `stickyToolbar` class present iff `headerTitle` or `toolBarRender` provided
- [x] T019 [P] Implement P-07 + P-08: `contentVisibility` class applied/not-applied based on prop
- [x] T020 [P] Implement P-09 + P-10: `pagination={false}` default; custom pagination passed through
- [x] T021 [P] Implement P-11 + P-12: ProTable always receives `search={false}` and `options={false}`
- [x] T022 Implement S-01: mock `body.scrollWidth > body.clientWidth` → `div[data-custom-scrollbar]` inserted in DOM
- [x] T023 Implement S-02: `scrollWidth <= clientWidth` → scrollbar `display: none`
- [x] T024 Implement S-05: `.ant-table-sticky-scroll` present → its `display` forced to `none`
- [x] T025 Implement S-06: spacer `style.width` equals `body.scrollWidth`
- [x] T026 Implement S-10 + S-11: unmount removes scrollbar div and cleans up scroll event listeners

**Checkpoint**: `pnpm test` is green. All new tests pass. Zero tests skipped due to jsdom limitations should be explicitly marked `.skip` with a comment.

---

## Phase 4: US1 + US3 — Header Alignment & Auto-fit Column Widths

**Goal (US1)**: Sticky header stays horizontally aligned with body during horizontal scroll.
**Goal (US3)**: No cell content is truncated; column widths account for data values.

**Root cause fix**: Add the `dataWidths` `useMemo` pattern from ov-fleet to every Finance page. Pattern: iterate data rows, compute `Math.max(measureTextWidth(value, extraPx))` per column, then `column.width = Math.max(widthForHeader(title).width, dataWidth)`. Recompute `scroll.x = computeScrollX(updatedColumns)`.

**Independent Test**: Open any Finance page, scroll horizontally — header stays aligned with body. No cell value is truncated. Resize browser to narrow width → horizontal scrollbar appears.

- [x] T027 [US1] [US3] Add `dataWidths` `useMemo` to `apps/unihub/frontend/src/pages/finance/currencies/index.tsx` — measure max content width for each column (code, name) across currency rows; rebuild `columns` with widened widths; recompute `scroll.x`
- [x] T028 [P] [US1] [US3] Add `dataWidths` `useMemo` to `apps/unihub/frontend/src/pages/finance/accounts/index.tsx` — measure name, currency, balance, created_at columns across account rows
- [x] T029 [P] [US1] [US3] Add `dataWidths` `useMemo` to `apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx` — measure from_currency, to_currency, rate, date columns across exchange rate rows
- [x] T030 [P] [US1] [US3] Add `dataWidths` `useMemo` to `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` — measure date, notes columns across balance sheet rows
- [x] T031 [P] [US1] [US3] Add `dataWidths` `useMemo` to `apps/unihub/frontend/src/pages/finance/balance-sheets/new.tsx` — measure account, currency, amount columns
- [x] T032 [P] [US1] [US3] Add `dataWidths` `useMemo` to `apps/unihub/frontend/src/pages/finance/balance-sheets/edit.tsx` — measure account, currency, amount columns
- [x] T033 [US1] [US3] Add `dataWidths` `useMemo` to `apps/unihub/frontend/src/pages/finance/balance-sheets/detail.tsx` — measure account_name, currency, amount columns

**Checkpoint**: Open any Finance page with real data. Scroll horizontally — header stays perfectly aligned. All cell values fully visible without truncation. `pnpm typecheck && pnpm lint` passes.

---

## Phase 5: US1 + FR-007 — Sticky Footer (Net Worth)

**Goal (US1/FR-007)**: The balance-sheets detail page shows net worth as a sticky footer row at the bottom of the table, not as Cards above it.

**Independent Test**: Open `/finance/balance-sheets/<id>` — net worth totals appear as a sticky footer inside the PageTable white card. Scroll down through balance rows — the footer stays visible at the bottom of the viewport.

- [x] T034 [US1] In `apps/unihub/frontend/src/pages/finance/balance-sheets/detail.tsx`:
  - Remove the `Row/Col/Card/Statistic` block rendered above `<PageTable>` (lines 64–80)
  - Add a `NetWorthFooter` inline sub-component that renders `netWorth.per_currency` entries as a compact `Flex` row using `Statistic size="small"` with `prefix={entry.currency}`
  - Add `footer={() => netWorth?.per_currency.length ? <NetWorthFooter netWorth={netWorth} /> : null}` prop to `<PageTable>`
  - Remove `Spin`, `Row`, `Col`, `Card`, `Statistic` from imports if no longer used elsewhere in the file
- [x] T035 Add i18n key `pages.finance.balanceSheets.detail.footer.netWorth` to `apps/unihub/frontend/src/locales/en-US/pages.ts` → value: `"Net Worth"`
- [x] T036 [P] Add i18n key `pages.finance.balanceSheets.detail.footer.netWorth` to `apps/unihub/frontend/src/locales/zh-TW/pages.ts` → value: `"淨資產"`

**Checkpoint**: Open balance-sheets detail with data. Net worth footer is inside the table card at the bottom. Scroll down — it stays sticky. No Statistic cards appear above the table. `pnpm typecheck && pnpm lint` passes.

---

## Phase 6: US2 + US4 — Scrollbar & Pinned Columns Verification

**Goal (US2)**: Confirm sticky horizontal scrollbar works end-to-end after the dataWidths fix.
**Goal (US4)**: Confirm pinned columns remain aligned after the dataWidths fix.

These are verification tasks. No new code is expected — the `dataWidths` fix in Phase 4 is the implementation. These tasks confirm correct behavior.

- [ ] T037 [US2] Manual browser check: open `apps/unihub/frontend` dev server, navigate to a wide Finance page (exchange-rates or accounts), narrow browser viewport → confirm custom sticky scrollbar appears at bottom. Confirm dragging it scrolls the table body. Confirm rc-table's built-in sticky scrollbar is hidden. Fix any issues found.
- [ ] T038 [US4] Manual browser check: if any Finance page has columns with `fixed: 'left'`, scroll horizontally → confirm pinned column stays left-aligned with its header. If no column currently uses `fixed: 'left'`, add one temporarily to test (e.g., account name in accounts page), verify behavior, then revert. Fix any issues found.

**Checkpoint**: Scrollbar and pinned column behaviors verified in browser.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Exclusion comment, quality loop, and final manual verification checklist.

- [x] T039 Add an exclusion comment to the top of `apps/unihub/frontend/src/components/ImportExport/ChangePreviewTable.tsx` explaining why it intentionally uses `antd/Table` (not PageTable): sub-component in panel context, not a page, sticky behaviors require document as scroll container which conflicts with panel parent, small datasets
- [x] T040 Run full quality loop from `apps/unihub/frontend/`: `pnpm lint` → zero warnings; `pnpm typecheck` → zero errors; `pnpm test` → all tests pass. Fix any issues found before marking complete.
- [ ] T041 Manual browser verification checklist (follow `quickstart.md`):
  - [ ] Open each Finance page — no cell content is truncated
  - [ ] Horizontal scroll on a wide page — sticky header stays aligned
  - [ ] Custom sticky scrollbar visible and functional
  - [ ] Balance-sheets detail — net worth footer sticky at bottom
  - [ ] Toolbar layout at `<1024px` viewport — no stacking or wrapping

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)           → no dependencies
Phase 2 (Foundational)    → Phase 1
Phase 3 (Tests)           → Phase 2 (tests target corrected component)
Phase 4 (US1+US3)         → Phase 2 (page changes rely on correct PageTable)
Phase 5 (US1+FR-007)      → Phase 4 (detail.tsx is also touched in Phase 4)
Phase 6 (US2+US4)         → Phase 4 (verification after dataWidths fix)
Phase 7 (Polish)          → Phases 3, 4, 5, 6
```

### User Story to Task Mapping

| Story | Priority | Tasks |
|-------|----------|-------|
| US1 (Sticky Header) | P1 | T003, T004, T027–T034 |
| US2 (Sticky Scrollbar) | P2 | T022–T026, T037 |
| US3 (Auto-fit Widths) | P3 | T027–T033 (same as US1 — shared root cause) |
| US4 (Pinned Columns) | P4 | T038 |
| FR-007 (Footer) | — | T034–T036 |
| FR-008 (Tests) | — | T001–T002, T005–T026 |
| FR-009 (CSS parity) | — | T003 |

### Parallel Opportunities Within Phase 4

Tasks T028–T032 all modify **different files** with no dependencies on each other. They can run in parallel once T027 (currencies) is complete and used as the reference implementation:

```bash
# After T027 establishes the dataWidths pattern in currencies/index.tsx:
T028  apps/unihub/frontend/src/pages/finance/accounts/index.tsx
T029  apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx
T030  apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx
T031  apps/unihub/frontend/src/pages/finance/balance-sheets/new.tsx
T032  apps/unihub/frontend/src/pages/finance/balance-sheets/edit.tsx
```

---

## Implementation Strategy

### MVP First

1. Phase 1: Setup (T001–T002)
2. Phase 2: Fix PageTable component (T003–T004)
3. Phase 4: Apply dataWidths to currencies page only (T027) as proof-of-concept
4. **STOP**: Open currencies page in browser, verify no truncation, verify header alignment
5. If validated: roll out to remaining pages (T028–T033)

### Incremental Delivery

1. Complete Phases 1–2 → corrected PageTable
2. Complete Phase 3 → full test coverage locked in
3. Complete Phase 4 → both main bugs fixed across all pages
4. Complete Phase 5 → sticky footer live on balance-sheets detail
5. Complete Phases 6–7 → fully verified and polished

### Notes

- Run `pnpm typecheck && pnpm lint` after every phase
- T027 (currencies page) is the reference implementation for the `dataWidths` pattern — complete it first, validate in the browser, then apply the same pattern to T028–T033
- Tests in Phase 3 that cannot be satisfied by jsdom (layout measurements) must be marked `.skip` with a comment explaining the limitation — do not leave broken tests
