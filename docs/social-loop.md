# Journey social loop

The existing schema, cookie-based Supabase Auth, Create Journey editor, discovery cards and exact-order Mapbox preview are reused. No new social tables, auth provider, Dropbox or infrastructure are introduced.

## Setup

Apply outstanding migrations in filename order. The new migration is `supabase/migrations/20261002020000_social_loop.sql`, after the creation and 15 MB image-limit migrations. Do not rerun previously applied migrations. It reuses `profiles`, `journeys`, `journey_stops`, `journey_likes`, `saved_journeys` and `copied_from_journey_id`. No application environment variables or Auth dashboard changes are added.

The migration provisions a default unique-length username for existing/new profiles, adds profile length/ownership constraints, and exposes a restricted public profile RPC. It updates existing save/copy RPCs and Storage insert policies, restricts like/save inserts to published journeys, and creates private `profile-avatars` Storage with JPEG/PNG/WebP and 15 MB restrictions. Existing `status = draft` is the unpublished state; no duplicate `is_published` column is added.

## Behavior and routes

- `/create?edit=<id>` loads only the current user's journey. Both draft and published editing reuse JourneyBuilder. Published edits use Save Changes and retain publication status/date; no editor duplicate or editing copy is created. Existing draft resume/publication confirmation URLs still work.
- `/journey/<id>` keeps its existing stop/map layout. Owners see Edit/Delete. Published journeys support like/unlike, save/unsave and Use This Journey. Anonymous actions open the login prompt. Local demo IDs remain explicitly read-only account samples; hosted seeded UUID samples support actions.
- Use This Journey invokes the existing transactional copy RPC, gives every copy a new owner/ID and every stop a new ID, preserves destination/stops/metadata/order, records only the direct source and redirects to `/create?draft=<new-id>&copied=1`. The original is unchanged; copies can be copied again after publication.
- Source attribution links only to an accessible source. A private/unavailable source never exposes its title to unrelated viewers. Source deletion sets the relationship to null without deleting independent copies.
- `/saved` requires authentication. Its existing JourneyCards show only published saved journeys and provide a remove control. Like/save primary keys and idempotent inserts prevent duplicates; counts come from the database.
- `/profile` redirects to your username page. `/profile/<username>` exposes avatar, display name, username, bio, published count and published journeys. Only the owner sees the Drafts tab/data. Public RPCs do not expose emails, timestamps, private profiles or saved relationships.
- `/profile/edit`, `/api/profile` PATCH and `/api/profile/avatar` POST edit the owner's profile. Usernames are case-insensitively unique and validated (3–30 letters/numbers/underscores, excluding reserved `edit`). Internally journeys keep stable user IDs; profile links resolve the latest username. Old external username URLs are not retained as aliases.
- `/api/journeys/<id>` DELETE checks authentication, same origin and ownership; database cascades remove stops/likes/saves. Inline confirmation prevents accidental UI deletion. Referenced media is not blindly deleted.
- Anonymous navigation shows Explore/Login. Authenticated navigation adds Create Journey/Saved/Profile and retains Logout.

## Media

Copying uses durable object paths, not temporary signed URLs. The current immutable objects and reference-based read RLS already let independent copies keep their cover/stop images after the source is removed or replaces a photo. This implementation deliberately reuses those objects rather than duplicating every file. Missing/inaccessible optional objects and temporary signed URLs are omitted without failing the copy. Display URLs are signed afresh for the authorized viewer.

Journey and avatar objects remain immutable; replaced/abandoned unreferenced files may be cleaned manually after checking all references. No cleanup service is added. Avatar uploads use a separate private bucket, owner-prefixed insertion and public read access only for the currently referenced avatar. API validation checks image size, MIME and file signatures. The 15 MB local upload limit remains; Vercel's smaller function request limit still requires a future direct-to-Storage transport for larger deployed uploads.

## Security and verification

All mutations verify the logged-in user and request origin, then use that user's existing Supabase client/RLS. The editor RPC atomically validates and saves stops and rejects stale versions. Public profile/collection RPCs project only approved fields and explicitly gate drafts and saved collections by `auth.uid()`.

`npm run test:db` exercises actual migration SQL in isolated PostgreSQL with Supabase-managed Auth/Storage schemas simulated. Two-user assertions cover unauthorized edits/deletes/profile/interaction writes, published-only actions, uniqueness/counts, private drafts/saves, ordered metadata copies, direct remix chains, independent source deletion and media access.

`npm run test:creation` covers the existing creator flow and a two-user browser social loop on desktop/mobile with local Supabase and Mapbox fixtures: owner published editing/media replacement, nonowner edit/delete rejection, repeated like/unlike/save/remove, private copied draft, stop edits/reordering/publication, source attribution, profile username conflicts/renaming/avatar upload, anonymous login prompts, delete confirmation and surviving copies. No hosted records or credentials are created by these tests. Live hosted verification requires the new migration to be applied.

Changed implementation groups: `src/app/create`, `src/app/journey/[id]`, `src/app/profile`, `src/app/saved`, existing journey API routes plus profile/delete routes; JourneyBuilder/JourneyActions/JourneyCard, owner/save/profile controls and navigation; profile queries/validation, shared media normalization and Supabase types; new migration and focused SQL/browser fixture/tests. Existing discovery/Auth/detail regression tests are retained with expectations updated for the authorized navigation, card saving and copy-editor redirect.

Issues addressed during verification: default usernames must fit the existing 30-character constraint; test Auth fixtures need CORS; populated bio text needs a stable accessible label; source unlinking updates the optimistic version; optional source failures must not block the independent journey.

## File inventory

New: `supabase/migrations/20261002020000_social_loop.sql`; `src/lib/profile/queries.ts`, `src/lib/profile/validation.ts`; `src/app/profile/[username]/page.tsx`, `src/app/profile/edit/page.tsx`; `src/app/api/profile/route.ts`, `src/app/api/profile/avatar/route.ts`, `src/app/api/journeys/[id]/route.ts`; `src/components/auth/profile-form.tsx`; `src/components/journey/owner-actions.tsx`, `src/components/journey/save-journey-button.tsx`; `tests/creation/social-loop.spec.ts`; this document.

Updated: `src/app/create/page.tsx`, `src/app/journey/[id]/page.tsx`, `src/app/profile/page.tsx`, `src/app/saved/page.tsx`; `src/app/api/journeys/route.ts`, `src/app/api/journeys/[id]/actions/route.ts`, `src/app/api/journeys/[id]/images/route.ts`; `src/components/auth/account-menu.tsx`, `src/components/ui/header.tsx`; `src/components/journey/journey-builder.tsx`, `journey-actions.tsx`, `journey-card.tsx`, `journey-grid.tsx`; `src/lib/discovery/queries.ts`, `src/lib/discovery/types.ts`, `src/lib/journey/media.ts`, `src/lib/journey/detail.ts`, `src/lib/supabase/database.types.ts`; `scripts/test-creation-schema.mjs`, `tests/fixtures/supabase-creation.mjs`, `tests/discovery.spec.ts`, `tests/journey-detail.spec.ts`; `README.md`, `docs/scope.md`.

Verification completed: TypeScript, zero-warning lint, production build, both database suites, eight creation/social browser tests, eight existing Auth tests, six discovery and eight journey-detail regression tests across configured/isolated-demo runs. Local visual review confirmed the mobile layout has no horizontal overflow. Service/browser tests use mocks; real hosted operation still needs the new migration and a live two-account smoke test.
