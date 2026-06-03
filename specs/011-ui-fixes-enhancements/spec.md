# Feature Specification: UI Fixes and Enhancements

**Feature Branch**: `011-ui-fixes-enhancements`

**Created**: 2026-06-03

**Status**: Draft

**Input**: GitHub issue #28 — Prioritized enhancements and fixes

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Entity Pages in New Tab (Priority: P1)

When the user clicks "View" or "Edit" on a list row that navigates to a separate page (not a modal), they can right-click or middle-click to open the destination in a new browser tab, the same way any standard hyperlink works.

**Why this priority**: Navigating to a detail page and losing the list context is a daily friction point. Hyperlinking these buttons restores standard browser navigation affordances and has the broadest impact across all entity list pages.

**Independent Test**: Navigate to any entity list page. Right-click the "View" or "Edit" button for a row. A browser context menu should appear with "Open in new tab". Clicking that option opens the entity detail/edit page in a new tab. The list page remains open.

**Acceptance Scenarios**:

1. **Given** a list page with a "View" button that navigates to a detail page, **When** the user right-clicks it, **Then** the browser context menu includes "Open in new tab" and middle-clicking opens the page in a new tab.
2. **Given** a list page with an "Edit" button that navigates to an edit page, **When** the user middle-clicks it, **Then** the edit page opens in a new tab.
3. **Given** a "View" or "Edit" button that opens a modal (not a page), **When** the user right-clicks it, **Then** the browser context menu does not offer "Open in new tab" (modal triggers are not links).

---

### User Story 2 - Balance Sheet Amount Input Usability (Priority: P1)

When a user creates or edits a balance sheet entry, the amount field accepts only numeric input and starts empty, so they can type the amount immediately without clearing a default value or fighting an input method conflict.

**Why this priority**: The current state (default "0" and Chinese IME interference) directly breaks data entry for users with non-Latin keyboards. Correcting this removes a blocker for accurate financial record creation.

**Independent Test**: Open the balance sheet creation form. Verify the amount field is empty by default. Attempt to enter text via a Chinese IME — no characters should appear in the field. Enter numeric digits — they should appear correctly.

**Acceptance Scenarios**:

1. **Given** the balance sheet creation form, **When** it opens, **Then** the amount field is empty (not pre-filled with "0").
2. **Given** the amount field, **When** the user types non-numeric characters (including via IME), **Then** those characters are rejected and do not appear in the field.
3. **Given** the amount field, **When** the user types numeric digits or a decimal point, **Then** the characters appear correctly.
4. **Given** the balance sheet edit form, **When** it opens with an existing entry, **Then** the amount field shows the existing numeric value and the same input restrictions apply.

---

### User Story 3 - Side Menu Expands Without Background Scroll (Priority: P2)

When the side navigation menu is expanded, the main page content behind it cannot be scrolled, preventing the user from accidentally scrolling away from their position.

**Why this priority**: Background scroll while a menu overlay is open is a well-known UX bug. It is disorienting and can cause unintended context loss.

**Independent Test**: Scroll a long page partway down. Expand the side menu. Attempt to scroll (mouse wheel or touch). The page behind the menu must not move. Close the menu — the scroll position should be unchanged.

**Acceptance Scenarios**:

1. **Given** the side menu is collapsed and the page is scrollable, **When** the user expands the side menu, **Then** the background page becomes non-scrollable.
2. **Given** the side menu is expanded and the page is locked, **When** the user collapses the side menu, **Then** the page is scrollable again and the scroll position is preserved.

---

### User Story 4 - Balance Sheet Aggregation Tabs Displayed in Current Language (Priority: P2)

The aggregation card tabs on the balance sheet list page and balance sheet detail page display labels in the user's selected interface language, not a hardcoded fallback language.

**Why this priority**: Inconsistent language in a single screen breaks trust in the UI and affects readability for non-English users.

**Independent Test**: Switch the interface language to a non-English locale. Navigate to the balance sheet list page. Verify that the aggregation card tab labels match the active locale. Repeat on the balance sheet detail page.

**Acceptance Scenarios**:

1. **Given** the interface is set to a non-English language, **When** the user views the balance sheet list page, **Then** all aggregation card tab labels appear in the active language.
2. **Given** the interface is set to a non-English language, **When** the user views the balance sheet detail page, **Then** all aggregation card tab labels appear in the active language.
3. **Given** the interface language is changed while the page is open, **When** the language switch takes effect, **Then** the aggregation card tab labels update to the new language without requiring a page reload.

---

### User Story 5 - Confirm Before Deletion (Priority: P2)

Before any destructive delete action completes, the user sees a confirmation prompt that requires explicit approval. Accidental clicks on delete controls do not immediately remove data.

**Why this priority**: Irreversible data loss from accidental clicks is a safety concern with outsized impact. A confirmation gate is a standard safeguard that should apply globally, not per-entity.

**Independent Test**: Click any delete button or action across any entity list or detail page. A confirmation dialog or prompt must appear. Clicking "Cancel" aborts the deletion. Clicking "Confirm" proceeds with the deletion.

**Acceptance Scenarios**:

1. **Given** a user clicks any delete action, **When** the click is registered, **Then** a confirmation prompt appears before any data is removed.
2. **Given** the confirmation prompt is shown, **When** the user selects "Cancel", **Then** no deletion occurs and the data remains intact.
3. **Given** the confirmation prompt is shown, **When** the user selects "Confirm", **Then** the item is deleted and the UI reflects the updated state.

---

### User Story 6 - No Redundant Tooltips on Fully Visible Content (Priority: P3)

When an element already displays its full content (text is not truncated), no tooltip appears on hover. Tooltips appear only when content is truncated or otherwise not fully visible, such as clipped datetime values.

**Why this priority**: Unnecessary tooltips add visual noise and slow down scanning. Removing them when they add no information improves UI clarity with minimal effort.

**Independent Test**: Hover over a datetime element that displays the full date/time string. No tooltip should appear. Truncate the same element (e.g., in a narrow column) and hover — a tooltip with the full value should appear.

**Acceptance Scenarios**:

1. **Given** a UI element whose full text is visible without truncation, **When** the user hovers over it, **Then** no tooltip appears.
2. **Given** a UI element whose text is truncated (e.g., clipped in a narrow column), **When** the user hovers over it, **Then** a tooltip showing the full text appears.

---

### User Story 7 - User Dropdown Menu Right-Aligned in Site Header (Priority: P3)

The user dropdown menu in the site header opens aligned to its right edge, so it does not overflow the visible viewport on the right side.

**Why this priority**: A misaligned dropdown that clips or overflows the viewport is a visual defect. It affects every authenticated page but is cosmetic rather than functional.

**Independent Test**: Open the site header user dropdown on a standard viewport. The menu should open below the avatar/name and align to the right edge of the trigger button, staying fully within the viewport.

**Acceptance Scenarios**:

1. **Given** the user is on any authenticated page, **When** they click the user menu in the site header, **Then** the dropdown opens right-aligned to the trigger button.
2. **Given** a narrow viewport, **When** the user opens the dropdown, **Then** the menu remains fully visible within the viewport without horizontal overflow.

---

### Edge Cases

- What happens when a delete confirmation is dismissed and the user immediately clicks delete again? The confirmation must re-appear.
- How does the amount input behave when the user pastes text containing non-numeric characters? Non-numeric content must be stripped or rejected.
- When the side menu is open and the user resizes the viewport, does the scroll lock persist correctly?
- If a "View" link and a modal-trigger "Edit" button coexist on the same row, only the navigating action should be a hyperlink.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every "View" and "Edit" control that navigates to a separate page MUST be rendered as a hyperlink so standard browser navigation (new tab, back button) works as expected.
- **FR-002**: Every "View" and "Edit" control that opens a modal MUST remain a button (not a hyperlink) to avoid browser navigation side-effects.
- **FR-003**: The balance sheet amount field MUST be empty by default when creating a new entry.
- **FR-004**: The balance sheet amount field MUST reject non-numeric input, including characters entered via IME composing.
- **FR-005**: When the side navigation menu is in an expanded/open state, the underlying page content MUST be non-scrollable.
- **FR-006**: When the side navigation menu is closed, page scroll MUST be restored to the position it was at before the menu opened.
- **FR-007**: All aggregation card tab labels on the balance sheet list page MUST use the active interface locale.
- **FR-008**: All aggregation card tab labels on the balance sheet detail page MUST use the active interface locale.
- **FR-009**: Every destructive delete action across the application MUST display a confirmation prompt before proceeding.
- **FR-010**: Dismissing a delete confirmation prompt MUST leave the target data unchanged.
- **FR-011**: A tooltip MUST NOT appear on an element whose full content is already visible to the user.
- **FR-012**: A tooltip MUST appear on an element whose content is truncated or not fully visible (e.g., clipped datetime in a narrow column).
- **FR-013**: The user dropdown menu in the site header MUST open right-aligned to its trigger control.
- **FR-014**: The user dropdown menu MUST remain fully within the visible viewport when opened.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of navigating "View"/"Edit" controls across all entity list pages support opening in a new browser tab via right-click or middle-click.
- **SC-002**: The balance sheet amount field passes a numeric-only input test and starts empty on every new entry form.
- **SC-003**: Zero unintended page scrolls occur in a test session where the side menu is opened and closed 10 times while the page is scrolled.
- **SC-004**: All aggregation card tab labels on the balance sheet list and detail pages display correctly in at least two languages (English and Chinese).
- **SC-005**: 100% of delete actions across the application require confirmation before data is removed.
- **SC-006**: No tooltips appear on fully visible text elements in a manual hover test across representative pages.
- **SC-007**: The user dropdown menu does not overflow the viewport on screen widths from 1024 px to 2560 px.

## Assumptions

- "View" and "Edit" buttons that open modals are distinguishable from those that navigate pages — a consistent convention already exists or will be established in this work.
- The balance sheet amount field is a standalone numeric input, not an embedded spreadsheet cell with complex formula support.
- The side menu is an overlay-style drawer; "expands" means it overlays the content rather than pushing it aside.
- The confirmation prompt for deletion is a simple modal dialog (not an inline text confirmation) consistent with Ant Design patterns already used in the project.
- The aggregation card tabs are the only i18n gap in the balance sheet screens; other labels on those pages are already localised.
- The tooltip suppression rule applies to all tooltip-enabled elements across the application, not only datetimes — the datetime example in the issue is illustrative.
- The right-alignment fix for the user dropdown is purely visual positioning; no change to menu content or behaviour is required.
