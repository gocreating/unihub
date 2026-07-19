# Implementation Plan: Inventory App — Iteration 38 (Comment icon vertically centered)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 38; FR-031 amended. Constitution v1.22.0.

## Summary

The ItemDisplay primary-line flex switches `alignItems: 'baseline'` → `'center'` (SVG anticons have no text baseline, so baseline alignment floats them off the text line). RTL locks the style.

## Constitution Check

PASS.

## Complexity Tracking

*(none)*
