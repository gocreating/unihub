# Dashboard Frontend — AI Dev Guidelines

React SPA for the unihub personal dashboard.

> **Reference**: `ov-fleet/frontend/` (`/Users/gocreating/projects/OverviewCorporation/ov-pro-tools/apps/ov-fleet/frontend`) — follow its service layer, component organization, and data-fetching patterns.

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
  pages/               # Route-level page components, one folder per domain
    finance/           # Finance domain pages (entities: Account, Transaction, …)
    visiting/          # Visiting domain pages (entities: Place, Visit, Trip, …)
    exception/         # 403, 404, 500 error pages
  components/          # Reusable cross-domain components
    AppShell/          # Navigation shell — one nav section added per domain
    PageTable/         # Unified table with sticky header/footer (ov-fleet pattern)
  services/            # API service layer — one file per domain backend
    finance.ts         # Finance backend endpoints
    visiting.ts        # Visiting backend endpoints
    types.ts           # Barrel re-export of all API types
    index.ts           # API base URLs + service exports
  hooks/               # Custom React hooks (useXxx.ts)
  utils/               # Pure utility functions
  generated/           # Types auto-generated from openapi.yaml (do not hand-edit)
  App.tsx              # Root with providers + routes
  main.tsx             # Entry point
```

## Service Layer Conventions (from ov-fleet)

- All API calls go through `src/services/` — never fetch directly in components.
- Each domain backend gets its own service file (`finance.ts`, `visiting.ts`, …).
- API response types come from `src/generated/` (auto-generated via `openapi-typescript` from each backend's `openapi.yaml`). Do **not** hand-write API response types.
- TanStack Query key convention: `['domain', 'resource', ...params]` (e.g. `['finance', 'accounts']`, `['visiting', 'places']`).

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
- Page-specific sub-components are colocated in the page folder (e.g. `pages/finance/PortfolioFilterBuilder.tsx`)
- Custom hooks live in `hooks/` or colocated as `useXxx.ts` beside the component that owns them
