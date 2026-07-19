# Implementation Plan: Inventory App — Iteration 32 (Full currency label on price selects)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 32; FR-033 amended. Constitution v1.22.0.

## Summary

`CurrencySymbolSelect` drops its symbol-only `labelRender` so the selected display equals the full option label (`TWD $`); placeholder behavior while the amount is empty/0 is unchanged. Applies to both consumers (cost-factor rows via PriceInput, item-modal SKU price). RTL expectations flip accordingly.

## Constitution Check

PASS — V (RTL first), VIII (labels are code+symbol — locale-neutral).

## Complexity Tracking

*(none)*
