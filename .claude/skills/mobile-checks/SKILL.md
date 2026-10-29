---
name: mobile-checks
description: Select and run proportionate Mobile checks in D:/Travel_Mvp_Mobile and summarize results. Use after Mobile changes or when asked to check the mobile app.
argument-hint: "[optional: test file or focus]"
---

# Mobile checks

Focus: $ARGUMENTS

Run in `D:/Travel_Mvp_Mobile`. Report results only. Do not edit files, fix dependencies or run `npm audit fix` / `expo install --fix`.

## Steps
1. Record `git rev-parse --short HEAD` and `git status --short --branch`.
2. Select checks using the shared workflow's proportional verification tier; an explicit request for broader checks takes precedence:
   - Small cosmetic change: inspect diff and visual appearance where useful; no tests/typecheck/lint by default.
   - Focused behavior change: run affected `node --test <files>` tests. Run typecheck for TypeScript contract changes and scoped lint where useful.
   - Major/sensitive change: run relevant regression/integration checks, typecheck and lint; run `npm test` for broad impact or uncertain coverage. Include device/build checks for affected native behavior.
   - Reuse passing checks on an unchanged snapshot. After fixes rerun affected checks only; broaden for failures or discovered risk. Report unrelated baseline failures separately.
3. Run `npx expo-doctor` only when native dependencies, `app.json`, `eas.json` or plugins changed, and only with product-owner approval: it is not a repo dependency, so `npx` downloads it from npm. Report its advice; never upgrade packages to satisfy it.
4. Do not run `npm run check:supabase`, because it loads `.env.local`.

## Output
```text
Repo / revision / dirty files:
tests:           not run (reason) | pass | fail (N passed, M failed) — first failure: <file:line message>
typecheck:       not run (reason) | pass | fail — first error: <file:line message>
lint:            not run (reason) | pass | fail — first error: <file:line rule>
expo-doctor:     not run | pass | warnings: <summary>
Not verified:    physical-device behavior (pending unless tested on a device)
```

Mocks, exports and these checks do not prove native-device behavior. Report device verification as completed only with device evidence or product-owner confirmation; otherwise pending, or not applicable for documentation-only work.
