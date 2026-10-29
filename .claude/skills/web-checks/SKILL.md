---
name: web-checks
description: Select and run proportionate Web checks in D:/Travel_Mvp and summarize results. Use after Web changes or when asked to check the web app.
argument-hint: "[optional: build | db | e2e | creation]"
---

# Web checks

Extra checks requested: $ARGUMENTS

Run in `D:/Travel_Mvp`. Report results only. Do not edit files or fix dependencies.

## Steps
1. Record `git rev-parse --short HEAD` and `git status --short --branch`.
2. Select checks using the shared workflow's proportional verification tier; an explicit request for broader checks takes precedence:
   - Small cosmetic change: inspect diff and visual appearance where useful; no tests/typecheck/lint/build by default.
   - Focused behavior change: run affected tests, typecheck for TypeScript contract changes and scoped lint where useful.
   - Major/sensitive change: relevant regression/integration suites, typecheck and lint; full applicable suite for broad impact or uncertain coverage, build when affected.
   - Reuse passing checks for an unchanged snapshot; rerun affected checks after fixes and broaden only for failures or discovered risk.
3. Run only if requested or clearly relevant to the change:
   - `build` → `npm run build` (a local build only; it never deploys)
   - `db` → `npm run test:db` (synthetic local fixtures)
   - `creation` → `npm run test:creation`
   - `e2e` → `npm run test:e2e`
4. Before running Playwright or DB suites, confirm from their config/scripts that they target an isolated local target with synthetic fixtures. If a suite would hit a hosted Supabase project, stop and report instead of running it.
5. `typecheck` (`next typegen`) and `build` load local env files at runtime. Never print or capture env values, and do not share `.next` output.
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
