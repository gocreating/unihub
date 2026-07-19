# Implementation Plan: Inventory App — Iteration 39 (原價 never the sku, discount computation, currency inheritance)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 39; FR-029i extended. Constitution v1.22.0.

## Summary

Parser: 原價 drops out of sku extraction (單價 keeps both forms); the `原價X * N件` expression still yields the quantity; a new `原價X，N折` pattern records list price + discount, and `_finalize` computes sku = list × factor ONLY for items without an own paid amount; every derived sku inherits the row/acquisition currency when 備註 carries no token. Fixture-locked on the four reported items + the 盜墓筆記 paid-wins case; iteration-35's 原價-colon/無印 expectations revised to the hierarchy. Upsert re-import + verification.

## Constitution Check

PASS — V (fixtures first; sweep re-verifies verbatim preservation).

## Complexity Tracking

*(none)*
