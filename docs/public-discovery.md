# Public discovery stage

## Implemented

- Home: branded hero, known-destination search with suggestions and keyboard support, five destination tiles, featured journeys, Explore CTA.
- Explore: five destinations, traveler filters, journey grid.
- Destination pages: descriptions, cover imagery, All/Solo/Couple/Friends/Family filters, journeys, optional Mapbox area map.
- Journey details: cover, destination, traveler type, duration, creator, aggregate likes, description, ordered stops, back links.
- Reusable cards, loading skeletons, error/retry UI, empty filters and not-found handling.
- Save controls are visibly disabled; liking, saving, creation and authentication flows are not implemented.

## Data sources

`src/lib/discovery/destinations.ts` defines the five known destinations. Search is local and makes no external place-search calls. `demo-journeys.json` contains 16 labeled samples: Goa 4, Varkala 4, Munnar 3, Kochi 3, Thenkasi 2, covering exactly the requested traveler groups.

Without Supabase configuration, the app uses demo journeys. A connected project uses published records via `get_public_journeys`; destination and traveler filters execute in PostgreSQL. If a destination has no published records, demos are shown. When a live dataset exists but a selected traveler type has no matches, the result is genuinely empty. Service failures show a visible error notice and labeled demo content for browsing; failed live detail requests show the retry UI. Demo IDs (`demo-goa-couple`, etc.) remain readable even when Supabase is connected.

## Apply the incremental migration

Apply `supabase/migrations/20261001010000_public_discovery.sql` after the foundation migration. Do not rerun/recreate the foundation schema.

Adds `destination_slug`, `traveler_type`, `duration_days`, `is_demo`, constraints, and a discovery index to journeys. Existing rows are preserved; rows without destination/traveler data are excluded from discovery until classified.

The public, security-invoker RPC delegates to a private function with an explicit published-only projection. The private function has a fixed search path and returns only journey details, ordered stops, creator display name/avatar, and aggregate like counts. It does not expose profile bio, private saves, or liker identities. Profile and like-table RLS/grants remain unchanged. Keep the `private` schema out of Supabase's exposed API schemas.

## Optional database demo seed

Local demos need no setup. To seed Supabase:

1. Create a dedicated demo user through Supabase Auth and copy its UUID. No fake Auth users are created automatically.
2. Run `npm run seed:demo -- <demo-user-uuid>`.
3. Review the generated `supabase/demo-seed.generated.sql`, then execute it in Supabase SQL Editor after both migrations.

The generator makes no network requests and requires no privileged key. It creates 16 published journeys and their stops, sets `is_demo = true`, and uses stable UUIDs to avoid duplicates. Reruns preserve existing matching rows. The public projection displays `Journey demo studio` for demo records regardless of the owner's profile name. Likes remain zero until actual interactions exist. Generated SQL is ignored by Git.

## Environment and verification

No new environment variables. Existing public Supabase URL/key connect live discovery. Mapbox is optional for area maps. Login is not required to browse.

Run `npm run typecheck`, `npm run lint`, `npm run test:db`, `npm run build`, then `npm run test:e2e`. Install the test browser once with `npx playwright install chromium`. Browser tests use the production build on port 3100 with no credentials, at desktop and iPhone-sized viewports. They check search → Goa → Couple → journey, destination browsing, empty filters, keyboard search, invalid URLs, images and horizontal overflow.

## Verification results

TypeScript, lint, production build, and both migrations' PostgreSQL/RLS tests passed. All six Chromium browser tests passed across desktop (1280 × 720) and mobile (390 × 664) viewports. The required search/filter/card flow passed without authentication. Homepage and destination screenshots were visually inspected; image loading and horizontal overflow checks passed. Live hosted Supabase/Mapbox checks remain pending project configuration.

Fixed during verification: two unescaped JSX apostrophes and traveler filter labels whose CSS capitalization did not match their accessible text. Filters now use explicit display labels. Generated seed SQL was tested locally only; no remote data was written.

## Photo sources

Cover photography is illustrative and is not user-uploaded or claimed to document a demo trip. Photos are stored locally for predictable loading.

- Goa: https://images.unsplash.com/photo-1512343879784-a960bf40e7f2
- Varkala coastal inspiration: https://images.unsplash.com/photo-1519046904884-53103b34b206
- Munnar: https://unsplash.com/photos/zoxqwWXy-EE
- Thenkasi waterfall inspiration: https://images.unsplash.com/photo-1432405972618-c60b0225b8f9
- Kochi: Brian Snelson, [Chinese Fishing Nets Cochin](https://commons.wikimedia.org/wiki/File:Chinese_Fishing_Nets_Cochin.jpg), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), cropped for display. Attribution is also present in the application footer.

## Scope boundary

Journey creation, Mapbox place search, Auth flows, saves/likes mutations, AI, recommendations, comments, followers, messaging, stories/reels, booking/payments, optimization and navigation remain deferred.
