# Implementation Plan: Inventory App — Iteration 27 (Emoji keys, price format, catalog/nav/modal polish, data refresh)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 27; FR-032/033/034 new; FR-003/003a/006/011/031 amended. Constitution v1.22.0.

## Summary

1. **Parameter emoji (FR-032)** — `AttributeDefinition.emoji` (optional, migration seeds 🎨 color / 👕 size / ⚖ weight / 📏 length·width·height / 🧴 volume); serializer + OpenAPI/types; the inline definition-creation form gains an emoji input; `parameterPairs`/key picker render a set emoji as a prefix before the localized key, **monochrome via the transparent-color + `text-shadow: 0 0 0 currentColor` silhouette technique** (R27.2) so it inherits the text color.
2. **Price format (FR-033)** — one shared currency module (symbol map + `formatPrice(code, value)` → `"TWD $ 129"`, `-` when 0/empty) adopted at every display surface (catalog SKU column, net cost, acquisition summary, card price tag, cost totals); a shared **PriceInput** ([symbol select][numeric], placeholder while empty/0) replaces the ad-hoc price+currency field pairs (item modal SKU price, cost-factor rows).
3. **Catalog (FR-003/003a/031)** — Actions column pinned sticky-right by default (column-state version bump); Item column width measured from the primary name line only, spec truncating at the column width; the Remark column renders one ellipsised line with a gated tooltip (width capped to the render).
4. **Shell & panes (FR-034/006/011)** — side-nav items become real router hyperlinks; acquisition item cards in the same row stretch to equal height; the Add-items modal grows wider and viewport-anchors its bottom (search box fixed, results scroll inside).
5. **Data refresh** — the updated legacy sheets re-import via the ref-keyed upsert (no wipe; scenarios/PKs preserved); coverage sweep re-verifies on the new content.

## Technical Context

Backend: one core migration (emoji field + seed); serializer/OpenAPI regen; no inventory schema change. Frontend: shared currency module + PriceInput, emoji rendering in ItemDisplay/format + editor, catalog column config (right-pin support + measurement fix), AppShell links, modal geometry. Data: host-side upsert import. Tests first at each step (pytest, RTL, e2e geometry locks).

## Constitution Check

PASS — I (emoji lives on core AttributeDefinition; data_io auto-fields pick it up), IV (types regen before frontend adoption), V (TDD throughout), VI (single "-" placeholder for zero amounts; gated tooltips for truncation), VIII (all new labels/placeholders in both locales; ICU untouched).

## Complexity Tracking

*(none)*
