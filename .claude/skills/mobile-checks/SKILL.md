---
name: mobile-checks
description: Run the Mobile repo (D:/Travel_Mvp_Mobile) test, typecheck and lint checks and summarize results. Use after Mobile changes or when asked to check the mobile app.
argument-hint: "[optional: test file or focus]"
---

# Mobile checks

Focus: $ARGUMENTS

Run in `D:/Travel_Mvp_Mobile`. Report results only. Do not edit files, fix dependencies or run `npm audit fix` / `expo install --fix`.

## Steps
1. Record `git rev-parse --short HEAD` and `git status --short --branch`.
2. Run each check, continuing even if one fails:
   - `npm test`, or `node --test <file>` if a specific test file was given
   - `npm run typecheck`
   - `npm run lint`
3. Run `npx expo-doctor` only when native dependencies, `app.json`, `eas.json` or plugins changed, and only with product-owner approval: it is not a repo dependency, so `npx` downloads it from npm. Report its advice; never upgrade packages to satisfy it.
4. Do not run `npm run check:supabase`, because it loads `.env.local`.

## Output
```text
Repo / revision / dirty files:
npm test:        pass | fail (N passed, M failed) — first failure: <file:line message>
typecheck:       pass | fail — first error: <file:line message>
lint:            pass | fail — first error: <file:line rule>
expo-doctor:     not run | pass | warnings: <summary>
Not verified:    physical-device behavior (pending unless tested on a device)
```

Mocks, exports and these checks do not prove native-device behavior. Always say device verification is pending unless the product owner confirms a device test.
