# Research — Inventory App Enhancements (018, Issue #39)

**Date**: 2026-07-22 | **Spec**: [spec.md](spec.md)

No NEEDS CLARIFICATION markers remained in the Technical Context; the decisions
below resolve the design unknowns discovered while grounding the spec in the
current codebase.

## Current-state findings (why the bugs happen)

- **Create path discards the user's accumulated value.**
  `AcquisitionForm.createMutation` sends ONLY manual factors
  (`manualPayload()`); `AcquisitionSerializer.validate` REJECTS client-sent
  accumulated factors on create ("The accumulated factor is system-managed")
  and `create()` always writes `_derive_accumulated(items_data)` — Σ(sku_price
  × quantity) per currency. The accumulated row shown in the form (which the
  user may have cleared to 0) is never transmitted, so the stored acquisition
  "un-zeroes" itself. (`AcquisitionForm.tsx:293-309`,
  `inventory/serializers.py:280-329`.)
- **Nothing distinguishes a user-set accumulated value from a derived one.**
  `CostFactor` has no override flag, so neither the backend nor a reopened
  edit form can know the difference. The form's reconcile effect
  (`AcquisitionForm.tsx:191-216`) blindly preserves EVERY existing accumulated
  row for currencies that still have priced items — which also means derived
  rows go stale (an auto row does NOT live-update when an item's price
  changes within the same currency), and rows for currencies whose priced
  items disappear are dropped even if user-set.
- **Update path replaces the whole factor set verbatim** (`update()` deletes +
  rewrites from payload), so persistence of an override flag through the
  existing update contract is straightforward.
- **Unit defaults** all funnel through "first unit of the family":
  `UNIT_FAMILY_OPTIONS[family][0]` at `ParameterRowsEditor/index.tsx:116`
  (new-definition flow), `:215` (key change), and `row.unit || units[0]`
  at `:237` (display fallback for a unit-less row). `LENGTH_UNITS` is
  `['mm', 'cm', 'm', 'in']`. Backend `DEFAULT_LENGTH_UNIT = "mm"`
  (`core/units.py:45`) is re-exported but has no call sites — canonical
  storage (mm) is untouched by an entry-default change.
- **Catalog pins** seed from `ColumnDef.pin` (feature 017): `__caret` is
  `pin: 'left'`, `actions` is `pin: 'right'`, `acquisition_summary` (order 0)
  has no pin (`pages/inventory/catalog/index.tsx:161-186`). The page's
  `useEntityTable` key is `'inventory-catalog-v7'` with an established
  bump-on-default-change convention (`index.tsx:192-195`). e2e
  `column-pin.spec.ts` already locks catalog default pins + Reset.

## D1 — Persist the override as `CostFactor.user_managed`

- **Decision**: Add `user_managed = models.BooleanField(default=False)` to
  `CostFactor` (migration 0020). Meaningful only on `type="accumulated"` rows;
  manual rows keep `False` (they are always user data — the flag is simply
  not consulted). Expose it through `CostFactorSerializer` (read/write) and
  the regenerated OpenAPI types.
- **Rationale**: The flag must survive reopening the edit form in a later
  session (FR-004), so it has to live in the database. Riding on the existing
  per-currency accumulated row gives per-currency override scope (spec
  assumption) for free and keeps the ≥1-factor and unique-accumulated
  invariants unchanged.
- **Alternatives considered**:
  - *Acquisition-level flag* — rejected: wrong granularity for multi-currency
    acquisitions (zeroing TWD must not freeze a future JPY line).
  - *Sentinel convention (e.g. "a stored accumulated that differs from the
    derived value is user-managed")* — rejected: ambiguous (a stale derived
    value is indistinguishable from an override) and breaks when item prices
    later change to coincidentally match.
  - *Separate override table* — rejected: heavier than a boolean, nothing else
    would use it.
- **data_io**: the CostFactor `TableDescriptor` uses
  `auto_system_fields(CostFactor, …)` (`inventory/apps.py`), so the new model
  field flows into import/export automatically — verify by asserting the
  descriptor's field list in a test rather than editing the descriptor.

## D2 — Create contract: client-sent accumulated wins; derive only when absent

- **Decision**: On create, drop the "system-managed" rejection. New rule: if
  the payload's `cost_factors` contain ANY accumulated factor, the server
  stores the payload's accumulated set verbatim (validating at most one per
  currency, as update already does) and derives nothing; if the payload
  contains NO accumulated factor, the server derives per-currency accumulated
  rows exactly as today (each `user_managed=False`). The frontend create path
  switches from `manualPayload()` to the full factor list (accumulated rows
  carry their displayed value + `user_managed`).
- **Rationale**: FR-001 requires the saved values to be exactly what the form
  displayed. The form always renders the complete accumulated set, so "client
  sends all ⇒ server trusts all" is the simplest contract with one derivation
  owner per request. Deriving-when-absent preserves back-compat for every
  other producer (legacy HTML importer via serializer-independent code paths,
  scripts, API users) and keeps the ≥1-factor invariant.
- **Alternatives considered**:
  - *Create-then-update second request* — rejected: two round trips, a window
    where the wrong value is stored, and it would still need D1.
  - *Per-currency merge (derive only currencies the client omitted)* —
    rejected: no consumer needs it; the form always sends the full set. Note
    the unique-accumulated constraint still protects against duplicates.

## D3 — Reconcile semantics in the form: auto rows track, user rows freeze

- **Decision**: `FactorRow` gains `userManaged`. The reconcile effect becomes:
  for each currency with priced items — keep a user-managed row as-is, update
  an auto row's value to the fresh derived Σ, create a missing row as auto at
  the derived value; for currencies with no priced items — keep user-managed
  rows, drop auto rows. Editing an accumulated row's amount (including
  clearing; the input already coerces clear → '0') sets `userManaged: true`.
  The per-row Reset control writes the derived value AND clears `userManaged`.
  Both payload builders send `user_managed` per factor.
- **Rationale**: Implements FR-002/FR-003/FR-005/FR-006 and, as a side effect,
  fixes the latent staleness where a derived row kept its old value after an
  item price change in the same currency (today's effect cannot tell override
  from stale because no flag exists).
- **Alternatives considered**: keeping the "preserve every existing row"
  behavior and only fixing create — rejected: violates FR-006/AS-6 (auto rows
  must track item edits) and leaves the edit-session semantics ambiguous.

## D4 — Length default: explicit per-family default map, frontend only

- **Decision**: Add `DEFAULT_FAMILY_UNIT: Record<UnitFamily, string>` (length →
  `'cm'`; every other family → its first listed unit) plus a
  `defaultUnitFor(family)` helper in `services/unihub-backend/inventory.ts`,
  and use it at the three `[0]` sites in `ParameterRowsEditor`. Dropdown
  option order stays `mm, cm, m, in`. Backend `DEFAULT_LENGTH_UNIT` and
  canonical-mm storage are untouched.
- **Rationale**: FR-007 is an entry-default concern; an explicit map states
  the intent and leaves the natural ascending option order alone. The backend
  constant has no call sites, and changing canonical units would reinterpret
  stored numbers — out of scope and dangerous.
- **Alternatives considered**:
  - *Reorder `LENGTH_UNITS` to put cm first* — rejected: couples dropdown
    order to the default and reorders a user-visible list for no reason.
  - *Backend-driven default* — rejected: no API surface carries "entry
    default" today; a constants change in the typed frontend service layer is
    strictly smaller.

## D5 — Pin default: seed `acquisition_summary` left + bump the catalog key

- **Decision**: Add `pin: 'left'` to the catalog's `acquisition_summary`
  ColumnDef (Toggle `__caret` already left, `actions` already right) and bump
  the `useEntityTable` key to `'inventory-catalog-v8'`, following the
  established convention so previously-seen defaults don't shadow the new
  seed. Update the catalog RTL default-pin assertions and the
  `column-pin.spec.ts` catalog-defaults/Reset e2e to expect two left pins.
- **Rationale**: Feature 017 made defaults purely a ColumnDef seed;
  `fixedForKey` + `pinFingerprint` already propagate any number of left pins,
  and rc-table contiguity is guaranteed because `__caret` (order −1) and
  `acquisition_summary` (order 0) are adjacent and first in display order.
- **Alternatives considered**: none credible — this is the mechanism the
  pinning feature shipped for.
