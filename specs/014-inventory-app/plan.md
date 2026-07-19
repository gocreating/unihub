# Implementation Plan: Inventory App — Iteration 33 (Finance-sourced symbols + staged item deletion)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 33; FR-006/FR-033 amended. Constitution v1.22.0.

## Summary

1. **Recovery (DONE first)** — the deleted legacy item (`2026:3:1` MONDAY DUCK) was restored via the ref-keyed upsert re-import.
2. **Staged item mutations (FR-006)** — `removeCard`/`handleCardOk` stop calling deleteItem/updateItem; removals collect into `removedIds`, edits mark cards dirty; `editSaveMutation` applies deletes + updates + updateAcquisition (scalars/factors/new items) on Save. RTL regression suite: remove/edit → zero API calls; Save → exactly the staged calls; unmount → none.
3. **Finance-sourced symbols (FR-033)** — `utils/currency.ts` drops the hardcoded map for a registry (`setCurrencySymbols`) seeded from `listCurrencies()` at the AppShell level (React Query cache shared with existing consumers); `currencySymbol`/`formatPrice` read it (code-only fallback). Tests seed the registry with the user's real symbols (TWD → NT$); the catalog price e2e regex widens for multi-char symbols.

## Constitution Check

PASS — V (regression tests first), VI (staged form semantics), IX untouched (no FX).

## Complexity Tracking

*(none)*
