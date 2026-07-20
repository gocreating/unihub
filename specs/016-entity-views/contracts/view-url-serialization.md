# Contract: View URL Serialization

**Module**: `apps/unihub/frontend/src/components/EntityViews/serialization.ts`
**Consumers**: `useEntityViews` (read/write), deep links, e2e tests.

## Grammar

```
page-url      = <route> "?" *( other-param "&" ) view-param *( "&" view-param )
view-param    = "view[" table-key "]=" encoded-inner     ; one per table on the page
table-key     = 1*( ALPHA / DIGIT / "-" )                ; e.g. inventory-catalog
encoded-inner = URL-encoded( inner )
inner         = pair *( "&" pair )
pair          = key "=" URL-encoded( value )
key           = "type" / "id" / "filters" / "ordering" / "columns" / "pin" / "page_size" / "page"
```

- `type=inline` — full state carried by the remaining keys; absent keys mean the table default for that facet.
- `type=saved` — `id` required; remaining keys are **overrides** applied on top of the stored config, facet-whole (an `ordering` override replaces the entire stored sort list, not merges).

## Key semantics

| Key | Format | Maps to |
|-----|--------|---------|
| `filters` | JSON: `[{"logic":"and","conditions":[{"attr":"…","op":"…","val":…}]}]` | `ViewConfig.filters` (exactly the API `filters` groups shape) |
| `ordering` | `rulesToOrdering` string: `-field__nullsfirst,other` | `ViewConfig.sort` via `orderingToRules` |
| `columns` | comma-joined visible column keys in display order: `name,spec,attr:abc123` | visible subset of `ViewConfig.columns`; hidden columns reconstructed from page defaults |
| `pin` | `left` / `right` / `left,right` | `stickyLeft` / `stickyRight` |
| `page_size` | int (25/50/100) | `pageSize` |
| `page` | 1-based int | transient page position (offset = (page−1)×pageSize); never persisted into a saved view |

## Behavioral contract

1. **Continuous sync**: the active tab's effective state is always reflected in `view[<tableKey>]` (history `replace` on config edits; `push` on tab switch). Copying the URL at any moment reproduces the visible state (SC-003).
2. **Inbound navigation**: on mount and on every query-string change, the param is parsed; if it describes a state different from the current active tab, the described view opens/activates (spec FR-006). Params for other namespaces are untouched.
3. **Saved + overrides**: produces a tab for view `id` with overrides applied and the dirty marker on (config ≠ stored).
4. **Fallbacks (FR-008)** — never break the page:
   - unknown/foreign/deleted `id` → Tabular default + non-blocking `message.warning` (i18n key `common.entityViews.unresolvedView`);
   - malformed inner string / bad JSON in `filters` / non-numeric `page_size`/`page` / unknown `type` → Tabular default + warning;
   - unknown individual column keys or filter/sort fields → dropped silently (partial apply, FR-021 / R10).
5. **Round-trip guarantee** (unit-tested): for any valid `ViewConfig` C and page defaults D, `parse(serialize(C, D), D)` normalizes equal to C on the visible facets (hidden-column order excepted, documented in data-model §3).
6. **Encoding**: inner values use `encodeURIComponent`; the inner string as a whole is the param value (standard `URLSearchParams` handling at the outer level). Square brackets in the param NAME are tolerated in both raw and percent-encoded forms when parsing.

## Examples

Inline (catalog filtered to 2026, sorted by obtained-at desc nulls-first, 3 visible columns, both pins, 50/page, page 2):

```
/inventory/catalog?view[inventory-catalog]=type%3Dinline%26filters%3D%5B%7B%22logic%22%3A%22and%22%2C%22conditions%22%3A%5B%7B%22attr%22%3A%22acquisition__obtained_at%22%2C%22op%22%3A%22gte%22%2C%22val%22%3A%222026-01-01%22%7D%5D%7D%5D%26ordering%3D-acquisition__obtained_at__nullsfirst%26columns%3Dname%2Cparameters%2Cacquisition%26pin%3Dleft%2Cright%26page_size%3D50%26page%3D2
```

Saved with one override (open view `Vx3kQ9aB2cD1`, force 100/page):

```
/inventory/catalog?view[inventory-catalog]=type%3Dsaved%26id%3DVx3kQ9aB2cD1%26page_size%3D100
```
