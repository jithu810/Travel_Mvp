# Scope and decisions

## Confirmed requirements

- Product name: Journey V1.
- Inspect the repository and prepare the foundation before writing application code.
- Receive product specifications in stages.
- Do not implement future features.
- Start the project in the empty local workspace `D:\Travel_Mvp`.

## Foundation inspection

The inspected workspace is `D:\Travel_Mvp`. It contained no files and was not a Git repository. No `AGENTS.md` was found in the workspace or its parent directory.

Available local tools:

- Git 2.48.1.windows.1
- Node.js 22.14.0
- npm 10.9.2

Tool availability does not establish a technology choice.

## Foundation specification

- Mobile-first Next.js/TypeScript App Router application with Tailwind CSS.
- Supabase PostgreSQL, Auth, and Storage through typed browser/server clients with cookie refresh.
- Mapbox GL JS basic map; Geocoding/Search integration is deferred until its feature stage.
- All seven requested routes and UI/map/journey/destination/auth component groups.
- Vercel-ready default Next.js configuration.
- Core schema: profiles, journeys, journey_stops, journey_likes, saved_journeys, constraints, timestamps, and RLS.

## Architecture decisions

- `src/app` for routes; `src/components` for component groups; `src/lib` for helpers; `supabase/migrations` for SQL.
- Placeholder pages without mock records or data mutations.
- Draft/published journeys; published records require a publication timestamp.
- Historical zero-based stops are preserved. New/editor-saved journeys use consecutive 1-based sequence with optional paired coordinates for incomplete private copied stops.
- Profiles, likes, and saves are private to their owner. Published journeys/stops are public.
- A private Supabase Storage bucket serves journey/stop images through access-controlled signed URLs.
- PGlite is a development-only policy test tool, not deployed application infrastructure.

## Deferred scope

OAuth/password recovery remains deferred. No Dropbox, AI, route optimization, comments, followers, messaging, notifications, bookings, payments, recommendations, microservices, Redis, vector/graph databases, Python services, or Kubernetes.

## Public discovery stage

The user authorized home destination search, five destination pages, traveler filtering, journey cards/details, realistic labeled demos, and anonymous access. Implementation preserves the foundation structure. See [public discovery](public-discovery.md) for migration/seed details and verification.

## Journey detail stage

The user authorized public/owner-private details, ordered stops with optional metadata, a Mapbox sequence map, linked marker/list selection, like/save mutations, sharing, basic account prompts, and private copying without an editor. See [journey details](journey-details.md). Stop order is now named `sequence`; existing data values are preserved.

## Manual configuration

Email/password signup, login, logout, persistent sessions and the basic account profile are now authorized and implemented. See [authentication](authentication.md). Existing profile schema and policies are reused. Public discovery/detail access and Mapbox implementation are preserved.

The authenticated builder, ordered Mapbox place search, draft resume, publication and Supabase image uploads are authorized in Prompt 4. See [journey creation](journey-creation.md).

Supply public service credentials, apply outstanding migrations to Supabase in order, and configure Auth/Mapbox deployment domains and permanent-geocoding account access. Live third-party integration checks require those services to be connected.

## Social loop stage

Owner draft/published editing, deletion, public profiles and profile editing/avatar uploads, private saved collections, published-only likes/saves/copies and direct remix attribution are implemented using existing tables, Auth and editor. See [social loop](social-loop.md). Public profile projections expose no account email or private drafts.
