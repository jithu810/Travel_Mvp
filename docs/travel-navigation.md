# Travel Mode road navigation (Prompt 11)

## Provider and configuration

The browser calls Mapbox **Directions API v5**, using the `mapbox/driving` profile, and draws the returned full GeoJSON road geometry in the existing Mapbox GL JS map. This is a web-compatible HTTP integration; no native Navigation SDK or additional dependency is installed. Directions supplies distance, duration and maneuver instructions; GL JS supplies visualization and camera/marker controls. It does not supply a browser navigation engine.

Official documentation inspected during implementation:

- [Directions API: profiles, response, maneuvers, errors, limits and pricing](https://docs.mapbox.com/api/navigation/directions/).
- [Supported POST requests](https://docs.mapbox.com/api/navigation/http-post/).
- [GL JS markers and rotation alignment](https://docs.mapbox.com/mapbox-gl-js/api/markers/).
- [Public tokens and allowed URLs](https://docs.mapbox.com/help/dive-deeper/access-tokens/).

Reuse `NEXT_PUBLIC_MAPBOX_TOKEN`, a client-safe `pk.` token. No new environment variables, credentials, migrations, RLS, Supabase settings, or production configuration changes are introduced. A real POST using the current local token returned HTTP 200 / `Ok` for Nedumangad to Palode, with LineString geometry, 16,982.785 m, 2,277.722 seconds and nine steps. Credentials are never printed or embedded in source. If a deployed token has URL restrictions, its allowed origins must include the deployment domain (currently `https://www.journeycreator.site`) and intended local development origins. A 401/403 is surfaced as a token/origin configuration error. Account billing/usage and provider availability still apply; verify the account's Directions usage and budget in Mapbox. Requests incur provider usage even when the traveler is anonymous; there is no application-side shared quota service in this phase.

## Architecture and lifecycle

`src/lib/travel/navigation.ts` holds response validation, provider adapter, maneuver matching, named limits and an independently testable `NavigationController`. `use-travel-navigation.ts` connects that controller to the existing Travel Mode session and **the same validated current GPS fix**. It does not call geolocation. `navigation-panel.tsx` renders route information. `JourneyMap` receives an optional road geometry; its default discovery/story/creation behavior remains unchanged.

The sole destination is the next incomplete stop in creator order. Only ACTIVE sessions with coordinate-valid destinations and fresh GPS (age at most 15 seconds, accuracy at most 50 m) can request routing. Start/resume waits for fresh GPS. Missing-coordinate stops, denied GPS and routing failures leave manual completion available. Pause, completion, cancellation and unmount abort pending requests and clear navigation. Arrival remains the original independent 100 m / accuracy <=50 m / age <=15 s guarded next-stop-only system, including its uncertainty margin. Advancing a stop immediately hides the previous route and triggers a route to the new destination without restarting GPS.

Requests use POST to `https://api.mapbox.com/directions/v5/mapbox/driving?access_token=...`. The form-encoded body contains exactly two longitude/latitude pairs, `geometries=geojson`, `overview=full`, `steps=true`, `alternatives=false`, `language=en`. Precise coordinates stay out of URLs. Responses are checked for `Ok`, finite nonnegative distance, optional finite nonnegative duration, bounded LineString coordinate arrays, and usable provider instructions. Optional unavailable instructions/duration do not invent substitutes. Malformed route geometry rejects the response. Provider error text, fetch URLs and raw errors are not logged or echoed into UI.

One request may be pending. Equivalent GPS ticks reuse the existing route. Named constants are:

| Constant | Value | Purpose |
| --- | --- | --- |
| `ROUTE_MOVEMENT_METERS` | 150 m | Meaningful displacement from the last request origin |
| `ROUTE_REFRESH_INTERVAL_MS` | 30 seconds | Minimum interval for GPS-driven refreshes |
| `ROUTE_MAX_AGE_MS` | 120 seconds | Refresh old routes with a fresh GPS fix |
| `ROUTE_RETRY_INTERVAL_MS` | 5 seconds | Bound explicit retry clicks |
| `ROUTE_TIMEOUT_MS` | 15 seconds | Abort a stalled request |
| `MANEUVER_MATCH_METERS` | 50 m | Conservative segment matching including GPS uncertainty |

A two-second lifecycle tick checks route age/GPS freshness; it does not imply a request every two seconds. Destination changes and resume start a new lifecycle immediately. Meaningful movement during a pending calculation cancels it and waits for the refresh interval. Abort plus monotonic request IDs, destination identity and current-origin displacement checks prevent late results from updating the current route. Failed requests do not retry in a loop; Retry route is available with the five-second floor. A recovery may also begin when the authoritative next stop changes or the journey resumes.

## Map, heading and instructions

Three concepts have separate boundaries:

1. **Planned journey:** existing `journey-sequence` source, stored creator stops, dashed muted green in Travel Mode. It is never replaced by roads.
2. **Navigation route:** independent `travel-navigation` source and blue/white layers, one in-memory road route from current GPS to the next stop.
3. **Actual traveled track:** no source, recorder or persistence is implemented. A future module must own its own data and source; never reuse the planned/navigation models for a track.

The existing blue marker is preserved. A small heading indicator appears only when validated browser heading exists; the marker rotates in map alignment. Absent/invalid heading remains a normal blue dot. This is the device-reported current heading, not an invented road/turn arrow or compass guarantee.

Follow is opt-in and smoothly centers on GPS at navigation zoom, uses heading only if present, and respects reduced motion. Manual map pan/zoom suspends Follow; the control returns to Follow. Center on me is an explicit recenter control. Pause/lost GPS clears follow mode. No automatic camera movement occurs until Follow is enabled. Controls remain touch sized and separate from the mobile application navigation.

Provider maneuver instructions are implemented. All usable instructions remain accessible in the expandable Mapbox route instructions list. The live next maneuver uses conservative nearest-segment projection against **provider step geometry**, then displays the following provider step's actual instruction/type and approximately the remaining road-segment distance scaled to the provider's step distance. A fix too far away, inaccurate/stale fix, antimeridian-spanning step, or ambiguous nonadjacent intersection hides live guidance. No instruction text or turn arrow is derived/invented from geometry. This is basic browser guidance, not full SDK map matching, lane guidance, voice navigation or guaranteed turn-by-turn progress. More rigorous maneuver progression and deviation rerouting need a dedicated next navigation phase; automatic off-route claims/rerouting are deliberately absent.

Road distance and driving duration are **totals at the last calculation**, explicitly labeled. Duration is a Mapbox estimate, not a straight-line calculation or live remaining ETA. No live traffic is requested or claimed. Haversine distance remains separately labeled straight-line geographic distance. Route recalculation refreshes the service totals.

## Failure, network and privacy

NoRoute/NoSegment, invalid coordinates, malformed JSON/geometry, token/origin rejection, rate limits, network failure, timeout and service errors receive useful safe messages. Retry route is available. None blocks arrival or manual stop progression. Without network, the last valid route for the same destination remains visible with an explicit warning. A new destination discards it even offline. GPS continues independently. There is no offline-navigation promise, map-tile cache or route cache persistence.

Only the current validated fix, last requested origin and one current route exist in memory. There is no GPS history or storage. SessionStorage retains only the existing progress whitelist, never route geometry, GPS fix or heading. No GPS is sent to application APIs, journey records, Supabase, analytics, app URLs or logs. Mapbox necessarily receives origin/destination in the routing POST body and basemap tile requests; this provider data sharing is required for routing. Public token URL parameters follow the provider's API contract and are client safe. The GPS map's optional metrics remain disabled and attribution links remain static without location-bearing feedback URLs.

## Verification and phone checklist

Automated tests use mocked browser geolocation and mocked Directions responses with a real GL JS renderer; they do not use the physical machine's location. Unit/controller tests cover coordinate/response/maneuver parsing, optional duration, lifecycle, movement/age throttling, duplicate requests, cancellation/obsolete responses, bounded retries, network failure and route ownership by destination. Browser tests cover the five ordered stops, mobile 360/390 px and desktop, independent route/markers, instructions, heading, Follow/manual pan, next-stop arrival, pause/resume/end, missing coordinates, offline transitions, manual fallback, storage privacy and overflow/control placement. Existing GPS, manual Travel Mode, public, creation/social/discovery/SEO, auth, isolated database/security, TypeScript, lint and build checks remain required.

**Physical-device road navigation: NOT FIELD-TESTED.** Prompt 10 GPS was reported working by the user on a deployed phone; that does not verify Prompt 11 navigation. Browser location services, heading quality, GPS drift, background suspension, screen lock and battery policies can differ from mocks. This implementation does not guarantee continuous background navigation.

After deployment, test on HTTPS with an actual phone:

- Open the five-stop public journey anonymously and start with permission enabled.
- Confirm blue location, separate blue road route and green planned route, road distance, driving estimate and available provider instruction.
- Enable Follow; verify heading only when the device supplies one, then pan/zoom and recenter/re-enable Follow.
- Move along roads and confirm route refresh is restrained; arrive at each next ordered stop and verify automatic route transition.
- Pause/resume with a fresh reading; end and confirm location/navigation stop.
- Deny permission or use a missing-coordinate stop and complete manually.
- Lose network: confirm the old same-destination route is visibly labeled, new-destination routing is unavailable, manual progress works, and Retry route works after recovery.
- Check controls above the mobile bottom navigation and map visibility in portrait/landscape.

Future SDK/native/PWA work may improve matching, off-route detection, dynamic remaining ETA, voice and background behavior. Future actual-track storage and Travel Memories require a separate explicit privacy/storage design and are outside this implementation.

## Implementation verification record

- Public suite: 62 passed, four configured-auth cases intentionally skipped in the unconfigured build.
- Complete isolated creation/social/discovery/SEO/Travel/GPS/navigation suite: 52 passed.
- Configured Auth plus final navigation units and GPS/browser integrations: 32 passed, including the public suite's skipped login/signup/persistence/logout scenarios.
- TypeScript, lint, configured production build, isolated database/security tests and whitespace checks passed.
- Live local app with real Mapbox routing and basemap, simulated GPS at 360, 390 and 1440 px: HTTP 200 routing, separate road/planned lines, ~38-minute service estimate for Nedumangad to Palode, zero page/console errors, no horizontal overflow, controls below map and above mobile bottom navigation. Screenshots inspected. This is browser simulation, not a physical-device field test.

Added files: `src/lib/travel/navigation.ts`, `src/components/travel/use-travel-navigation.ts`, `src/components/travel/navigation-panel.tsx`, `tests/travel-navigation.spec.ts`, `tests/creation/travel-navigation.spec.ts`, `tests/fixtures/directions.ts`, and this document.

Updated files: `src/components/travel/travel-mode.tsx`, `src/components/travel/gps-status.tsx`, `src/components/map/journey-map.tsx`, `src/app/globals.css`, `tests/creation/travel-gps.spec.ts`, `tests/fixtures/geolocation.ts`, and `docs/travel-mode.md`. No dependency, environment, schema, RLS, authentication or production configuration files were changed.
