# Field-test bug fixes and UX verification

Date: 4 October 2026

## Bugs fixed

- Journey Preview now puts Journey Controls first, with Start Journey above the map and existing Use/Remix/social actions retained. Start opens the existing preview; GPS starts only after explicit Start in Travel Mode.
- Road-route identity includes destination coordinates and transportation profile. Changing either cancels pending requests, clears the old blue geometry before repaint, and rejects obsolete responses.
- Arrival advances the authoritative creator-ordered stop and requests the next blue route; accepted purple GPS history and green planned geometry remain independent.
- Recenter/Follow controls have reserved space alongside the compact HUD. Travel-mode markers open stop details without an extra popup behind navigation overlays.
- Create Journey can store exact user-selected coordinates and names without a Mapbox place identifier. Editing a location keeps the same stop ID, order, description, and other metadata.
- Worldwide destination selection reuses the existing name/latitude/longitude fields. Draft recovery and remix already copy those fields; public SEO now uses the destination name.

## UX changes

Travel Mode uses a large map with compact provider guidance, distance/duration, transportation selection, GPS status/recovery, progress, manual completion, pause, and confirmed end controls. Expand uses the same map instance and an in-page viewport overlay. Collapse/Escape restores the regular layout; keyboard focus stays in the expanded map and stop/end dialogs remain accessible.

Create Journey retains place search and adds one-time current location and a movable/clickable map pin. Both request an editable stop name; no name is invented. Existing stops have name, description, location, reorder, remove, and map-view actions. Destination selection searches worldwide; traveler options use the original solo/couple/friends/family values. Existing useful fields, private drafts, uploads, publishing and published editing remain.

## Database migration

`supabase/migrations/20261004000000_field_test_destinations.sql` is required for worldwide saves. It replaces the legacy five-destination slug constraint and updates the existing security-invoker save function plus published destination-name projection. It reuses existing columns, with no new tables or location model. Authentication, owner/version/media checks, RLS, and private track policies remain.

The migration was tested locally against SQL, but has not been applied to any external Supabase project.

## Preserved boundaries

- One persistent GPS watcher, owned by the existing Travel Mode adapter.
- Create uses getCurrentPosition with maximumAge 0 and a bounded timeout, only after its explicit action. Late results after leaving/choosing another picker are ignored.
- Arrival/rerouting thresholds, ordered-stop semantics, Mapbox Standard camera behavior, segmented GPS recording, incremental recovery and owner-only track access remain.
- Transportation is local UI/navigation state and defaults to Driving. It never changes stored journey data or accepted track points.
- No dependencies, Travel Memories, mobile/native/background/offline code, commit, push, or deployment.

## Verification

- TypeScript: `npm run typecheck` passed.
- Lint: `npm run lint` passed.
- Normal production build: `npm run build` passed.
- SQL migrations, creation, authentication/RLS/security, and track privacy: `npm run test:db` passed, in production migration order.
- Public/unit suite: 100 passed; four Auth cases intentionally skip in the unconfigured public build.
- Configured Auth suite: 8 passed against the local fixture, covering the skipped signup/login/cookie/logout cases on desktop and mobile.
- Creation suite: 66 passed, including discovery, remix, GPS, navigation, rerouting, and private-track recovery. After the final picker validation correction, all six field-test checks passed again.

Public fallback tests now build with blank public service settings before starting. Next compiles NEXT_PUBLIC values, so runtime overrides alone had let local services leak into those tests. New published fixtures are removed in finally blocks to keep discovery expectations isolated.

## Browser QA

The field-test suite exercises 360×800, 390×844, 412×915, 844×390, 1280×900, and 1440×1000. Checks cover preview Start visibility without scrolling, normal/expanded map bounds, HUD and safe controls, collapse, keyboard focus, overflow, creation form and pin dialog. Live Mapbox Standard basemaps and worldwide destination search are exercised; deterministic navigation tests use mocked Directions responses and GPS readings with the real Mapbox renderer.

Screenshots are under `test-results/creation/field-test-*`. Visual inspection includes portrait and landscape live maps, regular map controls, narrow Create Journey layout, and the corrected 360px pin dialog with all fields and its save action visible.

## Limitations and physical re-testing

- The migration must be applied to the target database before worldwide destinations can be saved there.
- Physical GPS movement and live walking/driving road correctness still require field re-testing. Browser automation simulates GPS and Directions; live basemap/search checks are separate.
- Browser GPS requires a secure context and an open page; locked screens/background tabs can suspend readings, as before.
- Transportation selection is in memory and returns to Driving after reload. Progress and private track recovery retain their existing persistence.
- Reverse geocoding is optional and was not added. Current-location/pin stops require the traveler to supply a name. If map services/WebGL fail, exact pin coordinate inputs remain available.

Ready for physical re-testing once the migration is applied to the intended environment. Nothing was pushed, deployed, or committed.

## Files changed

- `docs/field-test-ux.md`
- `playwright.config.ts`
- `scripts/start-public-test.mjs`
- `scripts/test-creation-schema.mjs`
- `scripts/test-track-schema.mjs`
- `src/app/create/page.tsx`
- `src/app/globals.css`
- `src/app/journey/[id]/page.tsx`
- `src/components/journey/destination-picker.tsx`
- `src/components/journey/journey-actions.tsx`
- `src/components/journey/journey-builder.tsx`
- `src/components/journey/journey-route.tsx`
- `src/components/journey/stop-location-picker.tsx`
- `src/components/map/journey-map.tsx`
- `src/components/map/place-search.tsx`
- `src/components/travel/gps-status.tsx`
- `src/components/travel/navigation-panel.tsx`
- `src/components/travel/travel-mode.tsx`
- `src/components/travel/use-travel-navigation.ts`
- `src/lib/discovery/queries.ts`
- `src/lib/journey/current-location.ts`
- `src/lib/journey/editor.ts`
- `src/lib/mapbox/geocoding.ts`
- `src/lib/travel/navigation.ts`
- `supabase/migrations/20261004000000_field_test_destinations.sql`
- `tests/creation/creation.spec.ts`
- `tests/creation/field-test.spec.ts`
- `tests/creation/social-loop.spec.ts`
- `tests/creation/travel-gps.spec.ts`
- `tests/creation/travel-mode.spec.ts`
- `tests/creation/travel-navigation.spec.ts`
- `tests/field-test-navigation.spec.ts`
- `tests/fixtures/editor-destination.ts`
- `tests/fixtures/supabase-creation.mjs`
