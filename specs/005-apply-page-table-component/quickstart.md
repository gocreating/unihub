# Quickstart: Apply PageTable Component

## Prerequisites

- Docker (for backend + DB)
- Node.js + pnpm (for frontend dev server)

## Start the App

```bash
# Terminal 1 — backend + DB
cd apps/unihub
docker compose -f docker-compose.local.yml up

# Terminal 2 — frontend dev server
cd apps/unihub/frontend
pnpm install
pnpm dev
```

Open `http://localhost:5173` and log in.

## Verify the Feature

### 1. Sticky Header (all pages)
1. Navigate to any Finance page (e.g., `/finance/currencies`)
2. If the table has enough rows, scroll down
3. **Expected**: Column headers remain fixed at the top of the viewport

### 2. Sticky Horizontal Scrollbar
1. Navigate to a wide table (e.g., `/finance/accounts` or `/finance/exchange-rates`)
2. Narrow the browser window until a horizontal scrollbar appears
3. Scroll down — the horizontal scrollbar should stay docked at the bottom of the viewport
4. Drag it — the table should scroll horizontally

### 3. Sticky Footer — Net Worth (balance-sheets detail)
1. Navigate to `/finance/balance-sheets`
2. Open any balance sheet detail
3. **Expected**: The net worth totals appear as a sticky footer row at the bottom of the table viewport, not as cards above the table
4. Scroll down — the footer stays visible

### 4. Auto-fit Column Widths
1. Open any Finance page
2. **Expected**: No column header text is truncated; columns fit their labels

### 5. Quality Loop

Run from `apps/unihub/frontend/`:

```bash
pnpm lint       # must be zero warnings
pnpm typecheck  # must be zero errors
pnpm test       # all tests must pass
```
