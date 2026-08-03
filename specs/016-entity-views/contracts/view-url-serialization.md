# Contract: View URL Serialization — v2.1 (readable grammar; id-based view reference, round 4)

**Module**: `apps/unihub/frontend/src/components/EntityViews/serialization.ts`
**Consumers**: `useEntityViews` (read/write), deep links, e2e tests.
**Supersedes**: the round-1 packed `view[<tableKey>]=<encoded inner>` mini-format. The legacy format is NOT parsed — a legacy param is treated as an unrelated query param and, carrying no v2 facets, simply yields the default view (FR-008 applies only if it collides with a v2 name, which it cannot).

## Design goal (FR-022 / SC-007)

A person reading the URL can identify the table and every configuration facet by name and edit them by hand. No opaque encoded blobs; minimal percent-encoding on emit. **One exception (round 4)**: the saved-view reference carries the view's id, because names are no longer unique and a name could not identify a view (FR-016/FR-022, SC-007 amended accordingly).

## Grammar

```
query        = *( param "&" ) param
param        = table-key "." facet "=" value          ; view params; other app params untouched
table-key    = 1*( ALPHA / DIGIT / "-" )              ; e.g. inventory-catalog
facet        = "view" / "f" / "sort" / "cols" / "size" / "page"

view-value   = saved-view-id                          ; reference BY ID (12-char nanoid) — round 4
f-value      = logic "(" cond *( ";" cond ) ")"       ; ONE filter group per f param;
logic        = "and" / "or"                           ;   repeat <tableKey>.f for more groups (order kept)
cond         = attr SP op [ SP val ]                  ; val = remainder of segment (may contain spaces)
sort-value   = rulesToOrdering string                 ; e.g. -obtained_at__nullsfirst,name
cols-value   = col *( "," col )                       ; VISIBLE keys in display order
col          = column-key [ "~left" / "~right" ]      ; per-column pin suffix (any number per side)
size-value   = 1*DIGIT                                ; page size (25|50|100)
page-value   = 1*DIGIT                                ; 1-based page (transport only, never persisted)
```

- **No `.view` param** → inline state: absent facets mean the table default for that facet.
- **`.view` present** → reference to a saved view by id; other facets are **overrides** applied facet-whole on top of the stored config (an `.sort` override replaces the entire stored sort list). A tab with no stored view — a scratch tab, or the page default while still virtual — emits NO `.view` and serializes its configuration inline (round 4 removed the name-matching special case for the virtual default).
- **Clean default tab active** → NO view params emitted at all (clean URL).
- `column-key` may itself contain `:` (dynamic `attr:<definitionId>` columns) — `~` was chosen as the pin delimiter because it never appears in column keys and is a URL-unreserved character.

## Key semantics

| Facet | Maps to | Notes |
|-------|---------|-------|
| `view` | saved `EntityView` looked up by `id` | Round 4: id-based, so renaming a view NEVER breaks an existing link; a deleted/foreign id → FR-008 fallback + notice |
| `f` | one `ViewConfig.filters` group per param | `attr` and `op` are the existing filter vocabulary; `is_empty`/`not_empty` conditions omit `val`; `val` runs to the segment end (internal spaces legal) |
| `sort` | `ViewConfig.sort` via `orderingToRules` | unchanged from round 1 |
| `cols` | visible subset of `ViewConfig.columns` + per-column `pin` | hidden columns (order + pins) reconstructed from stored config / page defaults |
| `size` | `pageSize` | invalid → fallback (see below) |
| `page` | transient page position (offset = (page−1)×pageSize) | never persisted into a saved view |

## Behavioral contract

1. **Continuous sync**: the active tab's effective state is always reflected in the table's facet params (history `replace` on config edits; `push` on tab switch). Copying the URL at any moment reproduces the visible state (SC-003).
2. **Inbound navigation**: on mount and on every query-string change, facet params under the table's namespace are parsed; if they describe a state different from the current active tab, the described view opens/activates (FR-006). Params of other namespaces (and non-view params) are untouched.
3. **Saved + overrides**: produces a tab for the referenced view with overrides applied and the dirty marker on (config ≠ stored) — US3-AC2.
4. **Fallbacks (FR-008)** — never break the page:
   - unknown/foreign `view` id → default view + non-blocking `message.warning` (`common.entityViews.unresolvedView`);
   - malformed `f` group / non-numeric `size`/`page` → default view + warning;
   - unknown individual column keys or filter/sort fields → dropped silently (partial apply, FR-021 / R10).
5. **Round-trip guarantee** (unit-tested): for any valid `ViewConfig` C and page defaults D, `parse(serialize(C, D), D)` normalizes equal to C on the visible facets — **per-column pins included** (hidden-column order/pins excepted, documented in data-model §3).
6. **Encoding**: emission uses a minimal custom encoder — only `&`, `=`, `%`, `#`, `+` and control characters are percent-encoded; spaces emit as `%20` (browsers display them as spaces). Parsing goes through `URLSearchParams`, so fully-encoded forms are accepted equivalently. Dots in the param NAME are literal.

## Examples

Saved view by name (catalog "YTD"), no overrides:

```
/inventory/catalog?inventory-catalog.view=Vx3kQ9aB7mNp
```

Saved view with one override (force 100/page):

```
/inventory/catalog?inventory-catalog.view=Vx3kQ9aB7mNp&inventory-catalog.size=100
```

Inline (2026 items OR empty date, sorted by obtained-at desc nulls-first, 4 visible columns with two pins, 50/page, page 2):

```
/inventory/catalog?inventory-catalog.f=or(acquisition__obtained_at gte 2026-01-01; acquisition__obtained_at is_empty)
  &inventory-catalog.sort=-acquisition__obtained_at__nullsfirst
  &inventory-catalog.cols=__caret~left,name,parameters,actions~right
  &inventory-catalog.size=50&inventory-catalog.page=2
```

(line breaks for readability only; spaces emit as `%20` and render as spaces in the address bar)

## Test contract (Vitest, rewrite-first)

The serialization unit suite is REWRITTEN against v2 before the module: emit shapes (clean-default → no params; saved-by-name; inline facets; pin suffixes incl. `attr:` keys), parse shapes (each facet; both encodings; repeated `f` group order), fallback taxonomy (unknown name / malformed group / bad numbers), round-trip property incl. multi-pin configs, and namespace isolation (two tables on one URL).
