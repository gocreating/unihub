# personal-finance

Personal finance dashboard monorepo — visualize your financial life across portfolio, assets, cash flow, and balance sheet dimensions.

## Apps

| App | Path | Stack |
|-----|------|-------|
| Dashboard | `apps/dashboard/frontend/` | React 18 + Vite + Ant Design 5 + TanStack Query |

## Quick Start

```bash
cd apps/dashboard/frontend
pnpm install
pnpm dev
```

## Development

**Package manager**: pnpm (never npm or yarn)

**Quality loop** — run from `apps/dashboard/frontend/` after every change:

```bash
pnpm lint        # ESLint
pnpm typecheck   # TypeScript strict check
pnpm test        # Vitest
```

## Repository Structure

```text
apps/
  dashboard/
    frontend/    # React SPA — main visualization app
    specs/       # Feature specs (managed by speckit)
.claude/
  commands/      # Speckit slash commands
CLAUDE.md        # AI dev guidelines
```
