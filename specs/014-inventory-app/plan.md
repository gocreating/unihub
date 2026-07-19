# Implementation Plan: Inventory App — Iteration 29 (Faithful drag preview)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 29; FR-011 amended. Constitution v1.22.0.

## Summary

The scenario organize DragOverlay becomes a faithful preview: it renders the SAME row content as the grabbed row (HolderOutlined + `RowContent`/ItemDisplay — spec line and parameter pairs included) at the SOURCE ROW's measured width (captured from the active node's rect at drag start), styled as the existing floating card (white, shadow, radius). The iteration-26 pointer-based drop projection stays (it is independent of overlay size). e2e locks the invariant mid-drag: overlay width matches the source row within 2px and the overlay contains the row's spec text, not just the name.

## Technical Context

Frontend-only: `scenarios/detail.tsx` (onDragStart captures the active node rect width into drag state; DragOverlay renders RowContent at that width, `data-testid="drag-overlay"`). Real-mouse e2e in `inventory-scenario.spec.ts` measuring mid-drag before mouse.up.

## Constitution Check

PASS — V (e2e lock first), VI (row content unchanged — same truncation/tooltip components).

## Complexity Tracking

*(none)*
