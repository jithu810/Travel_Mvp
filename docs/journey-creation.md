# Create Journey (Prompt 4)

The existing Supabase Auth/browser/server clients and JourneyMap renderer are reused. Dropbox is not implemented. Supabase Storage is the sole provider for new journey images.

## Setup

Apply `supabase/migrations/20261002000000_journey_creation.sql` after all three earlier migrations in Supabase's SQL Editor. It adds destination name/coordinates, backfills existing destinations, creates `save_journey`, creates the private `journey-media` bucket, and adds Storage object policies. No service-role key is used. Existing `status = 'draft' | 'published'` and `published_at` represent publication; there is no redundant `is_published` column.

Existing public Supabase URL/key and Mapbox public token are the only application environment variables. Authentication settings remain unchanged. Mapbox permanent geocoding requires a credit card on the account or enterprise contract; enable that account capability and allow your development/production URLs on the token. Search uses `permanent=true` to support persisting selected coordinates. The Geocoding API covers addresses/places rather than comprehensive landmark/POI search. Mapbox Search Box currently documents US/Canada/Europe coverage and temporary-use results, so it is not used for India's stored journey stops. Stops must be selected from Mapbox results; coordinates are captured automatically. If search is unavailable, users can still edit and save existing drafts.

References: [Mapbox permanent Geocoding](https://docs.mapbox.com/api/search/geocoding/), [Search Box coverage and restrictions](https://docs.mapbox.com/api/search/search-box/), [Supabase private Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Workflow

`/create` keeps the existing login redirect. Signed-in visitors can enter title, known destination, traveler type, description and duration (defaults to one day). Selecting a Mapbox result immediately adds a stop, then clears and focuses search for the next place. Arrow keys and Enter also select results. Coordinates are never entered by users. Up/down controls and removal maintain the creator's exact order. Each stop has a collapsed Details & photo section for descriptions, optional rating (0–5), day within the journey's duration, and optional photos. There is a 50-stop limit.

New/editor-saved stops use sequence `1..N`. Historical demo/old journeys are not globally renumbered; an opened draft normalizes its existing order to `1..N` when saved. The map numbers/line follow the same stored order. No routing, distance-based reordering, optimization, AI or external itinerary service is used.

Save Draft writes one transaction with all stops and returns `/create?draft=<id>`. Drafts can be reopened from Your recent drafts on `/create`, or the edit link on their owner-only detail page. Edits include adding/removing/reordering stops, metadata and image replacement/removal. Copied drafts without coordinates can be saved privately; replace incomplete stops before publishing. Title/destination/type remain required for saved drafts. Publish also requires at least one stop, valid coordinates and consecutive sequence. Published journeys are viewable at `/journey/<id>` and destination discovery; published editing is outside this stage. Success provides the public URL, Share and View Journey.

Unsaved changes show a notice and a browser refresh/close warning. Save before navigating away. A successful draft save survives refresh. A stale `updated_at` returns a conflict rather than overwriting another tab's changes. Journey and stop changes roll back together on failure.

The publication confirmation uses `/create?published=<id>`, restricted to its owner, so refreshing the success screen works. It offers sharing/viewing rather than editing the published record.

## Images

JPEG/PNG/WebP, up to 15 MB, checked in the browser, server file signature/MIME/size validation, and bucket restrictions. No SVG/HTML is accepted. Upload first saves the current draft, then stores the image and saves its reference. Failures preserve the saved draft and allow a photo-free journey. Object paths are `journey-media/<user-id>/<journey-id>/cover/<file-id>.<ext>` or `.../stops/<stop-id>/<file-id>.<ext>`. Only paths are persisted, not expiring URLs.

The bucket is private. Owners can read their objects; authenticated owners can insert only under their own draft's prefix. Public reading is limited to objects attached to published journeys; private copied journeys can retain already-attached source images. Immutable filenames prevent replacement from breaking copies. The server generates one-hour signed URLs for authorized reads in the builder, detail page and discovery cards. Signed URLs are bearer links until expiry; refreshing a page creates fresh URLs. Optional unavailable images retain existing fallback behavior.

Removing/replacing a photo removes its record reference but does not delete the immutable object. Uploaded objects abandoned after a failed second save remain private and may require manual cleanup; no background storage-cleanup infrastructure is added. Storage upload is separate from the PostgreSQL transaction.

## Files and routes

Main files: `src/components/journey/journey-builder.tsx`, `src/components/map/place-search.tsx`, `src/lib/journey/editor.ts`, `media.ts`, `image-validation.ts`, `src/app/create/page.tsx`, `src/app/api/journeys/route.ts`, `src/app/api/journeys/[id]/images/route.ts`, `src/lib/supabase/database.types.ts`, and `supabase/migrations/20261002000000_journey_creation.sql`. Supporting changes: detail/discovery image resolution, draft-detail edit link, `scripts/test-creation-schema.mjs`, `tests/creation/creation.spec.ts`, local test fixture/build configuration, README and scope/setup notes.

Added builder and place search; editor/image validators and signed-media resolver; `/api/journeys` POST for atomic saves, `/api/journeys/[id]/images` POST for uploads; the creation migration; database/browser tests and local mocked service fixture. Updated `/create`, owner draft edit link, discovery/detail image resolution, Supabase types, package scripts and documentation. Existing Auth and Mapbox renderer files are unchanged.

Test/support files: `scripts/start-creation-test.mjs`, `tests/fixtures/supabase-creation.mjs`, `playwright.creation.config.ts`, `playwright.config.ts`, `next.config.ts`, `eslint.config.mjs`, `.gitignore`, `tsconfig.json`, `package.json`, `README.md`, and `docs/scope.md`. Next.js maintains its generated route-type imports in `next-env.d.ts`.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run test:db`, `npm run build`, `npm run test:e2e`, and `npm run test:creation`. Creation browser tests use local mocked Supabase/Auth/Storage and Mapbox responses with the real Next.js pages and API handlers. An isolated `.next-creation-tests` build prevents public test settings from replacing the real `.next` build. Actual migrations and RLS run in isolated PostgreSQL; only Supabase-managed Auth/Storage tables are simulated there. No hosted records are created automatically.

After applying the migration, sign in with a real account, create “3 Days in Varkala”, choose Couple, add three stops, reorder, upload optional cover/stop photos, save, refresh, and reopen the draft. Check draft/detail/media privacy in an incognito window, then publish and verify public detail and Varkala/Couple discovery. Hosted Storage uploads, Mapbox permanent access and account creation require this live test.

Verified locally: TypeScript, lint, production build and all database checks passed; 22 discovery/auth/detail tests and 6 creation tests passed on desktop/mobile. Builder screenshots were reviewed, with no horizontal overflow. Issues fixed: fixture builds initially reused embedded real public settings; accessible select locators needed role-based queries;  metadata edits no longer recreate the preview map; publishing now has a refreshable confirmation URL. No hosted migration or records were written during implementation.


Apply `supabase/migrations/20261002010000_journey_media_15mb.sql` in the hosted Supabase SQL editor to raise the journey-media bucket limit to 15 MB (15,728,640 bytes). Existing RLS and MIME restrictions stay unchanged.
