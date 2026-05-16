# Claude Development Guidelines — personal-finance Monorepo

Personal finance dashboard monorepo. Visualizes personal data across financial portfolio, asset list, cash flow, and balance sheet dimensions.

## Repository Navigation

```
apps/dashboard/frontend/     # React SPA (Vite + Ant Design 5 + TanStack Query)
apps/dashboard/frontend/CLAUDE.md   # Frontend-specific AI dev guidelines
apps/dashboard/specs/        # Feature specs (managed by speckit)
.claude/commands/            # Speckit slash commands
```

## Architecture Decisions

**Vite over @umijs/max**
- Rationale: Lighter build toolchain, faster HMR, standard React setup. No framework lock-in for a personal project.

**Ant Design 5 + Pro Components for UI**
- Rationale: Enterprise-grade admin framework with rich data display components (ProTable, StatisticCard, charts). Perfect for financial dashboards.

**TanStack React Query for data fetching**
- Rationale: Excellent caching, background sync, and loading/error states for API data.

**pnpm as frontend package manager**
- Rationale: Strict dependency resolution, disk efficient, mature workspace support.

**App-level isolation**
- Rationale: Each app has its own `package.json` and dependencies.

## Development Conventions

### TypeScript/React Style
- Strict TypeScript (`strict: true` in tsconfig)
- Functional components with hooks (no class components)
- Named exports preferred over default exports

### Tooling
- **Package manager**: `pnpm` — never use npm or yarn directly
- **Linter**: ESLint
- **Testing**: Vitest + React Testing Library

### Quality Loop

Run from `apps/dashboard/frontend/` after every change:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

### Git
- Branch from `main`
- Commit messages: imperative mood, concise

## New App Checklist

When creating a new app in `apps/`:
1. Create `apps/<app-name>/frontend/` with `src/`, `public/`, `specs/`
2. Create `package.json` with pnpm configuration
3. Create `README.md` and `CLAUDE.md`
4. Add to root workspace if needed

## Active Technologies
- TypeScript 5.7, React 18.3, Ant Design 5.24, @ant-design/pro-components 2.8, TanStack React Query 5, React Router 7, Vite 6, Vitest
