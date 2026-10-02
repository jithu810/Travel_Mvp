# Journey detail stage

The existing foundation and discovery pages are preserved. `/journey/[id]` now provides the full detail experience; no Create Journey editor is implemented.

## Apply the incremental migration

Apply `supabase/migrations/20261001020000_journey_details.sql` after the two existing migrations. Do not recreate the foundation.

- Renames `journey_stops.position` to `sequence`, preserving stored values, uniqueness and order. Sequence is zero-based; the UI displays consecutive 1-based stop numbers. The discovery RPC retains its legacy `position` JSON property for existing cards.
- Adds optional `photo_path`, `rating` (0–5), and `day_number` (>0) to stops.
- Adds `copied_from_journey_id` to journeys. Deleting the source sets this reference to null without deleting the copy.
- Adds `get_journey_detail`: returns a published journey or the signed-in owner's draft, ordered stops, limited creator information, aggregate likes, and the viewer's own like/save state. It exposes neither private profile bio nor liker identities.
- Adds `copy_journey`: an authenticated, RLS-protected transaction captures the source and stops in one read snapshot, creates a draft owned by the caller, and copies stop fields in sequence. Likes and saves are not copied. A failure rolls the entire operation back.

Private helper functions remain in the unexposed `private` schema. Public wrappers have explicit execute grants. Existing journey/stop ownership policies and like/save unique constraints remain active.

## Detail UI

Cover, destination, traveler type, duration, creator avatar/name/username, description, current like count, actions, map and timeline. Creator links use the existing `/profile?user=<id>` structure; there is no new social profile system. Optional fields have safe fallbacks. Drafts show an owner-only label. Unknown or inaccessible journeys show not-found; database/session errors show the existing retry boundary.

Timeline stops use `sequence`. Photos, ratings and day numbers render only when supplied. Missing stops have an empty state.

## Map

`JourneyMap` creates numbered Mapbox markers, popups, a GeoJSON line and automatic bounds fitting. The line uses the same sequence as the timeline. Clicking a list stop selects its marker; clicking a marker selects the list stop and shows its name/description.

No directions, routing, geocoding, optimization, or distance-based reordering is performed. Lines represent connections between stored stops, not drivable roads. Missing/invalid coordinates are disclosed and break the line; they are never inferred for real journeys. A coordinate-based route overview remains usable when the token is absent, WebGL is unavailable, or map loading fails. The map has a loading state, timeout and cleanup.

Local sample coordinates are approximate illustrative positions and are labeled accordingly. Demo stop descriptions are examples, not verified trip instructions.

## Social actions and sign-in

`/api/journeys/[id]/actions`:

- GET reads authenticated session and current action state; responses are private/no-store.
- POST accepts `like`/`save` with an explicit boolean `enabled`, or `copy`. The server verifies the user, checks journey visibility, and uses the public Supabase key with the user's cookies. Like/save inserts ignore duplicates; deletions target only the current user's relationship.
- Cross-origin mutation requests are refused. RLS remains the final authorization boundary.

Anonymous Like, Save, and Use This Journey actions open an accessible sign-in dialog. Configured projects can sign in existing accounts with email/password. Registration, OAuth, password recovery and profile editing are outside this stage. Create an existing test user through Supabase Auth and enable its password sign-in method for live testing. No privileged key is needed in the app.

Share uses the Web Share API, falling back to clipboard copying of the canonical `/journey/[id]` URL and a confirmation. Private drafts cannot be shared publicly.

Use This Journey creates a private copy and opens it at `/journey/<new-id>`. The owner can inspect the copy; editing is deferred. Local `demo-*` fixtures are read-only because they have no database UUID. Seeded demo journeys support real account actions through their database UUIDs.

## Demo seed

After all three migrations, run `npm run seed:demo -- <existing-demo-owner-uuid>`, review the generated SQL, and apply it manually. The generator adds illustrative coordinates and detailed stop descriptions to the same 16 samples. Reruns avoid duplicate records and can fill missing coordinates on existing demo stops; they preserve existing descriptions and coordinates. The generator makes no network requests and does not create Auth accounts.

## Environment

No additional environment variables. Existing public Supabase URL/key configure Auth/database access; `NEXT_PUBLIC_MAPBOX_TOKEN` enables the geographic map. Service-role keys are never used by these actions or sent to the browser.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run test:db`, `npm run build`, then `npm run test:e2e`.

Verified locally: typecheck, lint, database checks and production build passed; all 14 desktop/mobile browser tests passed.

Database checks execute the actual migrations in isolated PostgreSQL with a simulated Auth identity. They cover owner-only drafts, visibility of stops, creator projection, optional fields, like/unlike, save/unsave, duplicate prevention, copy ownership/provenance/sequence, and rollback after an injected stop-copy failure.

Browser checks run at desktop and mobile sizes. They cover existing discovery, timeline/marker numbering and selection, exact line geometry (including deliberately non-shortest ordering), missing coordinates, login prompts, correct clipboard URL, authenticated action state/reload/errors/copy redirect through mocked API responses, and cross-origin rejection. Hosted Supabase authentication and real Mapbox tiles still require project credentials for live verification.

Issues fixed during verification: TypeScript JSON coordinate inference, unused test destructuring variables, an ambiguous alert selector that also matched Next.js's route announcer, and a copy row lock that incorrectly excluded another user's public journey under RLS. Copies now read a single visible source snapshot without requiring source ownership.
