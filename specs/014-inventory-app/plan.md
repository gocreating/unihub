# Implementation Plan: Inventory App — Iteration 37 (Comment icon suffixed to the name)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 37; FR-031 amended. Constitution v1.22.0.

## Summary

One layout change in ItemDisplay: the primary-line name wrapper switches from `flex: 1 1 auto` (icons pushed to the row edge) to `flex: 0 1 auto` (shrink-to-fit — icons suffix the text; truncation unchanged). RTL locks the style.

## Constitution Check

PASS.

## Complexity Tracking

*(none)*
