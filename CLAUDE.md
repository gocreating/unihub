# Claude Development Guidelines — unihub Monorepo

**unihub** is a single, growing dashboard that serves as a personal central hub — one place to manage and visualize all dimensions of a user's daily life. As the project evolves, new domains get connected to the hub: finance, visiting, language, people, music, and whatever comes next. The dashboard frontend is the consistent interaction surface; backends and data sources expand behind it over time.

> **Reference implementation**: `ov-fleet` (`/Users/gocreating/projects/OverviewCorporation/ov-pro-tools/apps/ov-fleet`) — the primary architectural reference. Follow its patterns for backend layout, service layer, and frontend organization.

## Core Architecture: Entity-Centric Domains

Every domain is built around **entities** — the user creates and manages entities scoped to that domain. There is one backend (one Django project, one database) with each domain implemented as a standalone Django app inside it.

```
apps/
  unihub/
    frontend/    # Single hub SPA
    backend/     # Single Django project — one DB, domain apps inside
      unihub/    # Django project (settings, urls, wsgi)
      core/      # Shared infrastructure (filters, pagination, permissions)
      finance/   # Django app — finance entities
      visiting/  # Django app — visiting entities
      language/  # Django app — language learning (WordCard, GrammarSheet)
      people/    # Django app — people & relationships (Person, Relationship)
      music/     # Django app — song collection (Song)
      data_io/   # Data import/export
      sync/      # Data sync with external sources
      system/    # System settings (profile, etc.)
      health/    # Health check endpoint
    docker-compose.local.yml       # Build from source, local dev
    docker-compose.production.yml  # Pre-built images, production
    specs/
.env.example                       # Template for production secrets (copy to apps/unihub/.env)
```

Adding a new domain = adding a new Django app under `apps/unihub/backend/`, registering it in `INSTALLED_APPS` and `urls.py`, and adding a `pages/<domain>/` section in the frontend.

Per-app CLAUDE.md files:
- `apps/unihub/frontend/CLAUDE.md` — frontend dev guidelines
- `apps/unihub/backend/CLAUDE.md`  — backend dev guidelines

## Architecture Decisions

### Frontend

**Vite over @umijs/max**
- Rationale: Lighter build toolchain, faster HMR, standard React setup. ov-fleet uses UmiJS but that adds framework lock-in we avoid for a personal project.

**Ant Design 5 + Pro Components for UI**
- Rationale: Enterprise-grade admin framework matching ov-fleet's UI stack. Rich data display components (ProTable, StatisticCard, charts).

**PageTable as default tabular component**
- All tabular data views MUST use `PageTable` (`src/components/PageTable/`), adapted from ov-fleet. It provides sticky header, sticky footer, sticky horizontal scrollbar, and column-follow-on-scroll — pre-configured. Use the exported helpers `widthForHeader()`, `measureTextWidth()`, `computeScrollX()` for column widths.

**TanStack React Query for data fetching**
- Rationale: Matches ov-fleet's data-fetching layer. Excellent caching and loading/error states.

**pnpm as frontend package manager**
- Rationale: Strict dependency resolution, disk efficient, mature workspace support.

### Backend

**Django + Django REST Framework**
- Rationale: Mirrors ov-fleet's proven backend stack. Rich ORM, DRF serializers/viewsets, session auth, and drf-spectacular for OpenAPI generation.

**PostgreSQL**
- Rationale: Same as ov-fleet. Reliable relational store; supports JSONB for flexible tag/metadata schemas.

**drf-spectacular for OpenAPI**
- Rationale: Auto-generates `openapi.yaml` consumed by the frontend's type generation (`openapi-typescript`). Types stay in sync with the API contract.

**App-level isolation**
- Rationale: Each app has its own `package.json` / `pyproject.toml` and dependencies. No shared root lockfile.

## Backend Structure (follow ov-fleet)

New Django apps under `apps/unihub/backend/` should mirror ov-fleet's layout:

```
backend/
  <project_name>/         # Django project root
    settings.py
    urls.py               # Root URL router — include app-level urls.py
    wsgi.py / asgi.py
    auth/                 # Session auth + RBAC (IsAdminOnly, etc.)
    <domain>/             # One Django app per domain (finance, visiting, language, …)
      models.py
      views.py            # DRF ViewSets
      serializers.py
      filters.py          # Query/filter helpers
      urls.py
      migrations/
    health/               # Health-check endpoint
  tests/                  # pytest-django test suite
  manage.py
  pyproject.toml          # uv-managed Python dependencies
  Dockerfile
  entrypoint.sh
```

**Key backend conventions (from ov-fleet):**
- Session-based authentication (Django's built-in + DRF session auth)
- Role-based permissions via DRF permission classes (`IsAdminOnly`, etc.)
- OpenAPI schema at `/api/docs/` via drf-spectacular Swagger UI
- Background tasks via django-q2 where polling or async work is needed
- All HTTP client calls via `httpx`
- Linter: `ruff`; tests: `pytest-django`

## Frontend Service Layer (follow ov-fleet)

Organise API calls under `src/services/<backend-name>/`:

```
src/services/unihub-backend/
  finance.ts        # Finance domain endpoints
  auth.ts           # Authentication endpoints
  core.ts           # Shared/core endpoints
  io.ts             # Data import/export endpoints
  sync.ts           # Data sync endpoints
  system.ts         # System (profile, settings) endpoints
  index.ts          # API_BASE_URL + service exports
```

Types are auto-generated from `openapi.yaml` via `openapi-typescript`. Do not hand-write API response types.

## Development Conventions

### TypeScript/React Style
- Strict TypeScript (`strict: true` in tsconfig)
- Functional components with hooks (no class components)
- Named exports preferred over default exports

### Tooling
- **Frontend package manager**: `pnpm` — never use npm or yarn directly
- **Backend package manager**: `uv` — never use pip directly
- **Frontend linter**: ESLint
- **Backend linter**: ruff
- **Testing (frontend)**: Vitest + React Testing Library
- **Testing (backend)**: pytest-django

### Quality Loop

Frontend — run from `apps/unihub/frontend/` after every change:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Backend — run from `apps/unihub/backend/` after every change:

```bash
uv run ruff check .
uv run pytest
```

### Git
- Branch from `main`
- Commit messages: imperative mood, concise

## Adding a New Domain

When connecting a new dimension to the hub:
1. Create `apps/unihub/backend/<domain>/` as a new Django app (`models.py`, `views.py`, `serializers.py`, `urls.py`, `migrations/`)
2. Register the app in `INSTALLED_APPS` and add its URL prefix in `unihub/urls.py`
3. Seed the domain's system AttributeDefinitions via a data migration or management command — never hardcoded in application code
4. Add the domain's pages under `apps/unihub/frontend/src/pages/<domain>/`
5. Add a nav section entry in `AppShell.tsx` using a `menu.*` i18n key (constitution Principle VIII)
6. Add a service file at `apps/unihub/frontend/src/services/<domain>.ts` with types generated from the updated OpenAPI schema

<!-- SPECKIT START -->
## Active Feature

**Branch**: `017-multiple-sticky-columns` | **Plan**: [specs/017-multiple-sticky-columns/plan.md](specs/017-multiple-sticky-columns/plan.md)

Multiple sticky columns (GitHub issue #37): generalize column pinning from the two view-wide "pin first/last visible column" booleans to **per-column pin state** (`ColumnDef.pin?: 'left' | 'right'`) so any number of columns can be pinned to either table edge. **Iteration 48 (2026-07-20) shipped** — `useColumnConfig` rewritten: pin rides on each `ColumnDef` (defaults seed via page columnDefs, e.g. catalog `__caret` left / `actions` right, replacing the deleted `defaultSticky` option); ONE shared `(pinRank, order)` comparator (`compareDisplayOrder`) drives table AND panel order (rc-table needs fixed columns contiguous at the array edges; pins never mutate `order`, so unpinning returns a column home); new API `fixedForKey(key)` + `pinFingerprint` ("key:side|…" of visible pins, display order) replace `firstColumnFixed`/`lastColumnFixed` and join every PageTable remount key (constitution XII amended → v1.23.0). `ColumnPanel`: EVERY row carries pin-left + pin-right pushpins (`[data-column-row] [data-sticky-pin]`, right icon mirrored, i18n `pinLeft`/`pinRight` tooltips, aria-labels); click active side = unpin, other side = swap; apply-gated; hidden columns keep their pin (excluded from fingerprint/fixed until re-shown). All 6 consumer pages mechanically updated to `fixedForKey` + fingerprint keys. LATENT BUG FIXED: catalog `colDefMap` renderers close over `toggledIds` (itemFor/isExpanded) but never dep'd on it — masked before because the old hook rebuilt `visibleColumns` every render; the memoized hook exposed it (expand stopped splitting merged rows) — `toggledIds` added to the deps. Tests: hook suite 19 (grouping, fingerprint, seeds, patch preserves pin, referential stability), panel 24 (per-row buttons, mutual exclusion, TWO-left/TWO-right DOM classes with single fix-left-last/fix-right-first boundary), catalog RTL 34 (right-pin via panel, Reset restores default pins — needs 15s timeout: two panel round-trips + remounts in JSDOM), e2e `column-pin.spec.ts` 10/10 real-browser geometry at 600px viewport (two-left flush + contiguous ±1.5px mid-scroll, two-right hugging the right edge, both-sides with only the middle scrolling >100px, catalog defaults + Reset, hide/re-show retains pin, per-row-only pin buttons; NOTE: `.ant-table-body tr:first-child` is rc-table's hidden MEASURE row — geometry selectors must use `tr.ant-table-row`). No persistence (column settings stay per-visit; the hooks' `_key` params are unused — verified). See [plan.md](specs/017-multiple-sticky-columns/plan.md), [spec.md](specs/017-multiple-sticky-columns/spec.md), [research.md](specs/017-multiple-sticky-columns/research.md).

### Previous Feature (shipped)

**Branch**: `014-inventory-app` | **Plan**: [specs/014-inventory-app/plan.md](specs/014-inventory-app/plan.md)

Inventory domain from GitHub issue #33: an entity-centric Django app (`inventory`) + frontend section for cataloging **Items**, recording how each was obtained (**Acquisition**, with 1..N signed **CostFactor**s → per-currency `net_cost`), and per-situation planning via **Scenario** packing trees. Iterations 1–13 shipped (acquisition-first creation, cost factors, merged "Catalog" tree page with server-side filter/sort/pagination + flatten-on-item-filter, data_io registration, HTML legacy import, derived Item/Parameters/Acquisition columns + two-row datetime — see spec.md Clarifications for the full trail). Iterations 14 (dynamic parameters on core AttributeDefinition/AttributeValue + `attr:<id>` columns; constraints/checklist removed, Backlog+Organize detail) and 15 (merged single-item catalog rows, ×N tertiary, 4-case dates, zero-cost hidden, footer totals hook, legacy-import fixes + full 2026 re-import) shipped. Iteration 16 shipped (pinned Toggle ColumnDef + defaultSticky seed, ParameterRowsEditor form-grid + definition delete, scenario organize redesign: info panel, Add search modal, Splitter unorganized↔organized panes with HTML5 cross-pane drag, ScenarioItem.organized + move(organized)). Iteration 17 shipped (ICU-plural counts, plain Name column, URL width capped to render + gated tooltip, seeded default filter `obtained_at ≥ Jan-1 OR is_empty` via `useEntityFilter` defaultGroups, 50/page, 2025 append-import; fixes: is_empty-on-datetime 500, importer >4dp factor rounding). Iteration 18 shipped (Item.alias_name + shared ItemName, scenario list 2-col + detail Edit/kebab via ScenarioFormModal, unified dnd-kit organize: flattened tree + projectDrop projection, one-motion nested drops, real-mouse e2e). Iteration 19 shipped (constitution v1.21.0 PanelHeaderActions kebab pattern on scenario/acquisition panels, catalog Edit→href + Delete relocated to the edit page, organize caret restored + gated tooltips via ItemName.truncate, modal single-Add + acquisition context, full 2015–2024 import: 637 acq / 991 items verified). Iterations 20–25 shipped (20: constitution v1.22.0 ICU plurals, parser continuation fix, content-coverage sweep pytest over all real sheets, no-jitter tree drags; 21: flat-mode acquisition Edit link restored; 22: modal Add-button pixel-flush rows + geometric e2e lock; 23: date-cell no-data-loss — EOY default, latest-date complex cells, month-end `??` days, strikethrough skip, sweep covers date cells; 24: default catalog filter as ONE plain-OR condition group; 25: verbatim-first 備註 → item.spec/acquisition.remark, per-row prices → sku_price + summed accumulated override, STABLE import PKs via `legacy_ref` upsert — re-imports never clear scenarios). **Iteration 26 (2026-07-19) shipped** — temperature/time/battery unit families (affine °C↔°F via `core/units.py` family converters), dimension values accept `min-max` ranges (`AttributeValue.value_number_max`, `compute_value_fields` 4-tuple, range-validated editor input), parser 尺寸 triplet/pair split → 長/寬/高 parameters (verbatim kept when prose remains), shared `ItemDisplay` component (name/alias+URL primary, spec secondary, opt-in localized `key: value` parameter pairs) adopted at catalog Item cell, acquisition cards, scenario panes, and the Add modal; fixes: ItemFormModal initialize-on-open only (parent re-renders no longer wipe unsaved edits), organize-tree drops project from the POINTER (compact DragOverlay no longer misclassifies lower-half drops). **Iteration 27 (2026-07-19) shipped** — parameter emoji (`AttributeDefinition.emoji` + seeded 🎨👕⚖📏🧴 system defaults, monochrome `KeyEmoji` silhouette prefix in key-value pairs + key picker), FR-033 price format (`utils/currency.ts` symbol map + `formatPrice` → "TWD $ 129", zero/empty → "-"; shared `PriceInput`/`CurrencySymbolSelect` [symbol][amount] inputs at item modal + cost rows), catalog Actions pinned sticky-right (column key v7), Item column measured by primary name only (spec truncates at column width), Remark single-line + gated tooltip, side-nav real router links, equal-height item cards, Add-items modal wider (760) + viewport-anchored with inner-scrolling results; updated-sheet upsert re-import (658 acq / 1003 items, PKs + scenario memberships preserved). **Iteration 28 (2026-07-19) shipped** — ranges extended to plain `number`-typed parameters (same single-or-range grammar, min→`value_number`/max→`value_number_max`, validated text input replaces InputNumber), range display switched to tilde `min ~ max unit` everywhere, parser keyed patterns (長度/重量/容量) capture `min~max` ranges verbatim (`長度：74~164cm` → length 74~164 cm, canonical 740/1640 mm), upsert re-import repaired the ranged item (counts/PKs/scenario stable). **Iteration 29 (2026-07-19) shipped** — faithful organize drag preview: the DragOverlay renders the SAME row content (holder + ItemDisplay incl. spec/parameter pairs) at the grabbed row's measured width (captured in onDragStart), replacing the compact name-only chip; mid-drag e2e locks width ±2px + identical text (note: dnd-kit suppresses the first click after a drag — e2e spends it on a neutral spot). **Iteration 30 (2026-07-19) shipped** — keyed 寬度/高度/直徑/耐溫 extraction (signed ranges `-40~230`, 度C/℃→°C; NEW migration-seeded diameter 📏 + temperature 🌡 system definitions; importer measure keys + SYSTEM label maps + locales extended; upsert re-import: the 食品级折叠水杯 gains height 1.8~8cm / diameter 5.5~9cm / temperature −40~230°C), and the range input became an explicit **Exact|Range mode toggle** (`RangeValueInput`: mode select + one or two InputNumbers joined by ~, canonical text emitted, min≤max inline-validated) replacing the free-text syntax box on dimension AND number rows. **Iteration 31 (2026-07-19) shipped** — the drop indicator paints ABOVE the now semi-transparent drag preview (overlay zIndex 900 + opacity 0.75; indicator position:relative zIndex 1000, e2e-locked mid-drag), and the Add-items modal lists the 10 most recently acquired items while the search box is empty (`-acquisition__obtained_at__nullsfirst`, limit 10). **Iteration 32 (2026-07-19) shipped** — price currency selects display the full `{CODE} {symbol}` label when selected (bare symbol was ambiguous across $-sharing codes; `labelRender` removed from `CurrencySymbolSelect`, both consumers). **Iteration 33 (2026-07-19) shipped** — acquisition-edit item removals/edits are STAGED until Save (immediate deleteItem/updateItem removed — a real item was lost and restored via the ref-keyed upsert: 2026:3:1 MONDAY DUCK; 6-test RTL regression suite locks zero API calls before Save), and currency symbols now come from the FINANCE domain's Currency.symbol via a registry seeded in AppShell (hardcoded map deleted; TWD → NT$; unseeded codes render code-only). **Iteration 34 (2026-07-19) shipped** — the symbol registry became REACTIVE: `useCurrencySymbols()` (hooks/) subscribes to the shared finance currencies query, seeds the registry during render, and joins the catalog's width/column memo deps (the non-reactive module variable left warm-cache loads code-only forever); adopted at CatalogPage/AcquisitionForm/ScenarioDetail/AppShell; `utils/finance.ts` `getCurrencySymbol` now reads the same registry (second hardcoded map deleted); race locked by RTL with currencies resolving after list data. **Iteration 35 (2026-07-19) shipped** — key-value-only price extraction (plain 原價/單價 requires the colon; colonless only for the `N * M 件` quantity expression — 雨傘王 sku now derives from paid 725, prose 原價850 stays verbatim) and adorned paid cells parse via `extract_amount` (`¥4,200` → 4200 JPY; 東京迪士尼 rows recovered their paid amounts); updated sheets re-imported (658/1003, PKs + scenarios stable). **Iteration 36 (2026-07-19) shipped** — ItemDisplay remark comment-icon tooltip (flex primary line) + opt-in ⚠ deprecated warning (scenario panes + Add modal); stored `Item.deprecated` boolean (backfilled migration 0018, status derives from it, deprecate_time = when-known; catalog modal gains a "Deprecate time unknown" checkbox, Restore clears both, legacy deprecate_time-only payloads still derive the flag); parser per-unit dims (`50cm * 75cm` → 長/寬, mixed-unit triplets like `172cm x 58 cm x 4 mm`, tightened size-residue rule keeps `尺寸：S (…)`); re-imported (45 items with L+W pairs). **Iteration 37 (2026-07-19) shipped** — the remark comment icon (and ⚠) is suffixed directly to the item name: the primary-line name wrapper shrinks-to-fit (`flex: 0 1 auto`) so icons hug the text end instead of the row edge (RTL style-locked). **Iteration 38 (2026-07-19) shipped** — the remark/warning icons vertically CENTER on the name row (`alignItems: 'center'` — flex `baseline` floats SVG anticons off the text line; RTL style-locked). **Iteration 39 (2026-07-19) shipped** — 原價 (pre-discount list price) never sets the sku: hierarchy = explicit 單價 → own paid ÷ qty (原價X*N件 contributes qty only) → computed `原價X，N折` discount for shared-rowspan rows (失落文明 252 / 霍金 450, sum = the shared 702); derived skus inherit the acquisition currency. Re-imported: HEATTECH 380 TWD, Giordano 425 TWD, 內褲*2 159 TWD, 無印 fixture → 189. **Iteration 40 (2026-07-19) shipped** — segmented 備註 key-value parsing (FR-029j): lines split on ，/、/spaced-`/` (bare slashes stay in values), keys match per segment via the extracted `_apply_unit`, unconsumed segments → remark; delimiter-spanning forms (原價X，N折 / variants / whole-line 運費) keep whole-line processing; English `color:` joins the color keys. Re-imported: `size: L / 顏色: 00 WHITE` → size L + color 00 WHITE; `size: L，白色` → size L (白色 verbatim in spec). **Iteration 41 (2026-07-19) shipped** — KeyEmoji centers on the key text line (inline-flex + vertical-align middle + line-height 1; the emoji-key gap became a margin, so tag innerText has no literal space — e2e regexes must use ` ?`). **Iteration 42 (2026-07-19) shipped** — pattern-level parser rules (FR-029k): dims parts may be ranges (尺寸：Q（160x200x18~28cm） → 長160/寬200/高18~28cm + size Q); size `LABEL（annotation）` recurses the annotation through _apply_unit and keeps only the label; 腰圍/waist seeded (migration 0019, colon-optional key — size L(腰圍 84~92cm) → waist 84~92cm); acquisition-level `名稱原價…` listings assign skus by name-fragment with constraint-propagation matching (衣夾 frees 衣架) and progressive-prefix fallback (牛仔褲→褲), overriding shared-total header leaks; imports are per-year atomic with ref/name context on invalid values. All MUJI rows verified (被套1390/抹布119/衣架99×2; 衣架99×7/衣夾49; 衣架99×3/枕頭1390/褲1390 — TWD). Note: the editor key dropdown is virtualized past ~10 options — e2e must scroll `.rc-virtual-list-holder` to reach '+ New parameter…'. **Iteration 43 (2026-07-19) shipped** — the DragOverlay portals to document.body (transformed-ancestor jump remedy; grab-offset e2e ±3px), nest-drops color the prospective container row (strong tint + `data-nest-target`) and its subtree block (light tint) replacing the indicator line (sibling drops keep the line), and search marks reach every displayed text (ItemDisplay spec + modal acquisition context — note: HighlightText marks split direct text nodes, so RTL must assert via textContent/findAllByText). **Iteration 44 (2026-07-19) shipped** — shared-rowspan price repairs (FR-029l): a header paid cell spanning other ITEM rows never leaks into the header item's sku (killed entries still count toward the accumulated SUM; factor rows ignore carried totals — the bogus discount 3126 is gone); ANCHORED 備註 price segments (`原價 680` / `單價 449` / `原價 74 * 2 顆` / `原價：89 RM`, optional ¥￥$ prefix) form a list-price tier BELOW own-paid (單價 anchored → sku directly; prose stays protected — 雨傘王 intact); name-listing fragments accept paren annotations (大箱子(黑色) → the 黑色 50L box) with elimination for unmatched descriptors (AUKEY 充電器 2280); composite `color & size: 65 土黃L` splits on the trailing size token; qty units broadened to 件組個顆條包盒雙 (listing-derived qtys clear only when assigned to a sibling); importer aliases RM → MYR and CLEARS stale skus on upsert (partial-update gap). Re-imported all 12 years (658/1003, PKs + memberships stable); full old-vs-new diff reviewed: 100 item changes, all leak-removals/real-listed-prices/qty fixes. **Iteration 45 (2026-07-19) shipped** — pixel-verified alignment (FR-032/FR-011, repeatedly re-reported): parameter-emoji INK now centers on the tag row via runtime per-glyph canvas-metric compensation (`emojiInkShift`: TextMetrics ink box vs font box → translateY; box centering alone cannot fix per-glyph/per-platform ink placement — reproduced with an ink-level probe, 👕 sat 1.75px low), and the organize caret/holder center on the FULL row box (`alignItems: 'center'`, marginTop nudges removed — tree, flat pane, AND drag overlay; measured −22.5px/−35.9px before). NEW e2e `inventory-geometry.spec.ts` (deviceScaleFactor 4) locks both: emoji ink Δ ≤ 1.5px via canvas ink analysis of element screenshots, caret/holder Δ ≤ 1.5px vs row center. Also: scenario-list Name is a real router `<Link>` (href; onClick-only anchors banned, FR-010), Add-modal results render parameter pairs (FR-011), and scenario pages set browser tab titles via the new `usePageTitle` hook (`<page> · Unihub`, restore-on-unmount; detail = scenario name, FR-035). Process rule (memory + spec): visual-geometry complaints REPRODUCE first with a pixel probe + screenshots, fix by flex layout, lock with real-browser geometry assertions — JSDOM style locks don't count. **Iteration 46 (2026-07-19) shipped** — emoji ink MASK rendering (FR-032): iteration 45's metric compensation FAILED on real platforms and its e2e was vacuous (font-less environment rendered tofu); with Noto Color Emoji installed the shipped build failed its own test. New architecture: the glyph draws into a canvas, `inkBounds` pixel-scans its ACTUAL ink, the crop paints as a centered currentColor `mask-image` — displayed pixels ARE the measured pixels (construction-guaranteed on any font); JSDOM falls back to silhouette text. Shared `ParameterTag` (flex row) replaces the DUPLICATED tag markup (ItemDisplay + catalog Parameters column — where the 'fixed' bug survived); key-picker option flex-centered. Tests: inkBounds unit suite, KeyEmoji mask/fallback/cache RTL (mocked canvas), geometry e2e per-glyph over catalog/panes/modal + ANTI-TOFU guard (distinct glyphs must paint distinct masks). Lesson (memory): verify the verifier — probe environments must render the real thing. **Iteration 47 (2026-07-19) shipped** — the catalog Deprecate modal renders a bordered ItemDisplay preview of the target item (name/alias + URL, spec, remark icon, ParameterTag pairs — FR-003c) above the confirm line so the user verifies the right item; date/unknown-time controls unchanged; RTL-locked (preview shows name/spec/parameter pair). See [plan.md](specs/014-inventory-app/plan.md) and [research.md](specs/014-inventory-app/research.md).
<!-- SPECKIT END -->

## Active Technologies
- **Frontend**: TypeScript 5.7, React 18.3, Ant Design 5.24, @ant-design/pro-components 2.8, TanStack React Query 5, React Router 7, Vite 6, Vitest
- **Backend**: Python 3.12, Django 5.x, Django REST Framework 3.x, PostgreSQL 16, drf-spectacular, django-q2, httpx, gunicorn, uv
