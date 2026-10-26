# Customize Stops: verified state and rerunnable local correction

The latest read-only catalog inspection shows **the hosted JWT correction is already complete**. The reported `P0001: JWT helper already exists` comes from the older, deliberately single-use guard. That error proves that attempt stopped at its guard; it does not reconstruct which earlier statements or actors produced the present state. No further hosted SQL is recommended solely because of this error. Retry the feature and assess any new runtime error separately.

Preflight: project `gwybjhqgnrpouwcdvusi`, 2026-10-21 **07:02:52.866945 UTC / 12:32:52 IST**, current/session user `postgres`, read-only transaction, metadata only. Web branch `backend/integrity-hardening`, HEAD `428182a0454c8f536c56024eeb0497f4f4a05c81`; all 42 pre-existing local files remain protected. Architect recorded the findings/test plan and explicitly released the implementation gate before these new files were written. Repository instructions, Backend role and Supabase skill were read; existing current documentation research was reused. Cached Supabase CLI 2.101.0 generated the new migration filename.

Compared with the earlier helper-absent preflight, the current catalog contains:

- Helper `private.customize_stops_jwt_uid()`, MD5 `03c0cfaba27c65a234582b361861c766`: postgres-owned, STABLE SECURITY DEFINER, empty search path, body only `select auth.uid()`, EXECUTE ACL only owner/custom role.
- Private RPC MD5 `c4369fa041b91e0fdc9f4349b78448c5`: exactly the original function with its identity initializer redirected to the helper. All seven custom-role policies match the expected corrected forms, including seven policy identity references. The three-argument public wrapper remains `6dbd165907594c440c4f8448cd6faad6`; canonical managed `auth.uid()` remains `ea3b41bf29e2ad573067939329aa088e`.
- Only the original `supabase_admin`-granted postgres ADMIN-only membership remains: INHERIT=false, SET=false. No custom-role parent memberships or applicable PUBLIC policies exist. Custom-role Auth schema USAGE, auth.users SELECT, Storage USAGE and BYPASSRLS remain false. Its canonical UID EXECUTE remains true.
- Storage policy hash remains `7856bb78162845593f2271a826dd1278`. The migration ledger exists but lists no migrations despite installed objects; this is not permission to replay migrations. Relevant default privileges were inspected; existing safe helper ACL is exact.

The new **unpublished, local-only** review candidate is:

`supabase/customize-stops-jwt-rerunnable/supabase/migrations/20261021070751_customize_stops_jwt_rerunnable.sql`

It corrects an already-installed media-free standalone RPC; it does not install the feature. Do not combine it with standalone reinstalls, October-5/October-20 proposals, the earlier single-use JWT correction or `supabase db push`.

The candidate accepts only the known original/corrected private function, individually known old/new policy forms, and an absent or exact safe helper. It normalizes CRLF versus LF for reviewed function hashes. Unknown helper body/owner/ACL, missing or altered policies, added PUBLIC policies, unexpected role attributes or memberships fail before mutation. Fully corrected state returns **`SUCCESS_NOOP`** before any DDL or grants. Recognized incomplete combinations converge with **`SUCCESS_CONVERGED`** without dropping any object or data.

Only the exact trusted postgres self-grant ADMIN=false / INHERIT=true / SET=false, granted by postgres, is accepted in addition to the original ADMIN-only link. If needed for the old function's ownership check, that temporary grant is added explicitly and removed by its grantor. Successful convergence leaves the original link only; a failure restores the complete entry state transactionally. Existing safe helpers are left untouched. New helper ACLs exclude public/client/default grantees. Client policies, public API, receipts, attribution, null inherited images, Auth/Storage grants and role attributes are preserved. JWT identity still comes only from the managed `auth.uid()` function and verified-request claim context, never an application user-ID argument or user metadata.

Validation commands:

```powershell
node --check scripts/test-copy-journey-selected-jwt-rerunnable.mjs
node scripts/test-copy-journey-selected-jwt-rerunnable.mjs --offline
node scripts/test-copy-journey-selected-jwt-rerunnable.mjs --run-local
node scripts/test-copy-journey-selected-jwt-rerunnable.mjs --inspect
```

The offline convergence-result regression passed **70 full RPC/RLS contract assertions**, including selected content, null images, draft detail/save compatibility, replay and authorization. PGlite does not model the non-superuser installer's role permissions; real PostgreSQL covers the entire candidate SQL.

The exact candidate, without role-name/hash substitutions, passed on PostgreSQL **17.11**, direct postgres **NOSUPERUSER / NOBYPASSRLS / CREATEROLE** login, dedicated synthetic databases:

| Database | Entry state | First result | Repeats |
| --- | --- | --- | --- |
| `journey_jwt_rerun_clean` | Standalone installed, JWT correction absent | `SUCCESS_CONVERGED` | Two `SUCCESS_NOOP` |
| `journey_jwt_rerun_mixed` | Synthetic mixed old/new policies, safe helper, old RPC, recognized self-grant | `SUCCESS_CONVERGED` | Two `SUCCESS_NOOP` |
| `journey_jwt_rerun_observed` | Clone of observed fully corrected metadata | `SUCCESS_NOOP` | Two `SUCCESS_NOOP` |

Catalog tuple identity/XMIN checks proved no-op runs did not rewrite functions, policies or memberships. Injected mid-policy failure restored exact entry catalogs and membership, including the synthetic partial self-grant. Unknown PUBLIC/policy/function/helper/ACL probes failed transactionally. All cases passed helper/client denials, absent/empty/malformed claims, ignored user metadata, scalar/JSON precedence, prepared-session A/B/fallback, copy/replay, cross-account refusal, attribution/null media and unchanged client/Storage metadata. The first clean-fixture runner stopped because its drift probe lacked ownership-check access; the fixture was corrected and resumed with `--resume-clean`, after which all three cases completed. The candidate SQL itself was unchanged by that fixture fix.

The machine-pinned harness rejects existing targets rather than resetting them. Inspection is read-only. Evidence is ignored under `.local-tests/customize-stops-pg/jwt-correction/jwt-rerunnable-results.json`. Local cluster identity is `7699008439210805272`, loopback `127.0.0.1:55441`, data under the same approved runtime directory; previous databases/clusters/global role attributes were preserved. Temporary memberships returned to their original baseline between cases. The server remains running without a Windows service; stop only this server when desired:

```powershell
& 'D:/Travel_Mvp/.local-tests/customize-stops-pg/pgsql/bin/pg_ctl.exe' -D 'D:/Travel_Mvp/.local-tests/customize-stops-pg/jwt-correction/data' -m fast -w stop
```

Independent review found no actionable issues in SQL SHA256 `A95CE894CBA1555E8D3B29181794C4FFDA1563BCA7C397F815A373FF37733FBC` and test SHA256 `9467FA596CF3E72B30FBDFE17179CC607E13D68FEA57E6F516C2EAD94B670DB7`. The reviewer independently reran the 70 offline assertions, syntax check and read-only inspection, and inspected real-PostgreSQL evidence without rerunning write modes. Architect verified all 42 pre-existing file hashes unchanged. No hosted writes, commits or publication occurred. Any future hosted application still requires explicit approval naming the project and exact reviewed file, plus fresh read-only preflight if state changed. Local SQL fixtures do not verify real Auth/PostgREST JWT signatures or Mobile/device behavior. If approved feature access ever needs disabling, separately approve revoking client EXECUTE on both public and private selected-copy RPCs; preserve helper, receipts and drafts. Do not broaden Auth/Storage permissions or drop objects as a retry strategy.
