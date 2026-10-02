# Journey

Mobile-first social travel discovery centered on journeys and ordered stops. Foundation, discovery, journey details, authentication, Create/Edit Journey, profiles and the social loop are implemented. See [social-loop setup](docs/social-loop.md). See [creation setup](docs/journey-creation.md), [authentication](docs/authentication.md), [discovery](docs/public-discovery.md), and [journey details](docs/journey-details.md).

## Local setup

Requires Node.js 22.14+ and npm. On a new checkout, run `npm ci`, copy `.env.example` to `.env.local`, fill the public credentials, and run `npm run dev`. Keep an existing `.env.local` when it already contains your credentials. Open http://localhost:3000. Anonymous discovery and demo journeys work without Supabase; account/creation actions require it.

```powershell
npm run typecheck
npm run lint
npm run test:db
npm run build
npm run test:e2e
npm run test:creation
npm start
```

Database tests use isolated PostgreSQL with Supabase-managed Auth/Storage schemas simulated. Creation browser tests build separately into `.next-creation-tests` and use a local HTTP fixture for external services. Hosted account creation, uploads and Mapbox access need manual live verification. Tests do not create hosted records.

## Environment

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional legacy anon-key fallback |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Public Mapbox `pk.` token |

`.env.local` is ignored by Git. Never use a service-role or secret key in public variables. Restart/rebuild after public environment changes. No Dropbox settings or SDK exist.

## Supabase setup

Apply these migrations once, in order, through SQL Editor or your existing Supabase CLI workflow. On an existing project, apply only migrations not already applied:

1. `supabase/migrations/20261001000000_core_schema.sql`
2. `supabase/migrations/20261001010000_public_discovery.sql`
3. `supabase/migrations/20261001020000_journey_details.sql`
4. `supabase/migrations/20261002000000_journey_creation.sql`
5. `supabase/migrations/20261002010000_journey_media_15mb.sql`
6. `supabase/migrations/20261002020000_social_loop.sql`

The existing profiles, journeys, journey_stops, likes and saves remain. Auth users automatically receive a profile. Published journeys/stops are public; drafts and edits belong to the owner. The new save RPC validates and writes a journey with all its stops atomically. New/editor-saved sequence is `1..N`; existing historical/demo ordering is preserved until edited. Destination name/coordinates supplement the existing slug. Publication uses existing `status` and `published_at`.

The creation and image-limit migrations configure private `journey-media` Storage with image-only MIME/15 MB limits and owner/published-reference object policies. Only object paths are persisted; authorized reads receive signed URLs. Images are immutable so copies retain them; removed/abandoned objects may need manual cleanup. No image processing service is added.

Enable Email/password signup in Supabase Auth. Set Site URL and allowed `/auth/callback` URLs for localhost and deployment; see the authentication guide for confirmation/testing. Regenerate Supabase TypeScript types after future schema changes.

Optional demo seed: `npm run seed:demo -- <existing-demo-owner-uuid>`, review generated SQL and apply it manually. Local demo fixtures remain labeled and usable without login.

## Structure and routes

`src/app` contains pages/API routes, `src/components` contains UI/map/journey/destination/auth components, and `src/lib` contains typed service clients and helpers. SQL lives in `supabase/migrations`, verification tools in `scripts` and `tests`.

Public: `/`, `/explore`, `/destination/[slug]`, `/journey/[id]`. Accounts: `/login`, `/auth/callback`, protected `/profile`. Creation: protected `/create` and `/create?draft=[id]`; `/api/journeys` POST saves/publishes and `/api/journeys/[id]/images` POST uploads. Existing `/api/journeys/[id]/actions` handles social/copy actions. `/saved` lists private saved relationships to published journeys. `/profile/[username]` is public; `/profile` redirects to your profile and `/profile/edit` is protected. Owners edit drafts or published journeys at `/create?edit=[id]`. Owner deletion uses `/api/journeys/[id]` DELETE.

## Mapbox and Vercel

Configure a public Mapbox token for styles/tiles and permanent Geocoding, restricted to development/deployment origins. Permanent Geocoding needs a credit card on the account or enterprise access; addresses/places may not include precise landmarks. Selecting a Mapbox result immediately adds a stop with automatically captured coordinates. There is no manual coordinate entry. Search Box is not used for India's persisted stops. The reused JourneyMap draws the exact creator order; no directions or optimization API is called.

Deploy as a Next.js project on Vercel with compatible Node.js and default build/output settings. Set environment variables before building, apply SQL separately, and add deployment domains to Auth/Mapbox. The existing API uploads work locally up to 15 MB. Vercel functions have a smaller request payload cap, so uploads above that cap need a direct-to-Storage upload flow before deployment. The isolated test build setting is development-only; normal builds use `.next`.

## Scope

See [scope and decisions](docs/scope.md). No Dropbox, AI, route optimization, comments, followers, messaging, notifications, bookings, payments, recommendations or additional infrastructure. No changes are pushed to GitHub automatically.

Apply `supabase/migrations/20261002010000_journey_media_15mb.sql` in the hosted Supabase SQL editor to raise the journey-media bucket limit to 15 MB (15,728,640 bytes). Existing RLS and MIME restrictions stay unchanged.
## Deployment
Deployed with Vercel.
