<!--
SYNC IMPACT REPORT
==================
Version change: 1.16.0 → 1.17.0 (minor — Principle I (Entity-Centric Domain
  Architecture) gains a non-negotiable "Data-portability (data_io) consistency"
  rule: every concrete domain model MUST register a data_io TableDescriptor in its
  AppConfig.ready(), and every schema change MUST keep the domain consistent with
  data_io in the same change; registry-unrepresentable relations (e.g. M2M) MUST be
  explicitly recorded as deferred. Sourced from discovering the inventory app had
  never been registered with data_io, 2026-07-11.)
Modified principles:
  - I. Entity-Centric Domain Architecture — added the data_io registration +
    schema-consistency rule; rationale extended
Added sections: none (bullet added within Principle I; Domain Addition Protocol
  step referencing it)
Removed sections: none
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ No changes needed (Constitution Check is
    generic and already gates all principles)
  - .specify/templates/spec-template.md ✅ No changes needed
  - .specify/templates/tasks-template.md ✅ No changes needed
Follow-up TODOs: Register the inventory tables with data_io (this iteration:
  acquisition/item/costfactor/scenario/scenarioitem; Constraint deferred — M2M).
  Audit other domains for any unregistered concrete models.
-->

# UniHub Constitution

## Core Principles

### I. Entity-Centric Domain Architecture (NON-NEGOTIABLE)

Every domain in UniHub MUST be built around entities managed through the shared
entity/attribute infrastructure. This principle is non-negotiable and applies to
all domains — current and future.

- All domain entities MUST be created, read, updated, and deleted through the
  shared entity management mechanism (AttributeDefinition + AttributeValue model).
- All attributes — whether system-defined (built-in, `is_system=True`) or
  user-defined (created at runtime) — MUST share a single `AttributeDefinition`
  model. No domain may maintain a parallel or alternative attribute storage system.
- System attributes are protected (cannot be deleted or renamed by the user) but
  MUST flow through the same rendering, filtering, and storage path as user-defined
  attributes.
- Deleting a user-defined AttributeDefinition that has existing values MUST
  display a confirmation warning showing the count of affected entities; upon
  confirmation, all associated AttributeValues are permanently removed.
- **Data-portability (`data_io`) consistency**: Every concrete domain model MUST
  be registered with the shared **`data_io`** import/export registry — a
  `TableDescriptor` declared in the domain's `AppConfig.ready()` (with
  `fk_content_type_label` overrides for every foreign key and an `import_order`
  that writes parents before children) — so all domain data participates in the
  standard CSV backup / restore / change-preview flow. **Any schema change MUST
  keep the domain consistent with `data_io` in the same change**: a new model MUST
  add its `TableDescriptor`; adding, removing, or renaming a field MUST update that
  descriptor. A relation the registry cannot yet represent (e.g. a many-to-many)
  MUST be **explicitly recorded as deferred**, never silently omitted.

**Rationale**: The shared entity/attribute infrastructure is the central value
proposition of UniHub. Bypassing it — even for convenience — fragments the
codebase and breaks the domain-agnostic guarantees that enable new domains to be
added cheaply.

### II. Domain Independence

Each life domain MUST be implemented as a standalone, independently deployable
unit. No domain may import or depend on another domain's internal code.

- Each domain lives in its own Django app under `apps/unihub/backend/`.
- Adding a new domain MUST require no changes to any existing domain's code.
- Domains share infrastructure (entity model, auth, DB) but MUST NOT share
  business logic, models, or serializers across domain boundaries.
- The v1 MVP ships the Finance domain only. All subsequent domains MUST follow
  the same implementation pattern established by Finance.

**Rationale**: Domain independence enables the hub to grow incrementally. Each
domain can be tuned, refactored, or replaced without touching the others.

### III. Reference Implementation Alignment

UniHub MUST follow the architectural patterns established in the ov-fleet
reference implementation for backend layout, service layer, and frontend
organization.

- Backend: Django + DRF, session-based auth, DRF permission classes, OpenAPI
  schema at `/api/docs/` via drf-spectacular, `httpx` for HTTP client calls,
  `uv` for dependency management, `ruff` for linting, `pytest-django` for tests.
- Frontend: React + Ant Design 5 + Pro Components, TanStack React Query for
  data fetching, dashboard layout matching ov-pro-tools (fixed sidebar,
  top header, content area), `pnpm` as package manager, `ESLint` for linting,
  `Vitest` for tests.
- Deviations from ov-fleet patterns MUST be documented in CLAUDE.md with
  explicit rationale before implementation.

**Rationale**: The reference implementation represents proven patterns for this
stack. Alignment reduces decision fatigue, eases onboarding, and keeps the
codebase predictable.

### IV. API Contract-Driven Frontend

The frontend MUST consume typed API responses generated from the backend's
OpenAPI schema. Hand-written API response types are prohibited.

- The backend MUST expose an OpenAPI schema that is always in sync with the
  actual API (auto-generated by drf-spectacular).
- All frontend service layer types MUST be generated from `openapi.yaml` via
  `openapi-typescript`. No exceptions.
- Any change to a backend serializer or viewset MUST trigger schema regeneration
  before the corresponding frontend code is written or updated.

**Rationale**: Auto-generated types are the single source of truth for the
frontend/backend contract. They prevent type drift and eliminate a class of
integration bugs entirely.

### V. Quality Loop Enforcement

Every change MUST pass the project quality loop before being considered complete.
No exceptions for "quick fixes" or "trivial changes."

**Frontend** (run from `apps/unihub/frontend/`):

```bash
pnpm lint       # ESLint — MUST produce zero warnings
pnpm typecheck  # tsc --noEmit strict
pnpm test       # Vitest
```

**Backend** (run from `apps/unihub/backend/`):

```bash
uv run ruff format .
uv run ruff check . --fix
uv run pytest
```

**TypeScript rules (non-negotiable)**:
- `strict: true` MUST remain enabled in `tsconfig.json`. No exceptions.
- `@ts-ignore` and `// @ts-nocheck` suppressions are a constitution violation.
- No `any` type except where provably unavoidable and explicitly documented.
- ESLint MUST report zero warnings — treat warnings as errors.

**Test-first development (backend)**:
- Tests MUST be written before implementation and MUST fail before the
  implementation is written (red-green-refactor).
- Test naming convention: `test_<function>_<scenario>` (e.g.,
  `test_create_account_missing_currency`).
- All new backend endpoints MUST have at least one `pytest-django` integration
  test covering the happy path and at least one error path.
- Mock external dependencies (HTTP service calls, third-party APIs), not
  internal Django/DRF logic.

**Backend code style (from ov-fleet)**:
- Type hints MUST appear on all function signatures (parameters and return type).
- Docstrings MUST be provided on all public functions and classes; use Google
  style (`Args:`, `Returns:`, `Raises:`).
- Use f-strings for all string formatting; no `%` formatting or `.format()`.
- Raise specific exceptions with descriptive messages; bare `except:` clauses
  are prohibited.
- Use context managers (`with`) for all resource cleanup (files, DB connections,
  locks).

**Rationale**: The quality loop is the minimum bar for correctness. The
test-first discipline (from ov-fleet) prevents regressions and forces
requirements to be understood before code is written.

### VI. UI/UX Reference: ov-fleet

For any UI, UX, interaction, or visual detail that is not explicitly specified in
a feature spec or this constitution, the ov-fleet application at
`/home/cp/projects/OverviewCorporation/overview-pro-tools` is the authoritative
reference implementation to follow.

- Layout, spacing, component choice, interaction patterns, and visual hierarchy
  MUST default to ov-fleet's implementation unless explicitly overridden.
- The side navigation MUST follow ov-fleet's style: collapsible sections with
  icons on level 1, text-only (no icons) on level 2.
- The site branding (logo + title) MUST be clickable and navigate to the home
  page (`/`).
- The header MUST include a language selector (translate icon, top-right)
  supporting: English (`en-US`) and Traditional Chinese (`zh-TW`). Language
  preference MUST persist across sessions via `localStorage`.
- The language selector trigger MUST use the Material Design "translate" SVG
  icon (not any `@ant-design/icons` component). Dropdown options MUST display
  emoji country flags alongside the locale name.
- Locale switching MUST update Ant Design component strings via `ConfigProvider`
  AND update the dayjs global locale via `dayjs.locale()` so that relative-time
  strings (e.g. `fromNow()`) are rendered in the active language. The dayjs
  locale file for each supported locale MUST be imported at app entry.
- **Datetime display**: Every datetime value rendered in a table cell, detail
  view, or card MUST display both the absolute timestamp and the relative time.
  The canonical format is `YYYY-MM-DD HH:mm (X days ago)` — implemented with
  `dayjs(val).format('YYYY-MM-DD HH:mm')` and `dayjs(val).fromNow()` (requires
  `dayjs/plugin/relativeTime` registered at app entry via `dayjs.extend(relativeTime)`).
  When space is constrained, the relative time MAY be placed in an Ant Design
  `<Tooltip>` on hover, but MUST NOT be omitted entirely.
- **Empty cell display**: Every table cell or detail-view field whose value is
  absent (null, undefined, or empty string) MUST display a visually distinct
  placeholder rather than leaving the cell blank or rendering raw `null`. The
  canonical implementation is:
  `<Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>`.
  Two requirements are non-negotiable: (1) the placeholder MUST be styled with a
  muted/disabled color (`type="secondary"`) to distinguish it from real data, and
  (2) it MUST be non-selectable (`userSelect: 'none'`) so users cannot accidentally
  copy it and to signal that the absence is intentional, not an error. Rendering
  nothing, a blank string, or the literal string `"null"` or `"undefined"` is a
  constitution violation.
- **Foreign-key value display**: Any table cell or detail-view field that renders
  a value sourced from a related/foreign record (e.g., a currency code that
  resolves to a Currency entity, a category resolved from a Categories table)
  MUST be wrapped in Ant Design `<Tag>` to visually distinguish it from
  free-form text fields. No additional color or styling is required beyond the
  default `<Tag>` appearance; the goal is to make relational references
  scannable at a glance. Example: currency columns in the Finance Exchange Rates
  page MUST render `<Tag>{currency}</Tag>` rather than a plain string.
- **Standalone-page navigation (no Cancel button)**: Full-page create, edit, and
  detail views (e.g. an entity create/edit page, a record detail page) MUST use a
  breadcrumb for navigation (parent → current) and MUST NOT render a Cancel button.
  The user abandons or leaves the page via the breadcrumb (or the browser back
  affordance), not a page-level Cancel control. A single primary action (e.g.
  Save / Create) is permitted; a redundant Cancel next to it is a violation.
- **Modal form controls**: Modal (dialog) forms are the exception — they MUST keep
  a Cancel button. **Footer action placement**: the **primary action** (e.g.
  Save / Create / OK) MUST be on the **right-hand side** of the footer, and **all
  other actions** (Cancel and any secondary/tertiary buttons) MUST be grouped on
  the **left-hand side**. Cancel remains the **left-most** control. A modal MUST NOT
  close on outside/overlay click (or `Esc`) while its form is **dirty** (has unsaved
  changes); it may close on outside click only when the form is pristine. This
  prevents accidental loss of in-progress input. On narrow screens, modal form
  fields MUST stack (single column) rather than overflow horizontally.
- **Form field layout (grid, responsive, right-aligned numbers)**: Every form —
  page-level or modal — MUST arrange its fields on a **grid** (Ant Design
  `Row`/`Col`), never as free-floating or fixed-pixel-width controls. Within a
  single row, **each field MUST stretch to fill its allotted column** and the
  fields together MUST fill the full row width (no dead horizontal space, no
  fixed-`px` field widths that leave gaps or overflow). The grid MUST be
  **responsive**: on a **narrow area the fields MUST stack to a single full-width
  column** so nothing overflows its row. Narrowness MUST be judged by the actual
  **content width** (e.g. a container-width hook / `ResizeObserver`), not the raw
  viewport, because a collapsed-sidebar-narrow content area must also stack —
  Ant Design `Col` `xs/sm` breakpoints follow the viewport and are therefore
  insufficient on their own. **Number inputs MUST right-align their content**
  (`InputNumber` with right-aligned text), not the default left alignment, so
  digits line up for scanning and comparison. These rules apply **immediately to
  all existing forms**, not only new ones, for a consistent experience.

**Rationale**: Maintaining a living reference implementation prevents UI drift
and reduces design decisions to a lookup rather than a debate. ov-fleet is
actively maintained on the same stack and represents the desired UX baseline.
Relative timestamps reduce cognitive load — users should never need to calculate
"how long ago" from a raw date string. Styled empty-cell placeholders prevent
layout collapse and signal intentional absence of data, reducing confusion when
users scan sparse tables. Tag-wrapped foreign-key values give users an instant
visual cue that the field is a reference to another record rather than arbitrary
text, improving scannability across data-dense tables. Removing the Cancel button
from full-page flows eliminates a redundant, ambiguous control (breadcrumb already
communicates "where back is"), while the dirty-guard on modals protects
in-progress work — the two surfaces differ because a modal overlays and can be
dismissed accidentally, whereas a page cannot. A consistent, gap-free responsive
form grid (with content-width stacking) removes a recurring class of layout bugs —
half-filled rows, fields that overflow on narrow content areas, and inconsistent
field widths between forms — and right-aligned number inputs make numeric columns
readable and comparable at a glance.

### VII. PageTable Layout — NON-NEGOTIABLE

Every page that displays tabular data MUST use `PageTable` and MUST follow
the exact layout structure below. No exceptions, no alternative wrappers.
This applies to ALL tabular views in the application — domain data pages
(Finance, Language, Music, People, Visiting, and any future domain) AND
system/utility pages (IO import-export preview, sync preview, and any future
system page that renders a table).

```
┌─ gray page background (ProLayout content area) ──────────────────────┐
│ ┌─ white container (pageCard) ───────────────────────────────────┐   │
│ │  Page Title                          [ Action Button ]         │   │
│ │─────────────────────────────────────────────────────────────── │   │
│ │  Toolbar (Filters · Sort · Column visibility · …)              │   │
│ │─────────────────────────────────────────────────────────────── │   │
│ │  ┌─ PageTable ───────────────────────────────────────────┐    │   │
│ │  │  sticky header · scrollable body · sticky footer      │    │   │
│ │  └───────────────────────────────────────────────────────┘    │   │
│ └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

**Rules (all MUST be followed):**

- The white container, title row, toolbar, and table are ALL rendered
  by `PageTable` — never duplicated or re-implemented in page components.
- Page title goes in `pageTitle` prop (left side of title row).
- The primary create/action button goes in `action` prop (right side of
  title row, inside the white container).
- Toolbar controls (filters, sort, column visibility) go in `headerTitle`
  and/or `toolBarRender` props — they render inside the same white container
  between the title row and the table.
- PageTable's inherited ProTable `search` prop MUST NOT be used. All search,
  filter, and sort interactions MUST be implemented as custom controls,
  either passed via `headerTitle`/`toolBarRender` props or rendered outside
  PageTable entirely. The built-in ProTable search form is permanently
  disabled/ignored across the entire application.
- Query load errors MUST be shown via `message.error()` (transient
  notification), called in a `useEffect` on `isError`. Persistent `<Alert>`
  elements rendered ABOVE or OUTSIDE `PageTable` are a constitution violation.
- Modals (create/edit forms) are rendered as React portals and do not affect
  the layout; they are acceptable siblings to `PageTable` in the page JSX.
- All column widths MUST use `widthForHeader()`, `measureTextWidth()`, and
  `computeScrollX()` exported from `PageTable`.
- The `PageTable` component lives at
  `apps/unihub/frontend/src/components/PageTable/`.

**Rationale**: This layout is the single most visible pattern in the product.
Every domain that adds a table page MUST land with exactly this structure —
the white card enclosing title + toolbar + table on a gray background. Any
deviation (Alert above the card, action button outside the card, table
without a white wrapper) produces an inconsistent UI that accumulates across
domains. This rule must be checked on every implementation plan and PR.

### VIII. Internationalisation (i18n) — NON-NEGOTIABLE

All user-facing text throughout the application MUST be internationalised.
Hardcoded strings in component files are a constitution violation.

**Supported locales (v1)**: English (`en-US`) and Traditional Chinese (`zh-TW`).
Both locales MUST be kept in sync — adding a key in one locale file without the
corresponding entry in the other is a violation.

**Mandatory rules**:

- Every user-facing string (labels, buttons, headings, messages, placeholders,
  tooltips, error text, success notifications) MUST be referenced via
  `useIntl().formatMessage({ id: '...' })` or the `<FormattedMessage>` component.
  No raw string literals in JSX. No `t('...')` pattern — use `formatMessage`.
- Message keys MUST follow the established namespace convention:
  - `menu.*` — navigation labels
  - `common.*` — cross-page reusable labels (e.g. `common.save`, `common.delete`)
  - `pages.<domain>.<feature>.*` — page-specific strings
- Locale files live at `apps/unihub/frontend/src/locales/en-US/` and
  `apps/unihub/frontend/src/locales/zh-TW/`, split into `menu.ts` and `pages.ts`.
- When a new component or page is added, ALL its user-facing strings MUST be
  added to both locale files in the same commit. No deferred i18n.
- `react-intl` is the ONLY permitted i18n library. Do not introduce alternatives.
- Navigation items MUST use `t({ id: 'menu.*' })` in `AppShell.tsx` — never
  hardcode nav labels directly in the route config.
- The language selector (Principle VI) and its `localStorage` persistence
  mechanism MUST remain operational. Any change to the locale switching path
  MUST be tested end-to-end.

**Backend**:
- API error messages that surface directly in the UI MUST either use locale-
  neutral codes the frontend translates, or be kept generic enough that the
  frontend can wrap them in a translated message. Raw Django validation errors
  SHOULD NOT appear directly as user-visible text without frontend translation.

**Rationale**: UniHub targets a multilingual user base (initial: en-US, zh-TW).
Internationalisation retrofitted after the fact is far more expensive than
building it in from the start. The `react-intl` library is already wired into
the app; the cost of using `formatMessage` over a hardcoded string is zero —
the benefit is a fully localisable product.

### IX. Base Currency Net Worth Valuation

In the Finance domain, individual currencies MAY be designated as eligible base
currencies for net worth valuation. When a base currency is selected in the
application context, all Finance pages that display monetary amounts MUST show
each amount's equivalent valuation in the selected base currency alongside the
original amount.

**Data model rule**:
- The `Currency` model MUST include a boolean field `is_base_currency` (default
  `False`). Only currencies with `is_base_currency=True` appear in the base
  currency selector. Backend serializers MUST expose this field; it MUST be
  included in the generated OpenAPI schema and frontend types.

**Selector rule**:
- Every Finance page that displays monetary amounts MUST render a base currency
  selector at the top of the page. The selector lists only currencies where
  `is_base_currency=True`. If no such currencies exist, the selector MUST be
  hidden and no net worth valuation column MUST be rendered.
- The selected base currency SHOULD persist across page navigations via
  `localStorage` (key: `finance.baseCurrency`) so the user does not need to
  reselect it on every visit.

**Valuation display rules**:
- When a base currency is selected, every table and card that shows a monetary
  amount MUST include an additional net worth valuation column/field showing the
  converted amount in the base currency.
- Conversion MUST use the most recent `ExchangeRate` record available for the
  currency pair (account currency → base currency). Rate lookup: find the record
  with `base_currency = account_currency` and `quote_currency = base_currency`
  (or the inverse and divide). Use the latest `date` among matching records.
- When no `ExchangeRate` record covers a given pair, the net worth valuation cell
  MUST display the standard empty-cell placeholder
  (`<Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>`)
  rather than crashing, hiding the column, or displaying a raw error.
- In tree-aggregated views, the tree root node MUST display the total net worth as
  the sum of all leaf-level converted amounts. Leaves with missing exchange rates
  contribute `0` to the root total; a note or tooltip SHOULD indicate that the
  total is partial when any rates are missing.
- Net worth valuation amounts MUST be formatted using `formatAmount()` (Principle V
  quality loop) and displayed with the base currency symbol prefix (via
  `getCurrencySymbol()`).

**Rationale**: The ability to view all balances through a single currency lens is
the core analytical value of a multi-currency personal finance tracker. Requiring
the valuation to appear alongside the original amount — rather than replacing it
— preserves full transparency. The empty-placeholder rule for missing exchange
rates prevents silent data loss and maintains UI consistency with Principle VI.
Persisting the base currency selection in `localStorage` eliminates repetitive
user interaction across page navigations.

### X. Chart Rendering

Every chart rendered in the application MUST be protected against layout distortion
on narrow screens. This applies to all chart components regardless of the charting
library in use.

**Minimum width rule**:
- Every chart MUST have a minimum intrinsic width of at least **600 px** (or a
  domain-appropriate wider value when the chart contains many series or axis
  labels). The minimum width MUST be enforced via inline style or a CSS class on
  the chart element — not by the parent container.

**Horizontal-scroll container rule**:
- The immediate container wrapping a chart MUST apply
  `overflow-x: auto` (or equivalent) so that when the viewport is narrower than
  the chart's minimum width, the chart remains fully accessible via horizontal
  scrolling rather than being clipped or squashed.
- The container MUST NOT apply `overflow: hidden` or any style that clips
  horizontal content.

**Implementation**:
- Wrap each chart in a `<div style={{ overflowX: 'auto' }}>` (or equivalent).
- On the chart element itself, apply `style={{ minWidth: N, width: '100%' }}`
  where `N` is the minimum width in pixels.
- The `width: '100%'` allows the chart to expand to fill available space when
  the container is wider than the minimum.

**Rationale**: Desktop-first layout (Constraint: mobile out of scope for v1) does
not mean narrow-screen resilience can be ignored. Sidebars, split panes, and
embedded panels can reduce effective chart width significantly. Without a minimum
width + scroll container, charts become unreadable — axis labels overlap, pie
segments shrink to invisible, and line charts collapse to meaningless blobs. A
horizontal scrollbar is a zero-cost, universally understood fallback that keeps
all chart information accessible.

### XI. Chart Library & Visualization Standards

All interactive charts in UniHub MUST use **ECharts** (via `echarts-for-react`) with the **SVG renderer**. No alternative charting library may be introduced.

**Library rule**:
- The installed packages are `echarts` and `echarts-for-react`. No `@ant-design/plots`, `recharts`, `victory`, or any other charting library is permitted.
- Charts MUST be rendered with `opts={{ renderer: 'svg' }}` on `<ReactECharts>`. The canvas renderer is prohibited.
- `notMerge={true}` MUST be used on charts that switch between different datasets or color schemes (e.g., tab switches). This prevents previous option state from bleeding into the new render.

**Visualization card layout rule**:
- Any page that includes both a chart section and a tabular data section MUST use AntD `Card` with `tabList` + `activeTabKey` + `onTabChange` for the chart card. The `Segmented` control inside a titled Card is deprecated.
- When a visualization card embeds a table (e.g., a Statistics / aggregation tab), the table MUST use `ProTable ghost` directly — NOT `PageTable`. Embedding `PageTable` inside an AntD `Card` body causes the inner ProCard's CSS to interfere with the parent card's tab-bar `border-bottom`. `ProTable ghost` removes the ProCard wrapper and eliminates this interference.

**Account color rule**:
- The `Account` model MUST expose an optional `color` field storing a `#rrggbb` hex value (empty string = unset).
- All chart series that represent accounts MUST resolve their display color via `resolveAccountColor(accountName, customColor?)` from `src/utils/chartData.ts`. Direct use of a color palette index or `ECHARTS_COLORS[i]` without going through this function is a violation.
- `resolveAccountColor` guarantees determinism: the same account name always resolves to the same color regardless of query result ordering, preventing color flicker on re-renders.
- Custom colors (`Account.color`) take precedence over the hash-based fallback.

**Color assignment rule**:
- Charts with multiple series MUST set colors via the option-level `color` array (not per-item `itemStyle.color`). ECharts applies `color` before `itemStyle.color` in the rendering pipeline; option-level color is reliable across tab switches with `notMerge: true`, whereas per-item colors can fail to apply after a previous option set a global palette.

**Tooltip positioning rule**:
- Chart tooltips MUST NOT follow the mouse cursor. The tooltip MUST be pinned to the active x-axis value (for axis-trigger charts) or the data point (for item-trigger charts).
- When using a custom `position` callback, coordinates from `point[0]` are chart-container-relative, NOT viewport-relative. Compare against `size.viewSize[0]` (chart container width) — NOT `window.innerWidth` — when deciding left/right placement.
- Tooltips MUST include `confine: true` OR a custom `position` function that guarantees the tooltip stays within the chart container.

**Legend rule**:
- ECharts' built-in legend (`legend: { show: true }`) is prohibited for Finance domain charts. All legends MUST be custom React pill buttons rendered below the chart.
- Each legend pill: `border-radius: 12px`, colored background matching the series color, white text, small circle dot (or icon for "All" toggles).
- Asset-majority accounts (net total ≥ 0) use green (`#52c41a`) as background in the Equity Curve legend. Debt-majority accounts use red (`#ff4d4f`).
- The "All" toggle pill MUST use `CheckOutlined` (all active), `MinusOutlined` (partial or all-inactive) icon states.

**Rationale**: ECharts provides native `roseType` for Nightingale charts, `visualMap.continuous` for per-segment line coloring, a `position` callback with `size.viewSize` for tooltip overflow prevention, and option-level `color` arrays for reliable tab-switch color assignment — all without workarounds. Standardizing on one library with the SVG renderer eliminates cross-library compatibility issues and keeps the bundle size predictable. The account color system with `resolveAccountColor` prevents the most common chart UX defect (colors changing position as data reloads). Custom React legends give precise control over toggle behavior, styling, and interaction (hover-to-highlight) that the ECharts built-in legend cannot match.

### XII. Entity Toolbar & Sort Controls

All entity list pages that support filter, sort, or column visibility MUST follow
the patterns established in `EntityToolbar` / `useEntitySort` / `useEntityFilter` /
`useColumnConfig`. These patterns resolve a cluster of non-obvious AntD ProTable
limitations discovered during the 008-entity-operations feature build.

#### Apply-Gate Panel State

Every interactive panel (filter, sort, column visibility) MUST maintain separate
`pending` and `active` state. Changes to pending state MUST NOT affect the data
query until the user explicitly clicks Apply.

- Panel hooks MUST expose `pendingState`, `activeState`, `apply()`, `cancel()`,
  `reset()`, and `isDirty` (pending ≠ active).
- Only `activeState` drives the API query; `pendingState` drives panel UI only.
- **One permitted exception**: column header sort clicks update `activeRules`
  immediately (no Apply needed) because the interaction is a direct one-tap action
  with immediately visible effect.
- Apply button MUST be disabled when `isDirty` is false.
- Reset button MUST be disabled when the panel is already at its default state
  (`isDefault && !isDirty`).
- While a panel is dirty (open and has unsaved changes), clicking outside or
  attempting to open another panel MUST NOT close/discard the dirty panel — instead
  bump the `focusCancelOn` token to flash the Cancel button.

#### AntD Sort Indicator Bypass via `onHeaderCell`

**Do not rely on ProTable's `sorter` prop or `sortOrder` column prop for sort
indicators when sort state is managed by `useEntitySort`.**

AntD ProTable maintains internal `sorterStates` that only update when its own
`onChange` fires (user header click via `sorter`). External `sortOrder` prop
changes from panel apply/reset are ignored — ProTable's reconciliation path does
not re-read `sortOrder` after mount.

- Sortable columns MUST use `makeSortProps(field, label, sortCtx)` which:
  - Applies `ant-table-column-sort` via `onHeaderCell(() => ({ className: sortedClass }))` and `onCell(() => ({ className: sortedClass }))` where `sortedClass` is derived from `activeRules`.
  - Renders custom caret icons in the `title` prop driven by `activeRules`.
  - Registers column header clicks via `onHeaderCell(() => ({ onClick: () => handleHeaderClick(field) }))`.
- Do not use ProTable's `sorter` prop on columns that participate in `useEntitySort`.

#### ProTable Remount Key for Panel Changes

When sort or column-pin state changes via a panel, ProTable MUST remount.

- Every entity list page using `useEntitySort` MUST include `sort.panelApplyCount`
  in its `PageTable` `key` prop.
- Pages using `useColumnConfig` MUST also include the sticky-pin state (first/last
  visible column identity + fixed flags) in the `key`.
- `panelApplyCount` increments on `apply()` and `reset()` but NOT on header clicks.
- Without remount, ProTable's internal column-layout initialisation (sticky shadow,
  sorterStates) stays stale when props change after mount.

#### `isDefault` vs `isActive` for Toolbar Button State

The Sort toolbar button's primary variant and Reset button's disabled state MUST
be driven by `isDefault`, not `isActive`.

- `isDefault` is true when `activeRules` equals the `initialActiveRules` passed to
  `useEntitySort`. For pages with no default sort (`initialActiveRules = []`),
  `isDefault` and `!isActive` coincide; for pages with a default sort (e.g.,
  balance-sheets `-date`), `isDefault` remains true at page load even though
  `isActive` is true.
- Sort toolbar button: `type={!isDefault ? 'primary' : 'default'}`.
- `useEntitySort` MUST accept `initialActiveRules` to seed both `activeRules` and
  the anchor for `isDefault` / `reset()`.
- `reset()` MUST restore `activeRules` to `initialActiveRules`, not to empty.

#### Backend Query Infrastructure in `core/` — Opt-In via Declarative Fields

Cross-domain backend capabilities (filtering, ordering, pagination) MUST live in
`core/` as DRF filter/pagination classes. Domain viewsets opt in by declaring
configuration attributes, not by importing shared business logic.

- `EntityFilterBackend`, `NullsOrderingFilter`, `EntityOffsetPagination`, and
  `EntityCursorPagination` live in `apps/unihub/backend/core/`.
- Filtering opt-in: declare `filterable_fields: dict[str, dict]` mapping attribute
  keys to `{"lookup": str, "type": str}`.
- Null-aware ordering opt-in: declare `filter_backends = [..., NullsOrderingFilter]`
  and `ordering_fields`. Frontend encodes null preference as `__nullsfirst` /
  `__nullslast` suffix on the ordering field name; the backend parses and applies
  `F(field).asc/desc(nulls_first/last=True)`.
- Unknown `attr` keys in `filters` param MUST be silently skipped (backward-compatible
  schema evolution). Malformed JSON MUST raise `ValidationError` (400).

#### `useColumnConfig` Async Label Patching

When column definitions include labels that depend on async data (e.g., a currency
name), `useColumnConfig` MUST patch labels without resetting user configuration.

- `useColumnConfig` watches `initialColumns` via `useEffect` and, on each change,
  compares labels by column key. Only `label` is updated; `visible`, `order`,
  `stickyLeft`, `stickyRight` are never touched by the patch.
- The patch MUST apply to BOTH `activeState` and `pendingState` so the column panel
  shows the updated label immediately regardless of panel-open state.
- `isDirty` MUST remain unchanged after a label-only patch.
- If no label changed, the effect MUST return the same state object reference
  (stable identity) to prevent a spurious re-render that would hang `act()` in tests.

**Rationale**: These patterns resolve specific AntD ProTable limitations where
external prop changes (sortOrder, fixed) do not propagate to internal component
state after mount. Formalising them here prevents future features from re-discovering
the same traps. The Apply-gate pattern decouples user intent from server round-trips,
which is critical for pages with large datasets. The `core/` opt-in approach keeps
filter/sort/pagination infrastructure domain-independent (Principle II).

## Development Constraints

- **Package managers**: `pnpm` for frontend, `uv` for backend. Never use `npm`,
  `yarn`, or `pip` directly.
- **Database**: PostgreSQL. Each domain shares one database instance; no
  per-domain database is permitted in v1.
- **Authentication**: Session-based (Django built-in + DRF session auth).
  JWT or OAuth2 are out of scope for v1.
- **Scope**: Single authenticated user owns all data. Multi-tenancy, sharing,
  and collaboration features are out of scope for v1.
- **Mobile**: Desktop/tablet browser widths only. Mobile layout is out of scope
  for v1.
- **Custom attribute types (v1)**: text, long text, number, date, boolean,
  single-select. File/image attachments are out of scope for v1.
- **Delete confirmation (NON-NEGOTIABLE)**: Every user-initiated destructive
  action (entity deletion, batch deletion, irreversible record removal) MUST
  display an Ant Design `Modal.confirm` dialog before executing. The dialog
  MUST carry `okType: 'danger'`. Clicking Cancel MUST abort the action with
  no side effects. The confirmation title and body MUST use locale keys
  (`formatMessage`). Inline or silent deletion without a confirmation gate is
  a constitution violation.

## Domain Addition Protocol

When connecting a new life domain to the hub, follow this exact sequence — no
steps may be skipped or reordered:

1. Create `apps/unihub/backend/<domain>/` as a new Django app (`models.py`,
   `views.py`, `serializers.py`, `urls.py`, `migrations/`).
2. Register the app in `INSTALLED_APPS` and add its URL prefix in
   `unihub/urls.py`.
3. Seed the domain's system AttributeDefinitions via a data migration or
   management command — never hardcoded in application code.
4. Add the domain's pages under `apps/unihub/frontend/src/pages/<domain>/`.
5. Add a nav section entry in `AppShell.tsx` using a `menu.*` i18n key
   (Principle VIII).
6. Add a service file at `apps/unihub/frontend/src/services/<domain>.ts` with
   types generated from the updated OpenAPI schema.
7. Register every concrete model with the **`data_io`** registry in the domain's
   `AppConfig.ready()` (Principle I data-portability rule), and keep those
   `TableDescriptor`s in sync on every subsequent schema change.

Verify the Finance domain remains fully functional after adding any new domain
(Principle II compliance check).

## Governance

This constitution supersedes all other development practices and guidelines for
UniHub. In cases of conflict, the constitution takes precedence.

**Amendment procedure**:
- Any amendment MUST update this file, increment the version, and set
  `LAST_AMENDED_DATE` to the amendment date.
- Amendments affecting Principle I (Entity-Centric Domain Architecture) require
  explicit justification documenting why the entity management mechanism cannot
  satisfy the requirement.
- After any amendment, the Sync Impact Report (HTML comment at top of this file)
  MUST be updated listing all affected templates and files.

**Versioning policy**:
- MAJOR: Backward-incompatible governance change or principle removal/redefinition.
- MINOR: New principle or section added, or material expansion of existing guidance.
- PATCH: Clarifications, wording fixes, non-semantic refinements.

**Compliance review**:
- Every implementation plan (`plan.md`) MUST include a Constitution Check section
  that gates work against these principles before Phase 0 research begins.
- Re-check constitution compliance after Phase 1 design.

**Version**: 1.17.0 | **Ratified**: 2026-05-17 | **Last Amended**: 2026-07-11
