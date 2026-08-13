# Data Model: Quick Search (019)

**No new persisted entities. No migrations. No `data_io` changes** (constitution I data-portability rule: nothing schema-shaped changes, so the registry is untouched).

The feature's "data model" is (1) a per-endpoint searchable-field matrix, (2) one transient frontend field, and (3) an explicit list of things that MUST NOT change.

## 1. Searchable-field matrix (server)

Declared per viewset as `searchable_fields: dict[str, str]` (path → `"text"` = `__icontains` directly, `"cast"` = `Cast(..., TextField())` then `__icontains`) plus `search_attribute_values: bool`. One `search=<q>` param ORs across every row below for that endpoint, then ANDs with the `filters` payload.

### `CurrencyViewSet` — `/api/v1/finance/currencies/`

| Field | Kind | Note |
|---|---|---|
| `code` | text | pk |
| `name` | text | |
| `symbol` | text | |

Excluded: `is_base_currency` (boolean — R3).

### `AccountViewSet` — `/api/v1/finance/accounts/`

| Field | Kind |
|---|---|
| `name` | text |
| `currency` | text |
| `color` | text |
| `open_datetime` | cast |
| `close_datetime` | cast |

### `ExchangeRateViewSet` — `/api/v1/finance/exchange-rates/`

| Field | Kind | Note |
|---|---|---|
| `base_currency` | text | |
| `quote_currency` | text | |
| `rate` | cast | Decimal(24,8) — "31.05" ⊂ "31.05000000" |
| `date` | cast | |

### `ItemViewSet` — `/api/v1/inventory/items/` (catalog flat mode — the searching mode, R5)

| Field | Kind | Note |
|---|---|---|
| `name` | text | |
| `alias_name` | text | |
| `spec` | text | |
| `remark` | text | |
| `url` | text | |
| `sku_price_currency` | text | |
| `quantity` | cast | |
| `sku_price` | cast | |
| `deprecate_time` | cast | |
| `acquisition__source` | text | forward FK — no row duplication |
| `acquisition__remark` | text | forward FK |
| *(all dynamic parameters)* | `search_attribute_values = True` | `Exists` over `AttributeValue.value` for `inventory.item` rows (R4) |

Excluded: `deprecated` (boolean), computed `status`/`total_price`/`parameters` (the last covered by the `Exists` leg).

### `AcquisitionViewSet` — `/api/v1/inventory/acquisitions/` (uniformity only — the catalog page never search-queries tree mode)

| Field | Kind |
|---|---|
| `source` | text |
| `remark` | text |
| `request_time` | cast |
| `obtained_at` | cast |

### `ScenarioViewSet` — `/api/v1/inventory/scenarios/`

| Field | Kind | Note |
|---|---|---|
| `name` | text | |
| `description` | text | searchable though not in `filterable_fields` (R14) |

## 2. Transient frontend state

### `InternalTab.search?: string` (`components/EntityViews/useViewTabsState.ts`)

The per-tab quick-search query. Lifecycle:

| Event | Effect on `search` |
|---|---|
| Tab created (`addBlankTab`, `duplicateTab`, pinned-merge, inbound URL restoration) | `''` |
| `switchTab` away | snapshot the table's live query into the outgoing tab |
| `switchTab` to | `table.setSearchQuery(tab.search ?? '')` |
| `saveTab` / `renameTab` / `pinTab` / `reorderTabs` | untouched (only `config` is sent to the server) |
| `resetTab` ("Reset changes") | untouched — reset restores stored *config*; search is not config |
| Page reload | gone (per-visit, round-13 rule: `useViewTabsState` persists nothing) |

### `useEntityTable` additions (`components/EntityToolbar/useEntityTable.ts`)

- `searchQuery: string` — immediate input echo.
- `setSearchQuery(q: string): void`
- Debounced trimmed value (300 ms, `useDebouncedValue`) → `queryParams.search` only when non-empty (`undefined` otherwise — never `''`, see R6), and → the offset-reset effect deps (R8).
- `snapshotConfig()` / `loadConfig()` — **unchanged**; search is not part of `ViewConfig`.

### `EntityListParams.search?: string` (`components/EntityToolbar/types.ts`)

Serialized by both existing `buildEntityListQs` copies via their generic pass-through loop; no service-layer edits beyond the type.

## 3. Invariants — what this feature MUST NOT touch

- `ViewConfig` shape (filters/sort/columns/pageSize) — search never enters it.
- `serialization.ts` — FACETS stay `['view','f','sort','cols','size','page']`; no search facet; no URL representation of search.
- `normalizeConfig`/`configsEqual` — dirty compare is search-blind, so FR-033 (dot ⟺ override params) holds untouched.
- The five navigation guards in `useEntityViews` (L210-243 comment block) — no modification.
- `EntityView.config` on the server — saved views never contain a search term.
- `EntityFilterBackend` semantics — the new backend is additive; `filters` parsing is untouched.

## 4. Contract shape

See [contracts/search-api.md](contracts/search-api.md). Response envelopes (`OffsetPaginatedResponse`, footer `totals`) are byte-compatible — `search` only narrows which rows appear, and `count`/`totals` are computed post-filter by the existing pagination class.
