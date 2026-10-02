# Authentication foundation

Supabase email/password signup, login and logout use the existing cookie-aware browser client. The server client verifies users with `getUser`; the existing proxy refreshes cookies. `/profile`, `/create` and `/saved` require a verified user and return visitors to their requested page after login. Public discovery and published/demo detail pages remain public. Creation and saved-page content remain placeholders.

Files added: `src/components/auth/auth-form.tsx`, `account-menu.tsx`; `src/lib/auth/session.ts`, `redirect.ts`; `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`; `tests/auth.spec.ts`. Updated: header, login dialog, profile, create and saved pages. Mapbox files were not changed.

## Supabase setup

No new tables or migrations are required for authentication. The existing core migration creates `profiles`, its owner-only RLS policies, and `on_auth_user_created`, which automatically inserts a profile for new accounts. Signup stores the supplied name in Auth user metadata; profile/header use it when `profiles.display_name` is empty. Auth metadata is display information, never an authorization source.

In Supabase Authentication, enable Email and password signup. Keep email confirmation enabled if desired. Set Site URL to `http://localhost:3000` for local testing, and later your production origin. Allow redirect URLs `http://localhost:3000/auth/callback` and your production `/auth/callback`. Confirmation returns through a PKCE code exchange; use the same browser/device that initiated signup. Keep the standard signup confirmation email template using `{{ .ConfirmationURL }}`. Configure SMTP for dependable production confirmation delivery; hosted email limits can affect development tests.

Existing environment variables in ignored `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`). No service-role key or additional environment variables are needed. Rebuild/restart after changing public environment variables.

## Manual verification

1. Open `/login`, select Sign up, enter name/email/password (at least eight characters). With confirmation enabled, verify the confirmation notice, open the latest confirmation email in the same browser, and confirm the profile page opens. If confirmation is disabled, signup signs in immediately.
2. Verify the profile shows your email/name and the header offers Logout. Refresh and open a new tab; the account should remain signed in. Existing cookies are refreshed by the proxy.
3. Logout from the header. Verify `/profile`, `/create` and `/saved` redirect to login. Discovery, sample journeys and maps remain accessible.
4. Open `/create` anonymously and log in; verify return to its existing placeholder without a journey editor. Test incorrect passwords and unconfirmed accounts for visible errors.
5. In Supabase Table Editor, verify one `profiles` row exists for the new Auth user ID. No upload, Dropbox, profile editing or Create Journey functionality is implemented.

Automated tests cover private-page redirects, public discovery/detail regression, safe return URLs, signup notices, login errors, cookie persistence after refresh, and logout. Browser account tests mock Supabase Auth responses; hosted signup/email delivery and real account persistence require the manual test above. Tests do not create hosted users automatically.

Verification: TypeScript, lint and production build passed. All 22 desktop/mobile browser tests passed. The existing journey-detail test was scoped to its selected-stop status and now closes an open Mapbox popup before clicking another marker; no Mapbox implementation changed.

### Testing on the development LAN

`next.config.ts` explicitly allows `192.168.1.4` for Next.js development assets and HMR. This setting does not change production behavior or API CSRF checks. If this machine's IP changes, update that exact hostname rather than allowing all origins. Restart `npm run dev` after changing it.

Email/password login does not use an authentication redirect URL. Cookies are scoped to each host, so log in separately on localhost and the LAN IP. For signup email confirmation on the LAN, also allow `http://192.168.1.4:3000/auth/callback` in Supabase's redirect URLs. Google OAuth is not required.

With the development server running on port 3000, run `npx playwright test --config playwright.auth-dev.config.ts` to test both origins. Login/session tests use intercepted Auth responses, not real user credentials.

References: [Supabase cookie-based server authentication](https://supabase.com/docs/guides/auth/server-side) and [PKCE code exchange](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession).
