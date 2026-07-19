# Implementation Plan: Inventory App — Iteration 34 (Reactive symbol registry)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 34; FR-033 amended. Constitution v1.22.0.

## Summary

`useCurrencySymbols()` (utils/currency + React Query): subscribes to `['finance','currencies']`, seeds the module registry synchronously in render, returns a stable map. Consumers: CatalogPage (map joins the column-def and width-measurement memo deps), AcquisitionForm, ScenarioDetailPage, AppShell (replaces the inline effect). `utils/finance.ts` drops its own map — `getCurrencySymbol` = `currencySymbol(code) || code`. RTL locks the race: currencies resolving AFTER list data still produces symbols.

## Constitution Check

PASS — V (race locked by RTL), I (finance domain is the single symbol authority).

## Complexity Tracking

*(none)*
