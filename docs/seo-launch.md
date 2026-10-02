# Journey SEO and public launch

## What changed

Public routes remain `/`, `/explore`, `/destination/[slug]`, published `/journey/[id]`, and `/profile/[username]`. Login, creation/editing, saved collections, account redirects, profile editing, authentication callbacks, and API routes are not indexing targets.

Next.js metadata now provides homepage branding, destination-specific titles, distinct published journey titles/descriptions, public profile metadata, canonical URLs, Open Graph, and Twitter summary cards. Destination and Explore filter URLs canonicalize to their unfiltered public page. Public profile canonicals use the returned public username, preventing case-variant canonical duplicates.

Journey metadata reads `get_public_journeys` with an anonymous Supabase client. It never uses the viewer's cookies, draft detail, email, saved state, or individual likes. Owners still have access to their private drafts in the UI, but draft metadata is generic, has no social preview or JSON-LD, and uses noindex/nofollow. A profile's `?tab=drafts` view also uses generic noindex metadata. Server-side access checks remain unchanged.

Demo/sample journeys are noindex and omitted from the sitemap. They keep their existing demo UI and useful social descriptions.

## Production URL and Vercel variables

Set these in Vercel **before building/deploying**:

| Variable | Required value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Your actual public production HTTPS origin, e.g. the origin of your chosen domain, with no path, credentials, query, port, or fragment. Do not use localhost/LAN URLs or the test-only `journey.example` domain. |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing hosted Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing public publishable key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only needed instead of the publishable key for a legacy project; leave empty when using a publishable key |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Existing public Mapbox token |

No service-role key, OAuth secret, Dropbox credential, or new infrastructure is required. `NEXT_PUBLIC_SITE_URL` is documented as empty in `.env.example`; no domain has been guessed or written into `.env.local`.

Set the site URL for the Production environment. Leave it empty for non-launch previews that should not be indexed. Rebuild/redeploy after changes because public environment variables are compiled into the application. Locally, restart `npm run dev` after adding/changing the value.

If the site URL is missing or invalid, public page metadata uses noindex, robots disallows all crawling, and the sitemap is empty. No canonical or social URL is fabricated from the request Host, localhost, LAN IP, or a Vercel preview hostname. Existing development sharing can still fall back to the browser's origin.

## Sitemap and robots

`/sitemap.xml` is dynamic and contains home, Explore, all five known destinations, real published journeys, and public creator profiles surfaced by discovery. Existing anonymous SELECT/RLS on `journeys` is used with ID keyset pagination, so journey inclusion is not limited to the discovery RPC's latest 100 results. Actual `updated_at` timestamps are used for journey lastmod values.

Drafts, demo journeys, login, creation/editing, saved collections, account pages, API URLs, and query variants are excluded. Sitemap database errors return an error rather than a misleading successful empty journey list. No schema, migration, policy, or grant was added.

`/robots.txt` allows public crawling, excludes private/application paths, and references the configured production sitemap. Exact `/profile` and `/profile/edit` rules avoid blocking public usernames such as `editor`. Private pages and API/auth routes also receive `X-Robots-Tag: noindex, nofollow, noarchive`. Robots directives are not access controls; the existing server-side permissions still protect data.

## Sharing and images

Journey detail sharing and the existing published-journey URL/share controls use the configured canonical URL. Native Web Share and clipboard behavior remain in place. If clipboard access is unavailable on the LAN, the detail action displays the public URL to copy manually.

OG/Twitter images use a stable public local cover or a query-free HTTPS cover where available. Uploaded covers in private Supabase Storage use the stable `/images/goa.jpg` fallback. Signed URLs, private bucket paths, credential-bearing URLs, and URLs containing expiry/token query parameters never become SEO images. No object was made public, no Storage settings were changed, and no image proxy/CDN was introduced.

Limitation: uploaded private covers are not personalized social-preview images. Public profile sitemap entries currently come from creators present in the existing discovery projection (latest 100 journeys); other public profiles still have metadata/canonicals and can be crawled from their journey links. At large scale the single sitemap will need splitting before the standard URL limit is approached.

## Structured data

Homepage: `WebSite`. Destinations: `BreadcrumbList`. Published real journeys: `CreativeWork` with the public creator and destination. Public profiles: `ProfilePage` with a public `Person`. These follow the public content model, not bookings/products or invented ratings. See [CreativeWork](https://schema.org/CreativeWork) and [ProfilePage](https://schema.org/ProfilePage).

The shared JSON-LD component escapes `<` so user-supplied descriptions/bios cannot terminate the script tag. No private IDs, session state, emails, ratings claims, or saved collections are included. Journey IDs appear only where required in existing public URLs.

## After deployment

1. Open the production homepage, all five destinations, a real published journey, and a public profile directly; refresh each.
2. Check their canonical and OG URLs point to the intended HTTPS production origin, and inspect a journey as a social-preview bot.
3. Open `/robots.txt` and `/sitemap.xml`. Verify a real published journey is listed and drafts/private application paths are absent.
4. Verify the fallback OG image URL is publicly reachable.
5. Submit the sitemap to the search-engine webmaster tools you use. Metadata/structured data do not guarantee indexing or a rich result.
6. Inspect a shared journey with your preferred platform's preview/debugging tool; preview caches may need refreshing after metadata changes.
7. Verify existing email confirmation redirects and Mapbox access already support the deployed origin as part of normal launch testing. This task did not change Supabase Auth, Google OAuth, or Mapbox configuration.

## Changed files

- SEO utilities: `src/lib/seo/site.ts`, `metadata.ts`, `public-data.ts`
- JSON-LD: `src/components/seo/json-ld.tsx`
- Crawl routes: `src/app/sitemap.ts`, `src/app/robots.ts`
- Metadata: `src/app/layout.tsx`, `page.tsx`, `explore/page.tsx`, `destination/[slug]/page.tsx`, `journey/[id]/page.tsx`, `profile/[username]/page.tsx`
- Private noindex metadata only: `src/app/login/page.tsx`, `create/page.tsx`, `saved/page.tsx`, `profile/page.tsx`, `profile/edit/page.tsx`
- Share URL changes only: `src/components/journey/journey-actions.tsx`, `journey-builder.tsx`
- SEO headers: `next.config.ts`
- Environment example: `.env.example`
- Tests/fixture build: `tests/seo.spec.ts`, `tests/creation/seo.spec.ts`, `tests/creation/creation.spec.ts`, `scripts/start-creation-test.mjs`
- This document: `docs/seo-launch.md`

## Validation

Focused integration coverage includes homepage/destination/journey/profile metadata, canonical filter handling, owner and anonymous draft noindex, draft exclusion from sitemap, private page/API indexing controls, stable OG fallback, distinct journey metadata, social-bot initial HTML, JSON-LD injection safety, direct URL reloads, and canonical Share output. Integration data uses the isolated Supabase fixture and a reserved test-only domain; no hosted records or migrations are touched.

Results: public/demo suite 28 passed and 4 skipped (unconnected-preview Auth cases); configured localhost/LAN Auth/origin suite 10 passed; configured desktop/mobile SEO and existing creation/social suite 14 passed. TypeScript and ESLint passed. The final production build uses the normal environment, after the isolated unconnected-preview build. A transient test-server stream-close message during rapid navigation did not fail any final integration case.
