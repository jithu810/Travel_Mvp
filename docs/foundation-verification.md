# Foundation verification

This stage includes only the project foundation specified by the user.

## Checks

- TypeScript: `npm run typecheck`.
- Lint: `npm run lint` (zero warnings allowed).
- Production build: `npm run build`.
- Migration/constraints/RLS: `npm run test:db` against isolated PGlite PostgreSQL. Supabase's Auth tables and JWT identity function are simulated.
- Production HTTP smoke test: all seven routes returned 200; an unknown route returned 404. Shared navigation and main content were present on each requested route.
- Public pages and production build work without credentials.
- `.env.local`, `node_modules`, and `.next` are ignored by Git.

## Limits

Live Supabase Auth, hosted database, Storage, and Mapbox checks require service credentials and manual project configuration. Storage buckets and upload policies await media requirements. No login or data-mutation UI is provided.

Browser preview failed to launch because the desktop browser runtime encountered a sandbox setup error. Mobile layout uses responsive Tailwind styles and accessible navigation, but visual browser verification remains pending.

ESLint is pinned to 9.39.5 because the installed Next.js React/import/accessibility plugins do not support ESLint 10. A trial of ESLint 10 failed and was reverted.
