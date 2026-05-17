# Research: UniHub Project Bootstrap

**Branch**: `001-project-bootstrap` | **Date**: 2026-05-17

## Decision 1: Attribute Storage Strategy (Constitution I compliance)

**Decision**: Hybrid typed-field + seeded AttributeDefinition

**Detail**: System attributes on core entities (Account: `name`, `account_type`,
`currency`; BalanceSheet: `date`, `label`, `base_currency`; Balance: `amount`;
ExchangeRate: `from_currency`, `to_currency`, `rate`, `date`) are stored as
typed Django model fields for performance and type safety. Corresponding
`AttributeDefinition` records with `is_system=True` are seeded via data
migration so the frontend renders all attributes uniformly through the same
UI path.

User-defined attributes are stored purely via `AttributeValue` (no model field
counterpart).

**Rationale**: Storing `amount` as `TextField` in `AttributeValue` would break
decimal arithmetic and require Python-side type casting for every net worth
calculation. PostgreSQL `DecimalField` enforces precision, enables indexed
ordering, and prevents silent data corruption. The frontend API contract presents
all attributes (system + user-defined) in a unified shape, satisfying the
"same rendering path" requirement of Constitution Principle I.

**Constitution I compliance note**: The constitution says "same rendering,
filtering, and storage path." The storage divergence is justified by the
arithmetic safety requirement. Rendering and filtering paths remain unified
via the serializer layer. This interpretation is recorded here as the canonical
reference for future domain implementations.

**Alternatives considered**:
- Pure EAV (all values in `AttributeValue` as `TextField`): rejected — decimal
  math on strings requires Python-side casting; no DB-level precision guarantee;
  sorting by amount would require CAST in every query.
- JSONB sidecar per entity: rejected — adds schema complexity without benefit
  over typed fields for a small fixed set of system attributes.

---

## Decision 2: Generic FK Strategy for AttributeValue

**Decision**: Django `ContentType` framework (`GenericForeignKey`)

**Detail**: `AttributeValue` uses `content_type` (FK to `django.contrib.contenttypes`)
+ `object_id` (PositiveIntegerField) + a `GenericForeignKey` accessor. This
allows any model in any domain app to have user-defined attributes without
any cross-app FK dependency.

**Rationale**: ContentType is Django's canonical solution for generic relations.
It is built-in, well-tested, and used by Django's own permission system.
It requires no cross-app imports and satisfies Constitution Principle II
(Domain Independence) — the `core` app does not need to know about `finance`.

**Alternatives considered**:
- Separate `AttributeValue` tables per domain: rejected — violates the unified
  model requirement of Constitution Principle I; duplicates infrastructure.
- String-based `app_label` + `model_name` + `object_id` without ContentType:
  rejected — ContentType is the Django-idiomatic solution and provides
  integrity checking.

---

## Decision 3: Closest-Prior Exchange Rate Query

**Decision**: Subquery with `DISTINCT ON` / `filter(date__lte=)` + `order_by('-date')[0]`

**Detail**: To find the exchange rate for a currency pair closest to (but not
after) a balance sheet date:

```python
ExchangeRate.objects.filter(
    from_currency=from_curr,
    to_currency=to_curr,
    date__lte=balance_sheet.date,
).order_by('-date').first()
```

For computing all rates needed for a balance sheet in one query, use a
`Subquery` with `OuterRef` or a window function. Given personal-tool data
volumes (< 1,000 rates), the simple approach is sufficient.

**Rationale**: Readable, no raw SQL required, performant for small datasets.
A composite index on `(from_currency, to_currency, date)` (already enforced
by the unique constraint) makes this O(log n).

**Alternatives considered**:
- Materialized view with pre-computed latest rates: rejected — overkill for
  a personal tool; stale on every rate edit.
- External exchange rate API: rejected by design (user requirement: self-
  contained system).

---

## Decision 4: PageTable Component Adaptation

**Decision**: Copy and adapt PageTable from ov-fleet; do not cross-reference

**Source**: `ov-pro-tools/apps/ov-fleet/frontend/src/components/PageTable/`

**Adaptations required**:
- Remove UmiJS-specific imports (`@@/plugin-locale`, `useIntl`, `@umijs/max`
  routing hooks) — replace with React Router 7 equivalents or remove if unused.
- `useStickyHeaderOffset` hook references a fixed `56px` header height — keep
  as-is, matching unihub's AppShell header height.
- Helper utilities (`widthForHeader`, `measureTextWidth`, `computeScrollX`)
  copy verbatim — no framework dependencies.

**Rationale**: ov-fleet uses `@umijs/max` (UmiJS) while unihub uses Vite +
React Router 7. Cross-repo import would pull in UmiJS as a transitive
dependency. A copied-and-adapted component is the clean approach and
allows unihub-specific tweaks without forking the upstream.

**Alternatives considered**:
- Extract PageTable to a shared npm package: rejected — premature abstraction;
  unihub is a personal project; package overhead is not justified.
- Use raw ProTable directly per page: rejected — violates Constitution
  Principle VI (PageTable as Default Tabular Component).

---

## Decision 5: Frontend Dashboard Layout

**Decision**: `ProLayout` from `@ant-design/pro-components` in a custom
`AppShell.tsx`, with React Router 7 for routing.

**Detail**: AppShell wraps the entire app in `ProLayout` with `layout="side"`
(fixed sidebar), a logo/title in the header, and menu items defined from a
static route config. Page transitions use React Router 7's `<Outlet />`.

**Rationale**: ProLayout provides the sidebar + header pattern matching the
ov-pro-tools reference. Unlike ov-fleet which uses UmiJS's built-in layout,
unihub uses Vite, so ProLayout is wired manually — but the visual and UX
result is identical.

**Alternatives considered**:
- Custom CSS sidebar: rejected — ProLayout handles collapsed state, responsive
  breakpoints, and theming out of the box.
- Ant Design `Layout` primitives only: rejected — ProLayout is a higher-level
  abstraction that matches the target design with less code.

---

## Decision 6: Net Worth Computation Location

**Decision**: Computed server-side; exposed as a dedicated endpoint
`GET /api/v1/finance/balance-sheets/{id}/net-worth/`

**Detail**: The endpoint returns per-currency subtotals and a base-currency
total. The closest-prior-rate lookup runs in the backend. Missing rate pairs
are flagged in the response (not silently zeroed).

**Rationale**: Centralises the rate-lookup logic; prevents the frontend from
needing access to the full ExchangeRate table just to compute a summary.
Frontend receives a ready-to-render object. Easy to add caching later.

**Alternatives considered**:
- Frontend-computed: rejected — requires loading all exchange rates and all
  balances; rate-lookup logic duplicated; harder to test.
- Stored computed column: rejected — invalidation on rate changes adds
  complexity without benefit at personal-tool scale.
