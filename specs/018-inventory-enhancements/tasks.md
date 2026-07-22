# Tasks: Inventory App Enhancements (Issue #39)

**Input**: Design documents from `/specs/018-inventory-enhancements/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/acquisitions-api-delta.md](contracts/acquisitions-api-delta.md), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — backend test-first is constitution-mandated (Principle V) and the project preference is TDD everywhere (tests target the changed component itself, written before the implementation and failing first).

**Organization**: Grouped by user story; US1 (accumulated ownership), US2 (cm default), and US3 (default pins) are mutually independent and touch disjoint files, so the three story phases can proceed in any order or in parallel once written.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3

## Phase 1: Setup

No setup tasks — existing monorepo, all tooling in place. (Reminder for every task: frontend commands run from `apps/unihub/frontend/`, backend from `apps/unihub/backend/`.)

## Phase 2: Foundational

No foundational tasks — nothing blocks all three stories; the backend schema work only serves US1 and lives in that phase.

---

## Phase 3: User Story 1 — Accumulated cost respects the user's manual value (P1) 🎯 MVP

**Goal**: A manually set accumulated line (including cleared-to-zero) is stored verbatim on create, never auto-recalculated on any later edit, persists across sessions, and only the per-line Reset returns it to auto-derived behavior. Untouched lines keep (and improve) automatic derivation.

**Independent test**: Quickstart US1 walkthrough — create with cleared accumulated → reopen shows 0; edit items → still 0; Reset → derived value + live tracking again.

### Backend (test-first)

- [X] T001 [US1] Write FAILING pytest cases in apps/unihub/backend/tests/test_inventory_acquisitions.py: (a) create with client-sent accumulated factors (incl. `value=0`, `user_managed=true`) stores them verbatim — no derivation, response round-trips `user_managed`; (b) create with NO accumulated factor still derives per-currency rows with `user_managed=false` (existing behavior + new field); (c) create with two accumulated factors for the same currency → 400; (d) update replacing the factor set round-trips `user_managed` and never alters a user-managed value; (e) data_io descriptor for `inventory.costfactor` includes `user_managed` (auto_system_fields pickup). Naming: `test_<function>_<scenario>`. Run `uv run pytest tests/test_inventory_acquisitions.py` — new cases MUST fail.
- [X] T002 [US1] Add `user_managed = models.BooleanField(default=False)` to `CostFactor` in apps/unihub/backend/inventory/models.py (docstring: only consulted on accumulated rows) and generate migration apps/unihub/backend/inventory/migrations/0020_costfactor_user_managed.py (`uv run python manage.py makemigrations inventory`).
- [X] T003 [US1] Update apps/unihub/backend/inventory/serializers.py per contracts/acquisitions-api-delta.md: `CostFactorSerializer.fields += ["user_managed"]`; `validate()` — drop the create-time "system-managed" rejection, instead run `_reject_duplicate_accumulated` on create too; `create()` — if payload factors contain any accumulated, write payload verbatim (deriving nothing), else keep `_derive_accumulated(items_data) + factors`; `_derive_accumulated` rows carry `user_managed: False`; `_write_factors` persists `user_managed`.
- [X] T004 [US1] Backend quality loop green: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` (T001 cases now pass; full suite incl. test_import_legacy_html.py stays green — importer keeps deriving).

### Contract regeneration (Constitution IV — gate before frontend types use)

- [X] T005 [US1] Regenerate apps/unihub/frontend/src/generated/api-types.ts from the updated schema (`pnpm generate-types` against a running backend, or `uv run python manage.py spectacular --file` + openapi-typescript on the file if no server is available); verify `user_managed` appears on the CostFactor type and `pnpm typecheck` still passes.

### Frontend (test-first)

- [X] T006 [US1] Write FAILING RTL suite apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionForm.accumulated.test.tsx: (a) CREATE — clear the accumulated amount, Save → createAcquisition payload contains the accumulated factor `value '0'` with `user_managed: true` (no manual-only stripping); (b) CREATE untouched — accumulated line live-updates when an item's price changes (auto rows track: 500→600 moves the line), payload sends derived value with `user_managed: false`; (c) EDIT init — `initial.cost_factors` with `user_managed: true` renders the stored value and editing an item's price does NOT change it; (d) Reset click → value becomes derived Σ and the row tracks subsequent item edits again; (e) user-managed row whose currency loses all priced items stays rendered; auto row in the same situation disappears; (f) manual factors unaffected. Follow the existing zero-API-before-Save staging patterns from AcquisitionEdit.test.tsx. Run `pnpm test AcquisitionForm.accumulated` — MUST fail.
- [X] T007 [US1] Implement in apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionForm.tsx (research.md D3): `FactorRow.userManaged`; init from `f.user_managed` (edit) / `false` (new derived); accumulated PriceInput `onAmount` sets `userManaged: true`; reconcile effect — user rows frozen & kept, auto rows re-derived to fresh Σ, vanished-currency auto rows dropped, new currencies enter auto; `resetAccumulated` writes derived value + `userManaged: false`; create switches `manualPayload()` → full factor payload; both payload builders send `user_managed` per factor (update `CostFactorWrite` usage in apps/unihub/frontend/src/services/unihub-backend/inventory.ts from the regenerated types).
- [X] T008 [US1] Frontend loop green for the acquisition surface: `pnpm lint && pnpm typecheck && pnpm test` — T006 suite passes, existing AcquisitionEdit.test.tsx staging suite and CatalogPage.test.tsx stay green.

**Checkpoint**: US1 shippable — quickstart US1 walkthrough passes end-to-end.

---

## Phase 4: User Story 2 — Length values default to centimetres (P2)

**Goal**: Length-family unit selectors default to `cm` wherever no unit is chosen yet; stored units and canonical mm storage untouched.

**Independent test**: Add a length-family parameter row → unit select already reads "cm"; existing mm rows still show mm.

- [X] T009 [P] [US2] Write FAILING RTL cases in apps/unihub/frontend/src/components/ParameterRowsEditor/ParameterRowsEditor.test.tsx: (a) choosing a length-family key (e.g. 長度) pre-selects unit `cm`; (b) creating a NEW length-family definition pre-fills its row's unit `cm`; (c) a row initialized with stored unit `mm` still displays `mm`; (d) a weight-family key still defaults to `g` (first unit — other families unchanged). Run `pnpm test ParameterRowsEditor` — new cases MUST fail.
- [X] T010 [US2] Add `DEFAULT_FAMILY_UNIT: Record<UnitFamily, string>` (length → `'cm'`, every other family → its first listed unit) and `defaultUnitFor(family: UnitFamily): string` to apps/unihub/frontend/src/services/unihub-backend/inventory.ts; replace the three `UNIT_FAMILY_OPTIONS[...][0]` / `row.unit || units[0]` default sites in apps/unihub/frontend/src/components/ParameterRowsEditor/index.tsx (new-definition onSuccess, onKeyChange, dimension value-input fallback) with `defaultUnitFor(...)`. Keep `LENGTH_UNITS` order unchanged.
- [X] T011 [US2] Frontend loop green: `pnpm lint && pnpm typecheck && pnpm test` (T009 cases pass; item-modal and catalog suites unaffected).

**Checkpoint**: US2 shippable independently.

---

## Phase 5: User Story 3 — Toggle and Acquisition columns pinned by default (P3)

**Goal**: Fresh catalog visits pin Toggle + Acquisition left (Actions right); panel Reset restores exactly that; users can still unpin.

**Independent test**: Fresh catalog at a narrow viewport — horizontal scroll keeps Toggle+Acquisition flush left; Columns panel Reset restores the pins.

- [X] T012 [P] [US3] Update/extend RTL default-pin assertions in apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx: default render pins `__caret` AND `acquisition_summary` left (`fixedForKey` → 'left' surfaces as fixed-left cells/classes) with `actions` right; the existing "Reset restores default pins" case now expects both left pins. Run targeted test — new expectations MUST fail before T013.
- [X] T013 [US3] In apps/unihub/frontend/src/pages/inventory/catalog/index.tsx: add `pin: 'left'` to the `acquisition_summary` ColumnDef and bump the `useEntityTable` key `'inventory-catalog-v7'` → `'inventory-catalog-v8'` (update the version comment — iteration-018 defaults: Acquisition pinned left).
- [X] T014 [US3] Update apps/unihub/frontend/e2e/column-pin.spec.ts catalog scenarios: "catalog defaults" and "Reset restores defaults" now assert TWO contiguous left-fixed columns (Toggle + Acquisition flush/contiguous ±1.5px mid-scroll at the 600px viewport; selectors use `tr.ant-table-row`, never `tr:first-child`). Run `pnpm exec playwright test e2e/column-pin.spec.ts` — 10/10 (or new count) green.
- [X] T015 [US3] Frontend loop green: `pnpm lint && pnpm typecheck && pnpm test`.

**Checkpoint**: US3 shippable independently.

---

## Phase 6: Polish & Cross-Cutting

- [X] T016 Full quality loops both sides from scratch: backend `uv run ruff format . && uv run ruff check . --fix && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (build is stricter than typecheck — required before commit).
- [X] T017 Manual quickstart.md walkthrough of all three stories against the local stack (docker-compose.local.yml or dev servers); verify catalog totals/net-cost render 0-valued accumulated correctly (zero-cost lines stay hidden per iteration-15 rule — confirm no regression).
- [X] T018 Update the Active Feature blurb in CLAUDE.md (SPECKIT block) with the shipped outcome (what landed, migration 0020, catalog key v8, any lessons), keeping links to plan/spec/research.

## Dependencies

- **US1 chain**: T001 → T002 → T003 → T004 → T005 → (T006 → T007 → T008). T006 may be written in parallel with T002–T005 (different repo side) but only runs green after T007.
- **US2 chain**: T009 → T010 → T011. Independent of US1/US3.
- **US3 chain**: T012 → T013 → T014 → T015. Independent of US1/US2.
- **Polish**: T016–T018 after all selected stories.
- No cross-story file overlap: US1 = acquisitions form + backend inventory app; US2 = ParameterRowsEditor + service constants; US3 = catalog page + e2e. (US1 T007 and US2 T010 both touch services/unihub-backend/inventory.ts — coordinate that one file if running truly concurrently.)

## Parallel Execution Examples

- After T005: run T006 (US1 frontend tests) while T009 (US2 tests) and T012 (US3 tests) proceed — three independent test-authoring tracks.
- T009/T012 can start immediately (no backend dependency) even before US1 finishes.

## Implementation Strategy

MVP = Phase 3 (US1) alone — it fixes the data-corruption bugs and is independently shippable. US2 and US3 are small, isolated increments; deliver in priority order or opportunistically in parallel. Suggested single-PR flow for this feature: US1 → US2 → US3 → Polish, one branch (`018-inventory-enhancements`), committing per checkpoint.
