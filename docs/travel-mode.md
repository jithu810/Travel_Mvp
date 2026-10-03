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

Only one current fix (latitude, longitude, accuracy, timestamp, optional valid heading/speed) exists in memory; no location history is collected. Fixes are never written into journey data, Supabase, browser storage, application URLs or application analytics/logging. The GPS-enabled map disables optional performance metrics and uses static attribution links without the dynamic map-feedback URL. Mapbox still supplies the basemap and can see requested tile areas, particularly when Center on me loads nearby tiles; this is not a private/offline basemap.

Existing versioned sessionStorage stores only journey ID, ordered stop IDs, completed IDs, status and update time. Refresh restores progress, then active sessions establish a new watch with no previous GPS position. Paused/terminal sessions do not request location. Invalid, changed-order and seven-day-old sessions are discarded. Storage failure leaves in-memory progress with a refresh warning. Progress is browser-tab-local, not account-synchronized; authentication architecture is unchanged and anonymous public travelers can use it.

## Browser limits and future boundary

Browser permission and suitable hardware/service availability are required. Browser geolocation can use the device/browser's location service; satellite GPS quality is not guaranteed. Background tabs, screen locks and OS/browser power policies may suspend updates. Continuous background tracking and offline use are not guaranteed. Resume/refresh needs fresh readings. A future native/PWA implementation may be needed for reliable background travel.

## Road navigation integration

Prompt 11 adds a separate Directions API adapter, independent blue road-route source, provider maneuvers, driving duration estimate and opt-in Follow. It uses the sole existing GPS fix and next ordered stop, with request cancellation/throttling and offline/error manual fallback. See [travel-navigation.md](travel-navigation.md) for architecture, named limits, configuration, privacy and the phone checklist. Routing necessarily sends coordinates to Mapbox in a POST body; application URLs/APIs/storage/logs remain free of GPS data. Prompt 12 adds conservative persistent-deviation rerouting without changing stop order: distance minus uncertainty >120 m, at least three distinct readings over eight seconds, and a 60-second automatic reroute cooldown. Stale/poor GPS cannot confirm deviation; existing request guards and manual fallback remain. Only Travel Mode opts into Standard/3D, with separate planned and road sources. No native SDK, traffic claims, voice, persistent GPS track, Travel Memories, new tables, migrations or RLS are included. No production/deployment configuration changes are required. The user reported Prompt 11 phone testing complete; Prompt 12 still needs physical-phone testing after review/deployment.

## Verification and changed files

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
