# Implementation Plan: Inventory App — Iteration 21 (Flat-mode acquisition Edit link)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-12 iteration 21; FR-003 revision. Constitution v1.22.0.

## Summary

One confirmed critical bug: the Catalog's flat mode (item-level filter/sort) renders only item rows, and the acquisition Edit hyperlink existed only on acquisition rows — filtered results therefore lost the Edit affordance entirely (and with it the only path to Delete since iteration 19). Fix: in flat mode, every item row's Actions cell carries its parent acquisition's Edit hyperlink (identical href/appearance/SPA-left-click semantics), ahead of Deprecate/Restore. Tree-mode child rows are unchanged.

## Technical Context

Frontend-only, one render branch in `catalog/index.tsx` (the non-acquisition actions cell gains the link when `flatMode && r.acquisition`). RTL first (flat mode → item rows expose the Edit anchor with the right href; tree-mode child rows still don't); e2e extends the existing flatten spec. No API/schema/locale change.

## Constitution Check

PASS — V (TDD: RTL before fix), VI/VII untouched patterns, no new text (reuses `common.edit`).

## Project Structure

```text
apps/unihub/frontend/src/pages/inventory/catalog/index.tsx (+ CatalogPage.test.tsx)
apps/unihub/frontend/e2e/inventory-catalog.spec.ts
```

## Phase 0 — Research

R21.1 (research.md): root cause confirmed by inspection — `render` returns only `itemActions(r)` for non-acquisition rows; flat mode has no acquisition rows.

## Complexity Tracking

*(none)*
