---
description: "Task list for Inventory App — Iteration 26 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 26 (New families, range values, triplet split, ItemDisplay)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-002b revised, FR-029g/FR-031 new. Constitution **v1.22.0**.

**Baseline**: Iteration 25 shipped at `c28f55f` (+ local `67efb6a`). Decisions in R26.1–R26.4.

## Phase 2: Core families + ranges

- [x] T001 Failing pytests (`tests/test_core_attributes.py` or the existing core suite): °F→°C affine both ways; time min/h→s; battery Ah→mAh; range `"5-10" kg` → value_number 5000 / value_number_max 10000; `"5~10"` variant; single value → max null; invalid range (min>max, garbage) → 400; ranges sort by min via `attr:` ordering
- [x] T002 Implement: `core/units.py` per-family converters (+3 families); `UNIT_FAMILY_CHOICES` + `AttributeValue.value_number_max` (+ migration); `compute_value_fields` 4-tuple; serializers/bulk-upsert expose `value_number_max`; T001 green; OpenAPI + `api-types.ts` regen (UNIT_FAMILY_OPTIONS + ItemParameter.value_number_max in the service layer)

## Phase 3: Parser triplet split

- [x] T003 Failing fixtures in `tests/test_legacy_parser.py`: `尺寸：14 x 15 x 5cm` → 長14/寬15/高5 cm and NO size param; `14X15X5cm`, `37*19.8cm` (2-part → 長/寬, decimal), `10 × 20 × 30 mm` unit honored; non-dimension 尺寸 values (e.g. `尺寸：L`) still → size param — then implement in `preview_legacy_import.py`; suite + sweep green
- [x] T004 Upsert re-import all 12 sheets (NO wipe — refs preserve scenario memberships); verify 長/寬/高 populated for known triplet rows and memberships/pks unchanged

## Phase 4: ItemDisplay + editor

- [x] T005 Failing RTL for `src/components/ItemDisplay/`: primary alias/name (+link, tooltip rules via ItemName), secondary spec (gated tooltip), `showParameters` renders localized `key: value` Tags incl. a range `5 - 10 kg`; then implement
- [x] T006 Adopt ItemDisplay at the four surfaces (catalog Item cell, AcquisitionForm cards, scenario pane rows, Add-modal rows) — RTL updates per surface; retire value-only badge composition from mixed lists (`attr:` columns stay value-only)
- [x] T007 Editor: family picker + units for temperature/time/battery; dimension value input → validated text input accepting `5` / `5-10`; locales ×2 (family labels, range validation msg); RTL updates
- [x] T008 e2e: create a definition with a new family; enter a range value; catalog + scenario surfaces show `key: value` pairs; existing suites green

## Phase 5: Polish

- [x] T009 Full loops both sides; docker rebuild; ALL inventory e2e; screenshots; commit (+push when SSH restored)
