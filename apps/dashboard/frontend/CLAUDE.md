# Dashboard Frontend — AI Dev Guidelines

React SPA for the personal finance dashboard.

## Tech Stack

- **Runtime**: React 18.3 + TypeScript 5.7 (strict)
- **Build**: Vite 6
- **UI**: Ant Design 5 + Pro Components
- **Data fetching**: TanStack React Query 5
- **Routing**: React Router 7
- **Testing**: Vitest + React Testing Library

## Project Structure

```
src/
  components/          # Feature components (colocated tests)
    AppShell/          # Navigation layout
    OverviewPage/      # Net worth + summary KPIs
    PortfolioPage/     # Investment holdings
    AssetsPage/        # Asset registry
    CashFlowPage/      # Income & expenses
    BalanceSheetPage/  # Assets vs liabilities
  hooks/               # Custom React hooks
  types/               # Shared TypeScript types
  utils/               # Pure utility functions
  App.tsx              # Root with providers + routes
  main.tsx             # Entry point
```

## Quality Loop

```bash
pnpm lint       # ESLint (zero warnings in CI)
pnpm typecheck  # tsc --noEmit (strict)
pnpm test       # Vitest
```

## Style Rules

- Strict TypeScript — no `any`, no `// @ts-ignore`
- Named exports from all component files
- Path alias `@/` maps to `src/`
- No inline styles on root layout elements — use Ant Design tokens
