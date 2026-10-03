# Travel Mode — browser GPS

Real browser GPS is implemented. Automatic stop arrival is implemented. Basic provider road instructions and conservative rerouting are implemented; full native turn-by-turn navigation is not.

Public Journey Story → Use This Journey → overview → Preview Travel Mode → Start Journey. The existing published journey/stop reader, order, map lines and guarded session reducer are reused. Drafts remain unavailable on /travel/[journeyId], including to their owner; Travel Mode remains noindex.

## Location architecture and lifecycle

src/lib/travel/location-watch.ts owns one browser watchPosition/clearWatch subscription. src/components/travel/use-travel-location.ts connects its lifecycle to the existing ACTIVE state after session restoration. No discovery/Story page requests location. Before Start, the UI explains that location shows your position and detects stop arrivals.

- Start: NOT_STARTED → ACTIVE; request permission and wait for a fresh reading.
- Pause: ACTIVE → PAUSED; synchronously clear the watch and current fix, preserving stop progress.
- Resume: PAUSED → ACTIVE; create a new watch and wait for a new reading.
- End confirmation: ACTIVE/PAUSED → CANCELLED; stop location, preserve completed IDs.
- Final stop: ACTIVE → COMPLETED; stop the watch immediately.
- Route departure/unmount: clear the watch and freshness timer; ignore late callbacks.

Permissions API checks are performed only on active starts/retries. Browser denial is latched, and resume/retry cannot cause repeated permission prompts. After changing site permissions, Check location permission can restart only if permission is granted. Without Permissions API support, a recorded denial remains blocked for that component visit. A fresh page after changing browser settings can try again.

Geolocation uses enableHighAccuracy:true, maximumAge:0 and a 15-second timeout. HTTPS or trusted localhost is required; plain HTTP LAN origins normally cannot use GPS and receive an explicit manual fallback. No security restrictions are bypassed.

## Validated arrival and distance

src/lib/travel/location.ts contains named defaults:

- ARRIVAL_RADIUS_METERS: 100.
- MAX_ARRIVAL_ACCURACY_METERS: 50.
- MAX_LOCATION_AGE_MS: 15,000.

Finite, in-range coordinates, nonnegative accuracy and valid timestamps are required. Stale/future readings and readings predating the watch are rejected. Duplicate/out-of-order timestamps are ignored. A freshness timer removes an expired current fix and pauses automatic arrival; no old position remains labeled current.

Haversine calculates straight-line geographic distance to the next incomplete stop. It is not road/driving distance. Low-accuracy fixes may be shown with an explicit warning and approximate distance, but cannot complete stops.

Automatic completion requires ACTIVE state, fresh accuracy ≤50 m, valid coordinates on the authoritative next ordered stop, and distance + accuracy ≤100 m. Including accuracy gives a conservative boundary rather than trusting a reading just inside the radius. Each new reading can complete only one ordered stop, via COMPLETE_STOP and the existing session guards. A later nearby stop cannot skip an earlier stop. This is a basic arrival heuristic, not a guaranteed geofencing engine.

Stops missing coordinates remain in the list and must be completed manually. Mark Stop Complete remains clearly labeled as a manual fallback. It works with denied/unsupported GPS, insecure contexts, map failures and temporary location errors.

## Map, privacy and persistence

The existing line always represents the creator's planned stop order. Current position is a separate blue DOM marker; it does not change that line. Travel Mode alone uses Mapbox Standard with 3D buildings. Follow uses a 45° pitched camera and reliable moving heading; manual pan/zoom/rotation suspends it. Center on me restores the navigation camera and resumes Follow. Missing map support leaves the stop list, distance and manual controls usable.

One current fix (latitude, longitude, accuracy, timestamp, optional valid heading/speed) drives navigation and arrival. Prompt 14 records a separately filtered, private history from this same watcher. Raw location never enters journey/stop records, public APIs, application URLs or analytics/logging. Signed-in history uses the private track API and bounded owner-scoped browser recovery described below. The GPS-enabled map disables optional performance metrics and uses static attribution links without the dynamic map-feedback URL. Mapbox still supplies the basemap and can see requested tile areas, particularly when Center on me loads nearby tiles; this is not a private/offline basemap.

Existing versioned sessionStorage stores only journey ID, ordered stop IDs, completed IDs, status and update time. Refresh restores progress, then active sessions establish a new watch with no previous GPS position. Paused/terminal sessions do not request location. Invalid, changed-order and seven-day-old sessions are discarded. Storage failure leaves in-memory progress with a refresh warning. Progress is browser-tab-local, not account-synchronized; authentication architecture is unchanged and anonymous public travelers can use it.

## Browser limits and future boundary

Browser permission and suitable hardware/service availability are required. Browser geolocation can use the device/browser's location service; satellite GPS quality is not guaranteed. Background tabs, screen locks and OS/browser power policies may suspend updates. Continuous background tracking and offline use are not guaranteed. Resume/refresh needs fresh readings. A future native/PWA implementation may be needed for reliable background travel.

## Road navigation integration

Prompt 11 adds a separate Directions API adapter, independent blue road-route source, provider maneuvers, driving duration estimate and opt-in Follow. It uses the sole existing GPS fix and next ordered stop, with request cancellation/throttling and offline/error manual fallback. See [travel-navigation.md](travel-navigation.md) for architecture, named limits, configuration, privacy and the phone checklist. Routing necessarily sends coordinates to Mapbox in a POST body; application URLs, public APIs and logs remain free of GPS history. Prompt 14 adds a separate private persistence API and recovery buffer. Prompt 12 adds conservative persistent-deviation rerouting without changing stop order: distance minus uncertainty >120 m, at least three distinct readings over eight seconds, and a 60-second automatic reroute cooldown. Stale/poor GPS cannot confirm deviation; existing request guards and manual fallback remain. Only Travel Mode opts into Standard/3D, with separate planned and road sources. No native SDK, traffic claims, voice, persistent GPS track, Travel Memories, new tables, migrations or RLS are included. No production/deployment configuration changes are required. The user reported Prompt 11 phone testing complete; Prompt 12 still needs physical-phone testing after review/deployment.

## Verification and changed files

Prompt 13 polishes the existing next-stop HUD, clear GPS/navigation states, six-second arrival feedback, completed/current/upcoming progress and separated End confirmation. The route-updated message expires, and early deviation checking stays subtle. Follow/Recenter remains opt-in; pause remembers an enabled Follow only until fresh precise GPS returns. Small camera-only position/heading changes are ignored without changing the exact blue marker or arrival/routing inputs. See the navigation UX section in [travel-navigation.md](travel-navigation.md).

Automated/browser checks cover 360×800, 390×844, 412×915, 844×390 landscape, 1280 and 1440 desktop, including HUD, controls, overflow, arrival, Follow/resume and failure recovery. Outdoor deviation/rerouting, moving GPS/heading stability and mobile browser/background behavior still require physical-device testing. No database, RLS, authentication, environment, dependency or storage changes are needed.

GPS math/watch tests: tests/travel-location.spec.ts. Browser mocks: tests/fixtures/geolocation.ts. Five-stop browser lifecycle/privacy/fallback checks: tests/creation/travel-gps.spec.ts. Existing travel-session/manual tests and public/creation/database/auth regression suites remain applicable. Prompt 12 browser geolocation is mocked; its new rerouting/3D behavior still requires physical-phone testing. Continuous background tracking is not implemented.

Prompt 10 added:

- src/lib/travel/location.ts and location-watch.ts.
- src/components/travel/use-travel-location.ts and gps-status.tsx.
- tests/travel-location.spec.ts, tests/fixtures/geolocation.ts and tests/creation/travel-gps.spec.ts.

Prompt 10 updated:

- src/components/travel/travel-mode.tsx.
- src/components/map/journey-map.tsx.
- src/lib/journey/map-data.ts (coordinate guard accepts the minimal coordinate shape; validation behavior unchanged).
- src/components/journey/journey-route.tsx (GPS-assisted entry explanation).
- src/app/globals.css (blue marker style).
- tests/creation/travel-mode.spec.ts (GPS-era labels; existing manual regression coverage preserved).
- docs/travel-mode.md.

## Prompt 14 — private actual travelled track

Three independent map sources now exist: `journey-sequence` (creator-defined green planned stops), `travel-navigation` (Mapbox-generated blue current road route), and `travelled-track` (purple accepted GPS movement). Rerouting never rewrites history. Only Travel Mode receives the private track geometry; public details, profiles, Explore, saved journeys and remix responses remain unchanged.

`track.ts` owns compact `[longitude, latitude, timestamp_ms, accuracy_m, segment]` points, acceptance, restore validation, segmented GeoJSON and Haversine distance. It reuses existing GPS validation/freshness: finite in-range coordinates, nonnegative accuracy ≤50 m, age ≤15 seconds, monotonic timestamps, approximately 5 m movement. Reported speed above 75 m/s and distance inconsistent with elapsed time plus uncertainty are rejected for history only. GPS/navigation/arrival still receive their existing valid fix. The final arrival fix is evaluated before completion stops the watcher. No second geolocation watch exists.

Pause/resume, explicit GPS loss, hidden-tab suspension and refresh break the segment. A gap over 15 seconds also starts a new segment. No distance or line spans missing observations. The first point must come from a real browser callback; an isolated point has no invented line. Normal completion and manual end retain completed/cancelled private tracks. Each new Start has an independent UUID; previous server tracks are not overwritten. Reset for another signed-in trip waits until the terminal track has synced, preserving an unsaved offline buffer. Returning to Travel Mode can show the owner's latest track; active/paused progress still belongs to the existing guarded session reducer.

Travelled distance sums accepted point distances within segments, not road or planned distance. Elapsed duration is start-to-end and includes pauses; it is not driving time. The recorder caps each trip at 20,000 accepted points and 500 segments. On reaching either limit the recorded portion remains available, with a warning; navigation and arrivals continue. This MVP does not silently discard accepted history to make room.

Signed-in trips use owner/journey-scoped `sessionStorage` recovery, separate from existing progress. The bounded snapshot includes acknowledged point count, revision, and the exact pending batch so a crash after an ambiguous response can retry idempotently. Storage failures show a warning; memory collection continues. Anonymous trips stay in memory only: no GPS history in browser storage or server rows, and refresh loses their track. Account changes clear the visible recorder; the private API verifies the current server session and expected account before every write.

Server writes are serialized, incremental batches of at most 128 points / 32 KiB, every 30 seconds and on pause/end/completion. Visibility loss and unmount trigger best-effort flushes, with at most the current batch continuing after unmount. Periodic writes and local recovery do not rely on `beforeunload`. Network failures retain an exact pending batch, continue collecting locally and retry on the next interval, network recovery or explicit Retry. Ownership/version/validation failures stop automatic writes and retain local history rather than overwriting a newer tab's track. HTTP timeouts are bounded. There is no service-role client or new background/offline tracking system.

### Database setup

Apply `supabase/migrations/20261003000000_travel_tracks.sql` after existing migrations. It creates `travel_tracks`, owner/journey/start and journey foreign-key indexes, owner-only SELECT RLS, and `append_travel_track(jsonb)`. Direct client table mutations are revoked; the RPC verifies `auth.uid()`, journey visibility, immutable identity/start time, bounded numeric points and segments, timestamp order, distance sanity, finalization and revision CAS. A matching previous batch is acknowledged once. Foreign keys cascade when the journey or auth account is deleted. Raw points are never added to journeys or copied by remix.

This migration is tested in isolated PostgreSQL, not automatically applied to hosted Supabase. Until it is applied, the UI retains owner-scoped local history and reports private sync unavailable/pending rather than claiming a server save. No new environment variable, dependency, Mapbox permission or Storage bucket is required.

### Phone/outdoor checklist

Browser QA uses simulated geolocation; it cannot validate actual hardware movement. On HTTPS, test a real signed-in walk and drive, GPS drift/poor accuracy, an outage, pause/resume after moving, network loss/recovery, an active refresh, rerouting continuity and final private persistence. Confirm public views and a second account cannot read the track. Screen lock, background tabs and OS suspension may stop callbacks; missing sections remain gaps. Continuous background tracking is not promised. No Travel Memories, photos/notes, public history sharing, native app or other feature is included.

### Prompt 14 verification record

- Public/unit regression suite: 92 passed, four configured-auth skips. Configured authentication suite: eight passed.
- Full isolated creation/discovery/social/SEO/GPS/navigation/track suite: 60 passed. Final track policy/writer recheck: 12 passed; fresh-build track browser recheck: four passed.
- All five database/security groups passed, including the real new migration in isolated PostgreSQL. TypeScript, lint, configured production build and whitespace checks passed.
- Real public five-stop journey (`f6415d57-e8fd-438b-81bd-3e01eccb1057`), simulated GPS and real Mapbox Standard: 360×800, 390×844, 412×915, 844×390, 1280×900 and 1440×1000. Purple progressive track, independent road/planned sources, blue current marker, five stop markers and 45° 3D pitch were present at every size. No horizontal overflow or browser errors; pause/resume started a new segment. Directions were mocked in the final pass, with no additional track-specific Mapbox requests.
- Isolated authenticated browser checks verified private pause/outage/refresh recovery (including unavailable server storage), exact lost-response retry, final GPS arrival, retained completed/cancelled sessions, repeated-trip identity, owner-only reads, expected-account protection, CSRF rejection and payload limits. Anonymous history remained memory-only and cleared after refresh.
- These are browser simulations, not physical-phone field tests. The hosted migration was not applied. No commit, push or deployment was performed.
