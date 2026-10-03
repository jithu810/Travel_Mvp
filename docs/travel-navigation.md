# Travel Mode road navigation (Prompts 11–13)

## Provider and configuration

The browser calls Mapbox **Directions API v5**, using the `mapbox/driving` profile, and draws the returned full GeoJSON road geometry in the existing Mapbox GL JS map. This is a web-compatible HTTP integration; no native Navigation SDK or additional dependency is installed. Directions supplies distance, duration and maneuver instructions; GL JS supplies visualization and camera/marker controls. It does not supply a browser navigation engine.

Official documentation inspected during implementation:

- [Directions API: profiles, response, maneuvers, errors, limits and pricing](https://docs.mapbox.com/api/navigation/directions/).
- [Supported POST requests](https://docs.mapbox.com/api/navigation/http-post/).
- [GL JS markers and rotation alignment](https://docs.mapbox.com/mapbox-gl-js/api/markers/).
- [Mapbox Standard configuration](https://docs.mapbox.com/map-styles/reference/standard/).
- [Supported custom-layer slots](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/).
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

## Smart rerouting (Prompt 12)

`src/lib/travel/rerouting.ts` centralizes nearest-road-segment distance and persistent deviation confirmation. It compares the current fix with the current road geometry, rather than displacement from the original request or distance to the destination. Wrapped longitude projection handles the dateline; polar geometry is conservatively ignored. This is a distance heuristic, not SDK map matching.

| Constant | Value | Purpose |
| --- | --- | --- |
| `OFF_ROUTE_DISTANCE_METERS` | 120 m | Distance minus reported GPS uncertainty must exceed this |
| `OFF_ROUTE_CONFIRMATION_READINGS` | 3 | Minimum distinct valid off-route readings |
| `OFF_ROUTE_CONFIRMATION_MS` | 8 seconds | Minimum span across those readings |
| `MIN_REROUTE_INTERVAL_MS` | 60 seconds | Minimum interval between automatic reroute attempts |

Confirmation requires both the reading count and time span. Readings must meet the existing freshness/accuracy limits (15 seconds / 50 m). Repeated timestamps, out-of-order readings and controller timer ticks do not count; a reading gap above 15 seconds resets evidence. An on-route reading clears evidence. Small fluctuations cannot trigger a deviation reroute. While deviation is suspected, ordinary movement/age refresh cannot bypass confirmation. Automatic reroutes also retain the existing 30-second request floor.

Confirmed deviation marks the last route stale, hides live maneuver guidance, and requests current GPS → the same next incomplete creator stop when cooldown permits. The panel shows accessible “Rerouting…” and “Route updated” states. Success replaces only road geometry/totals/provider instructions and resets deviation evidence. A new deviation must satisfy the policy again. The creator journey, next stop and stop progress remain unchanged.

Pending-request deduplication, aborts, request IDs, destination/current-origin checks and timeout protections remain shared with Prompt 11. Failed reroutes preserve the last same-destination route with a warning and manual completion, and stop automatic retry loops. Explicit Retry retains its five-second floor. Pause, terminal states, invalid/missing stops and unsuitable GPS cannot reroute. No new GPS watch or location persistence is introduced.

## Map, heading and instructions

Three concepts have separate boundaries:

1. **Planned journey:** existing `journey-sequence` source, stored creator stops, dashed muted green in Travel Mode. It is never replaced by roads.
2. **Navigation route:** independent `travel-navigation` source and blue/white layers, one in-memory road route from current GPS to the next stop.
3. **Actual traveled track:** no source, recorder or persistence is implemented. A future module must own its own data and source; never reuse the planned/navigation models for a track.

The existing blue marker is preserved and updated from the same current fix. In Travel Mode, its heading indicator requires fresh accuracy ≤50 m, finite heading in [0, 360), and reported speed ≥1.5 m/s. Missing, stationary or unreliable heading remains a blue dot. Rotation is map-aligned; no road bearing or compass accuracy is invented.

Only Travel Mode opts into `mapbox://styles/mapbox/standard`; shared map consumers retain their existing style. Installed GL JS 3.32 supports Standard configuration and slots. Standard supplies 3D buildings with `show3dObjects`/`show3dBuildings` enabled. Optional 3D trees and landmarks are disabled for phone performance. No separate building source, service, dependency or animation loop is added. Planned and road lines use Standard's supported `middle` slot; no classic basemap layer IDs are assumed. Navigation remains usable where building data is absent.

`src/lib/travel/navigation-camera.ts` centralizes zoom 16.2, pitch 45°, 600 ms transitions and reliable-heading bearing. Reduced motion sets transition duration to zero. Follow is opt-in; Center on me restores this camera and resumes Follow. User pan/zoom/rotation suspends it. Camera states distinguish OVERVIEW, FOLLOWING, USER_INTERACTED and RECENTERING; session/GPS states expose PAUSED, COMPLETED, CANCELLED and WAITING_GPS. Pause/lost GPS clears follow mode. Insets leave forward road space and existing controls accessible. Style/map initialization does not repeat on GPS or route updates. Controls remain touch sized and separate from mobile application navigation.

Provider maneuver instructions are implemented. All usable instructions remain accessible in the expandable Mapbox route instructions list. The live next maneuver uses conservative nearest-segment projection against **provider step geometry**, then displays the following provider step's actual instruction/type and approximately the remaining road-segment distance scaled to the provider's step distance. A fix too far away, inaccurate/stale fix, antimeridian-spanning step, or ambiguous nonadjacent intersection hides live guidance. No instruction text or turn arrow is derived/invented from geometry. This is basic browser guidance, not full SDK map matching, lane guidance, voice navigation or guaranteed turn-by-turn progress. Prompt 12 adds conservative deviation rerouting separately from maneuver matching; advanced maneuver progression remains outside this phase.

Road distance and driving duration are **totals at the last calculation**, explicitly labeled. Duration is a Mapbox estimate, not a straight-line calculation or live remaining ETA. No live traffic is requested or claimed. Haversine distance remains separately labeled straight-line geographic distance. Route recalculation refreshes the service totals.

## Failure, network and privacy

NoRoute/NoSegment, invalid coordinates, malformed JSON/geometry, token/origin rejection, rate limits, network failure, timeout and service errors receive useful safe messages. Retry route is available. None blocks arrival or manual stop progression. Without network, the last valid route for the same destination remains visible with an explicit warning. A new destination discards it even offline. GPS continues independently. There is no offline-navigation promise, map-tile cache or route cache persistence.

Only the current validated fix, last requested origin, one display-only camera anchor and one current route exist in memory. There is no GPS history or storage. SessionStorage retains only the existing progress whitelist, never route geometry, GPS fix or heading. No GPS is sent to application APIs, journey records, Supabase, analytics, app URLs or logs. Mapbox necessarily receives origin/destination in the routing POST body and basemap tile requests; this provider data sharing is required for routing. Public token URL parameters follow the provider's API contract and are client safe. The GPS map's optional metrics remain disabled and attribution links remain static without location-bearing feedback URLs.

## Navigation UX (Prompt 13)

The compact HUD prioritizes the next creator stop, followed by navigation status, calculated road distance/driving duration and a confident provider maneuver. Totals explicitly describe the last route calculation, not a live ETA. Unavailable duration is omitted; unavailable routes do not fabricate totals. The expandable provider instruction list remains a list from that calculation, not a substitute for confident live guidance.

Presentation states distinguish Ready, Waiting for GPS, GPS signal weak/unavailable, Finding route, Route updating, Checking route, Rerouting, waiting to update a stale route, Route unavailable, Paused and completed/ended sessions. Checking uses the existing deviation evidence and does not change request eligibility. “Route updated” expires after five seconds at the next existing lifecycle update (the hook ticks every two seconds). Failed/offline routing retains the same-destination road route, explains its age, offers Retry and preserves manual completion.

Arrival feedback briefly names the completed stop and next target for six seconds, highlights that completed row, and then clears. Manual completion is labeled separately from GPS arrival. Progress shows completed/remaining counts and an accessible current step in unchanged creator order. The original reducer and arrival source of truth remain authoritative. End Journey is separated from routine controls and still requires confirmation; completion offers a stop-count summary and Journey Story link, without travel statistics.

Follow status is visible on the map. Gestures suspend Follow; Center on me restores the existing 45°/16.2 camera. Small changes below eight meters and eight degrees are ignored by the camera; the blue marker still uses the exact current fix. Heading differences wrap at north. Missing/unreliable heading retains the camera orientation. Weak/stale GPS cannot animate or explicitly recenter the navigation camera. One in-memory camera anchor is used for display only, never arrival, routing or track recording.

Pause still stops GPS/navigation. If Follow was enabled before pause, it resumes only after a fresh precise fix; a user-suspended Follow stays suspended. This preference is component-local and is not restored from storage. Map style, custom sources, rerouting thresholds, GPS quality rules and route-request protections are unchanged. Other maps do not opt into this UX. Navigation map/preview height is capped at 65dvh in short viewports so the location and controls remain visible in landscape; portrait and desktop retain the existing maximum heights. Stop buttons have scroll clearance for sticky controls.

Browser/GPS/Directions simulation verifies UI behavior, not outdoor driving. Prompts 12–13 still require physical-device testing for meaningful road deviation, real rerouting, GPS stability, heading and restrained route refresh while moving. Browser background suspension, screen lock, safe areas and mobile browser chrome remain device-dependent. No persistent track, background GPS architecture, Travel Memories, native SDK, voice or offline navigation is added.

## Verification and phone checklist

Automated tests use mocked browser geolocation and mocked Directions responses with a real GL JS renderer; they do not use the physical machine's location. Unit/controller tests cover coordinate/response/maneuver parsing, optional duration, lifecycle, movement/age throttling, duplicate requests, cancellation/obsolete responses, bounded retries, network failure and route ownership by destination. Browser tests cover the five ordered stops, mobile 360/390 px and desktop, independent route/markers, instructions, heading, Follow/manual pan, next-stop arrival, pause/resume/end, missing coordinates, offline transitions, manual fallback, storage privacy and overflow/control placement. Existing GPS, manual Travel Mode, public, creation/social/discovery/SEO, auth, isolated database/security, TypeScript, lint and build checks remain required.

**Prompt 11 physical-phone verification was reported complete by the user. Prompts 12–13 rerouting/3D/UX upgrades have not yet been field-tested on a physical phone.** Browser location services, heading quality, GPS drift, background suspension, screen lock and battery policies can differ from mocks. This implementation does not guarantee continuous background navigation.

After deployment, test on HTTPS with an actual phone:

- Open the five-stop public journey anonymously and start with permission enabled.
- Confirm blue location, separate blue road route and green planned route, road distance, driving estimate and available provider instruction.
- Enable Follow; verify 45° pitch, available 3D buildings and reliable moving heading, then pan/zoom/rotate and recenter to resume Follow.
- Safely deviate: verify rerouting requires persistent reliable deviation, retains the same next stop and creator order, and replaces only the road route. Check cooldown and failed-reroute Retry/manual fallback.
- Move along roads and confirm route refresh is restrained; arrive at each next ordered stop and verify automatic route transition.
- Pause/resume with a fresh reading; end and confirm location/navigation stop.
- Deny permission or use a missing-coordinate stop and complete manually.
- Lose network: confirm the old same-destination route is visibly labeled, new-destination routing is unavailable, manual progress works, and Retry route works after recovery.
- Check controls above the mobile bottom navigation and map visibility in portrait/landscape.

Future SDK/native/PWA work may improve matching, dynamic remaining ETA, voice and background behavior. Future actual-track storage and Travel Memories require a separate explicit privacy/storage design and are outside this implementation.

## Prompt 12 verification

Controller/unit tests cover thresholds, uncertainty, noise, persistence, duplicate timestamps, cooldown, failures, bounded retry, paused/terminal/missing-stop guards, superseded responses and camera configuration. Browser tests use mocked Directions/GPS with real GL JS and a Standard-compatible imported basemap/slot fixture. They verify the five-stop Thenkasi rerouting scenario, source separation, marker/camera, manual gestures, recenter, failure recovery, privacy and mobile layout. Existing discovery/social/creation/GPS/navigation regression suites remain applicable.

Live local visual QA used the real published Nedumangad → Palode → Thenmala → Thenkasi → Sundarapandiapuram journey at 360, 390 and 1440 px. Real Standard showed 3D buildings, pitch 45°, zoom 16.2, reliable bearing, blue location and separate planned/road lines. There were no console/page errors, horizontal overflow or overlapping controls. One real Directions response was reused for viewport QA to conserve usage; GPS was simulated. An additional 844×390 landscape check with real Standard and mocked Directions verified Follow, 45° pitch, no overflow, controls below the map and zero browser errors. This is browser verification, not a Prompt 12 physical-phone field test.

No persistent traveled GPS track, background GPS, Travel Memories, native app, voice navigation, offline navigation, traffic prediction or lane guidance is implemented. No dependency, environment, schema, RLS, authentication or production configuration changes are required.

Final checks: public/unit suite 74 passed (four configured-auth skips); full isolated creation/social/discovery/GPS/navigation suite 54 passed; configured authentication suite eight passed, covering the skipped cases. TypeScript, lint, configured production build, isolated database/security checks and whitespace checks passed. No hosted migration or data mutation was performed.

## Prompt 13 verification record

- Public/unit suite: 80 passed, four configured-auth skips. Separate configured-auth checks: eight passed.
- Full isolated creation/social/discovery/GPS/navigation run: 54 passed, two GPS consent-copy assertions failed. Restored the pre-start explanation without weakening the tests; all 20 Travel/GPS/navigation checks then passed, including both failures and final landscape/scroll changes.
- Final TypeScript, lint, configured production build, four isolated database/security check groups and whitespace checks passed.
- Real published five-stop journey with simulated GPS, actual Mapbox Standard and a reused real Directions response: 360×800, 390×844, 412×915, 844×390, 1280×900 and 1440×900. Pitched 3D map/location visible, separate routes, working HUD/arrival/gestures/recenter/pause/resume/end/completion. All five stop buttons clicked at every viewport; no overflow, control overlap or browser errors. Screenshots inspected.
- These are browser simulations, not physical outdoor driving verification. No commit, push or deployment is included.

## Prompt 14 integration

The travelled track is now implemented as a third, private GPS-derived source. Earlier Prompt 11–13 statements about no persistent track describe those implementation stages; see [travel-mode.md](travel-mode.md#prompt-14--private-actual-travelled-track) for current privacy, database setup, filtering, limits and phone tests. The Directions adapter, GPS watcher, stop order, arrival reducer, rerouting policy, 3D camera and Prompt 13 HUD are preserved. The purple track source updates independently, above the planned green line and below the blue road layers/DOM markers. Only accepted callbacks extend it; Directions responses never do. Mapbox receives no new track API requests.
