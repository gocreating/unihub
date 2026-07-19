# Implementation Plan: Inventory App — Iteration 42 (Paren size annotations, range dims parts, name-matched 原價, waist, hard-error imports)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 42; FR-029k new. Constitution v1.22.0.

## Summary

1. **Dims range parts** — the dims regex number atom widens to `a(?:~b)?` in the shared/per-unit forms (`160x200x18~28cm`).
2. **Paren size rule** — size `LABEL（inner）`: the inner text processes as a sub-unit (recursion into _apply_unit); size = LABEL; supersedes the iteration-36 verbatim-keep (test updated: `尺寸：S (40cm x 80cm)` → size S).
3. **腰圍 seed** — migration 0019 (waist, dimension/length, 📏) + colon-optional keyed pattern + SYSTEM maps + locales + importer measure key.
4. **Name-matched 原價** — `_finalize` collects `(fragment)原價(amount)[*N 組/件/個]` over the acquisition's 備註 text; when own-price rows are partial, assignments override matched items' skus (+qty), including the header holding a shared total; unique-match guard; currency inheritance follows.
5. **Hard-error imports** — the command wraps each year in `transaction.atomic()` and re-raises validation errors with `legacy_ref` + item-name context.
6. Fixture-locked on all reported rows + HEATTECH/雨傘王 regressions; upsert re-import + verification.

## Constitution Check

PASS — V (fixtures first; sweep re-verifies verbatim), I (waist seeded by migration).

## Complexity Tracking

*(none)*
