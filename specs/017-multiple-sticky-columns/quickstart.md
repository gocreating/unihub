# Quickstart: Multiple Sticky Columns

**Feature**: 017-multiple-sticky-columns

## Where the work lives

| Area | Path |
|------|------|
| Pin state model + hook | `apps/unihub/frontend/src/components/EntityToolbar/types.ts`, `hooks/useColumnConfig.ts` |
| Panel UI | `apps/unihub/frontend/src/components/EntityToolbar/ColumnPanel.tsx` |
| Combined table hook | `apps/unihub/frontend/src/components/EntityToolbar/useEntityTable.ts` |
| Consumer pages | `src/pages/finance/{accounts,currencies,exchange-rates,balance-sheets}/index.tsx`, `src/pages/inventory/{catalog,scenarios}/index.tsx` |
| Locales | `src/locales/en-US/pages.ts`, `src/locales/zh-TW/pages.ts` |
| e2e | `apps/unihub/frontend/e2e/column-pin.spec.ts` |
| Constitution amendment | `.specify/memory/constitution.md` (Principle XII → v1.23.0) |

## Dev loop (from `apps/unihub/frontend/`)

```bash
pnpm test src/components/EntityToolbar   # focused unit/RTL loop (TDD: write these first)
pnpm lint && pnpm typecheck && pnpm test # constitution V gate
pnpm build                               # stricter than typecheck — run before committing (project memory)
```

## e2e (real-browser sticky geometry)

```bash
# Terminal 1 — backend
cd apps/unihub && docker compose -f docker-compose.local.yml up
# Terminal 2 — frontend dev server
cd apps/unihub/frontend && pnpm dev
# Terminal 3 — run the pin spec (600px viewport creates natural horizontal overflow)
cd apps/unihub/frontend && pnpm test:e2e --grep "column-pin"
```

Login in e2e: `root` / `root`. Geometry assertions use element bounding boxes (per the visual-geometry rule — JSDOM style checks don't count).

## Manual smoke

1. Open Finance → Accounts at a narrow window (~600–900px wide) so the table overflows.
2. Toolbar → Columns: every row now has two pushpins (left/right). Pin two columns left, one right → Apply.
3. Scroll horizontally: left group stays flush left (single shadow after the group), right column flush right.
4. Reset in the Columns panel → default pins return (Accounts: none; Catalog: caret left + Actions right).
5. Inventory → Catalog: confirm caret + Actions pinned by default, expand a row, scroll — caret column stays put.
