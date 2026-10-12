# Repository Guidelines

## Critical rules
- Node 22+ (`.nvmrc`), npm workspaces. Install from the root with `npm ci`; never commit `node_modules`, `dist` or `.env*`.
- Before finishing any change run `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build` — CI (`.github/workflows/ci.yml`) runs the same steps on every PR to `main`.
- Keep business logic in pure functions under `apps/web/src/domain/` and cover it with unit tests; components stay thin.
- Money is stored as integer cents (`amountCents`); never use floats for amounts.

## Project structure
- `apps/web/` — React 19 + Vite + TypeScript budget app (sandbox for reviewed changes).
  - `src/domain/` pure logic (validation, totals, limits) · `src/components/` UI · `src/storage/` localStorage persistence · `src/test/setup.ts` test setup.
- `packages/code-reviewer/` — AI code review agent (git diff in, structured JSON verdict out). Work in progress.
- `context/` — change documents: `changes/<change-id>/` (plans, research, reviews), `archive/`, `foundation/`.

## Commands
| Command | What it does |
| --- | --- |
| `npm run dev` | Start the web app (Vite) |
| `npm test` | Vitest (jsdom + Testing Library) in all workspaces |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc` in all workspaces |
| `npm run format` / `format:check` | Prettier |
| `npm run build` | Production build |

## Conventions
- TypeScript strict mode; ESM only.
- Prettier: no semicolons, single quotes, width 100.
- Tests live next to the code as `*.test.ts(x)`; query the UI by role/label, not by CSS classes.
- Commits: short imperative subject (`Add category filter`), one logical change per PR.
