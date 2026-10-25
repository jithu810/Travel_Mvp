---
name: web-checks
description: Run the Web repo (D:/Travel_Mvp) typecheck, lint and optional build/test checks and summarize results. Use after Web changes or when asked to check the web app.
argument-hint: "[optional: build | db | e2e | creation]"
---

# Web checks

Extra checks requested: $ARGUMENTS

Run in `D:/Travel_Mvp`. Report results only. Do not edit files or fix dependencies.

## Steps
1. Record `git rev-parse --short HEAD` and `git status --short --branch`.
2. Always run, continuing even if one fails:
   - `npm run typecheck`
   - `npm run lint`
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
typecheck:  pass | fail — first error: <file:line message>
lint:       pass | fail — first error: <file:line rule>
build:      not run | pass | fail — <summary>
test:db / test:creation / test:e2e: not run | pass | fail — <summary>
Skipped and why:
```
