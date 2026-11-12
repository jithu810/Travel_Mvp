# Web checks

Used by the workspace `travel-web-checks` skill. Optional extras from the caller: `build`, `db`,
`creation`, `e2e`.

Run in this repo. Report results only — don't edit files or fix dependencies.

## Steps
1. Record `git rev-parse --short HEAD` and `git status --short --branch`.
2. Pick checks by tier (see [CLAUDE.md](../../CLAUDE.md)); an explicit request for more wins:
   - Small cosmetic: inspect the diff and visuals where useful; no tests/typecheck/lint/build.
   - Focused: affected tests, `npm run typecheck` for changed TS contracts, scoped lint.
   - Major/sensitive: relevant regression/integration suites, typecheck and lint; the full applicable
     suite for broad impact or uncertain coverage; build when affected.
   - Reuse passing results for an unchanged snapshot; after fixes rerun affected checks only.
3. Only if requested or clearly relevant:
   - `build` → `npm run build` (local only; never deploys)
   - `db` → `npm run test:db` (synthetic local fixtures)
   - `creation` → `npm run test:creation`
   - `e2e` → `npm run test:e2e`
4. Before Playwright or DB suites, confirm from their config/scripts that they target an isolated local
   target with synthetic fixtures. If a suite would hit a hosted Supabase project, stop and report.
5. `typecheck` (`next typegen`) and `build` load local env files at runtime: never print or capture env
   values, and don't share `.next` output.
6. Never run `npm run seed:demo`, hosted SQL, migrations or seeds as verification.

## Output
```text
Repo / revision / dirty files:
typecheck:  not run | pass | fail — first error: <file:line message>
lint:       not run | pass | fail — first error: <file:line rule>
build:      not run | pass | fail — <summary>
test:db / test:creation / test:e2e: not run | pass | fail — <summary>
Skipped and why:
```
