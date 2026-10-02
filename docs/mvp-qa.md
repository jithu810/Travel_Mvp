# Journey MVP completion QA — 2026-10-02

## Product behavior

**Use This Journey** opens the source journey's ordered stops and map as a read-only travel plan. It does not create a draft, change ownership, modify the source, or require an account to view a public route.

**Remix This Journey** uses the existing authenticated copy RPC to create a private, independently editable draft. The copy has its own journey ID and stop IDs, initially preserves the creator's stop order and useful metadata, belongs to the current user, and can be independently published. Its detail page links to its source while that source reference exists.

A **journey route** is the creator's ordered stops and the straight map connections between them. It is not road directions or a route chosen by an optimizer. A future **traveled track** would be the GPS path recorded during someone's trip. No GPS tracking or route optimization is implemented.

## Confirmed bugs and fixes

1. LAN origin handling was fixed only for social actions. Creation/publishing, image upload, owner deletion, profile edits, and avatar upload still rejected legitimate LAN requests with 403 before authentication. All six write handlers now share `isAllowedRequestOrigin`. It preserves production validation and permits only the exact HTTP development LAN origin with a matching Host. Missing, unrelated, and mismatched origins remain rejected.
2. Adding a stop called `crypto.randomUUID()`, unavailable on HTTP LAN pages. `createStopId` uses the native API when present and a cryptographically random UUID v4 fallback using `crypto.getRandomValues` otherwise. Coordinates and stop order are unchanged.
3. The copy action was labelled Use This Journey. The copy behavior is now labelled Remix This Journey; Use This Journey links to the existing route section. No new backend operation was introduced.
4. Browser suites shared an output directory, causing concurrent runs to delete active trace files. They now have separate output subdirectories. Development-only origin tests are excluded from the unconnected production-preview suite.

## Verification and limits

| Flow | Evidence |
| --- | --- |
| Anonymous home → search Goa → Couple → detail | Production-preview browser tests and live browser clicks on desktop localhost/mobile LAN |
| Live published journey and map | Five numbered markers and visible 1–5 connection visually inspected on both viewports; no page errors, Mapbox HTTP errors, or horizontal overflow |
| Map fallback and authoritative order | Browser fallback markers/polyline and geometry tests including missing coordinates; no directions/optimization requests |
| Email/password login, errors, logout, refresh | Mock Auth browser tests on both localhost and LAN; invalid credentials stay on the login page |
| Like/unlike and save/unsave | Browser actions and two-user fixture tests, plus isolated PostgreSQL tests |
| Saved collection and user isolation | User B saves; B retains Saved after refresh; owner A and anonymous profile visitors see their own unsaved state; private collection requires login |
| Use vs Remix | Read-only Use anchor, separate authenticated Remix button, preserved copy RPC and source link |
| Remix → edit/reorder → draft → publish | Two-user browser fixture and PostgreSQL tests; source remains unchanged; independent IDs, ownership, metadata, source relationship, and deletion |
| Owner edit/update/delete | Browser fixture and PostgreSQL ownership checks; other-user edits/deletes denied |
| Profiles and drafts | Published/remixed journeys shown; drafts restricted to owner; email/private collections not exposed publicly |
| Empty/loading/error/image behavior | Empty filters, missing routes, map loading/fallback, save/search failures, image validation, and broken-cover fallback checks |
| Development security | All write handlers admit same-origin localhost/LAN requests to authentication; unrelated/mismatched origins rejected. Production exception absence covered separately |

Authenticated writes were exercised against an isolated HTTP Supabase fixture and existing SQL in an in-memory PostgreSQL database. Hosted Supabase was not migrated or mutated, and real signed-in user credentials were not accessed. Live anonymous discovery and maps were checked against the configured application. This is not a certification of every deployed hosted policy/function definition.

The live map screenshots are in `test-results/qa/live-map-1280.png` and `test-results/qa/live-map-390.png` (ignored local QA artifacts).

## Remaining limitation

The existing foreign key uses `ON DELETE SET NULL` for `copied_from_journey_id`. Deleting a source preserves the remix and its images/stops, but removes its source link and visible attribution. Retaining permanent attribution after source deletion needs a durable source snapshot or tombstone design. No schema change was made because this pass explicitly forbids one. Attribution works while the source reference exists, including a message if the source is no longer publicly readable.

## Validation commands

Final results: TypeScript, lint, normal-environment production build, and both isolated PostgreSQL test scripts passed. Public/demo browser suite: 24 passed, 4 skipped. Creation/social desktop/mobile suite: 8 passed. Configured localhost/LAN Auth and origin suite: 10 passed. The four skipped preview Auth cases were covered by the configured suite. All final runs finished with no failures.

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:db
npm run test:creation
npx playwright test --config playwright.auth-dev.config.ts
```

For deterministic public/demo tests, compile a separate invocation with the four public Supabase/Mapbox environment variables empty, then run `npm run test:e2e`. Those shell variables do not edit `.env.local`. Rebuild with the normal environment afterward so the final production build uses the real configured public settings.

The unconnected-preview Auth form tests skip by design; the corresponding scenarios run in the configured localhost/LAN development suite. Google OAuth, Auth dashboard configuration, hosted migrations/RLS/Storage settings, and Mapbox configuration were unchanged.

Deferred: persistent attribution after source deletion, real-time GPS tracking, turn-by-turn navigation, route optimization, recommendations, AI, and the next SEO phase.

## Files changed in this pass

- `src/lib/request-origin.ts`
- `src/app/api/journeys/route.ts`
- `src/app/api/journeys/[id]/actions/route.ts`
- `src/app/api/journeys/[id]/route.ts`
- `src/app/api/journeys/[id]/images/route.ts`
- `src/app/api/profile/route.ts`
- `src/app/api/profile/avatar/route.ts`
- `src/components/journey/journey-actions.tsx`
- `src/components/journey/journey-route.tsx`
- `src/components/journey/journey-builder.tsx`
- `src/lib/journey/stop-id.ts`
- `playwright.config.ts`
- `playwright.creation.config.ts`
- `playwright.auth-dev.config.ts`
- `tests/journey-detail.spec.ts`
- `tests/creation/creation.spec.ts`
- `tests/creation/social-loop.spec.ts`
- `tests/save-origin.spec.ts`
- `tests/request-origin.spec.ts`
- `tests/stop-id.spec.ts`
- `docs/mvp-qa.md`
