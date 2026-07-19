# Implementation Plan: Inventory — Iteration 47 (deprecate-modal item preview)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: Session 2026-07-19 (iteration 47) — FR-003c new.

## Summary

One frontend change: the catalog's Deprecate modal renders a **preview of the target item** above the confirmation line — the shared `ItemDisplay` (FR-031: alias-preferred name + URL link, spec, remark icon, parameter pairs via the iteration-46 `ParameterTag`) inside a bordered container — so the user verifies it is the correct item before confirming. `deprecateTarget` already holds the full `Item` (including `parameters`); pure pass-through. Date picker + unknown-time checkbox unchanged.

## Technical Context

**Language/Version**: TypeScript 5.7, React 18.3, AntD 5.24; frontend only.
**Testing**: Vitest/RTL (modal preview content); existing e2e untouched (no geometry change).
**Constraints**: constitution v1.22.0 — no new i18n keys needed (preview is data, not chrome); ItemDisplay reuse per FR-031.
**Scale/Scope**: 1 file (`pages/inventory/catalog/index.tsx`) + CatalogPage RTL test.

## Constitution Check

- I: session recorded; FR-003c added. ✓
- II/III: RTL lock written with the change; full loops before commit. ✓
- VI: ItemDisplay carries its own gated tooltips; modal layout keeps Cancel-left/primary-right. ✓

## Project Structure

```text
apps/unihub/frontend/src/pages/inventory/catalog/index.tsx      # modal preview
apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx  # RTL lock
```

## Phase 0 — Research

Measured: the modal renders only `deprecate.confirm` text + DatePicker + Checkbox; `deprecateTarget: Item` is in scope with `parameters` (items list payload). `ItemDisplay` + `parameterPairs` already imported by the page.

## Phase 1 — Design

Insert above the confirm paragraph:

```tsx
<div style={{ border: '1px solid rgba(5,5,5,0.1)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
  <ItemDisplay item={deprecateTarget} parameters={deprecateTarget.parameters} showParameters />
</div>
```

(rendered when `deprecateTarget` is set; no truncate — the modal wraps).

RTL: open Deprecate on a seeded item → modal shows the item name, spec, and a parameter tag; confirm still PATCHes flag+ts.

## Phase 2 — Tasks

T001 RTL lock first → T002 implement → T003 loops/rebuild/e2e smoke/ship/CI.
