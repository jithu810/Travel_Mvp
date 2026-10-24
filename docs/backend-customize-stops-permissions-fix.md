# Customize Stops permissions fix — full replacement

Use this new complete file instead of the failed standalone migration:

`supabase/standalone-customize-stops-fixed/supabase/migrations/20261021030409_copy_journey_selected_standalone_permissions_fixed.sql`

Supabase CLI 2.101.0 generated its filename. It is a full standalone replacement,
not a patch that requires the failed file to have installed anything. The original
SQL, tests, documentation and all earlier migrations remain unchanged. This task
performed local synthetic testing only: no live Supabase access, hosted database
writes, commits, pushes or deployments.

## Cause and correction

The original order transferred the private function to `customize_stops_rpc`,
removed the installer's temporary role membership and then attempted:

```sql
grant execute on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) to authenticated;
```

A non-superuser installer no longer owned the function or held grant authority
at that statement. Real PostgreSQL reproduced the exact result:

```text
ERROR: 42501: permission denied for function standalone_copy_journey_selected
STATEMENT: grant execute on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) to authenticated;
```

The replacement moves that existing authenticated EXECUTE grant immediately after
the initial function ACL revocation, while the installer still owns the function,
and before ownership/membership changes. Only that ordering and explanatory header
comments differ. No grants were added or broadened, no roles gained BYPASSRLS,
and no function body, Storage policy or source/receipt rule changed. It retains
the standalone alternative's media-free copying and all validation/idempotency
behavior. Do not combine it with the old standalone or October 5/20 proposal.

## Local verification

`node scripts/test-copy-journey-selected-permissions.mjs --offline` reruns the
existing standalone suite against the replacement SQL without editing its source.
All 70 assertions and incompatible-alternative rejection passed. The test also
asserts the replacement is exactly the original plus the intended grant reorder
and header, preventing an unnoticed function-body or ACL expansion.

Real PostgreSQL 17.11 testing used a new isolated synthetic cluster at
`127.0.0.1:55440`, with data under
`D:/Travel_Mvp/.local-tests/customize-stops-pg/permissions-fix/data`.
Directory absence and unused port were checked before initialization. Existing
binaries were reused; no service, global configuration, retained database or
existing cluster role was changed.

The installer connected directly as `permissions_migrator`: both `current_user`
and `session_user` were that role, with NOSUPERUSER, NOBYPASSRLS, CREATEROLE and
CREATEDB. It owned the synthetic baseline schemas/tables. This is a useful
non-superuser CREATEROLE installer model, not proof of every hosted-role default.

The original exact file failed at the GRANT above. Connection termination rolled
back its complete transaction: the new execution role, receipt table, both RPCs
and policies were absent, and baseline policy/function definitions were unchanged.
The replacement then applied successfully under the same installer. The first
test's blanket zero-membership assertion exposed PostgreSQL 17's automatic creator
administrative link; fixture verification continued without replaying SQL.

Final checks verified:

- The private implementation belongs to `customize_stops_rpc`, which remains
  NOLOGIN/NOBYPASSRLS and cannot create roles.
- Authenticated can execute; anon cannot. Clients cannot read or write receipts.
  No Storage access or leftover schema CREATE grant exists for the execution role.
- No anon/authenticated membership exists in the execution role. The installer
  has neither effective INHERIT/USAGE nor SET ROLE access after cleanup.
- PostgreSQL 17 retains its automatic trusted creator link with ADMIN TRUE,
  INHERIT FALSE and SET FALSE. This is administrative metadata, not retained
  automatic execution or SET privilege. No privileged bootstrap cleanup was added.
- Authenticated copy and replay produce exactly one receipt/draft, with source
  ordering, owner/attribution and null inherited media. Anonymous RPC execution
  and authenticated receipt reads are denied.

Node syntax and scoped zero-warning ESLint passed. Evidence is retained in the
ignored local test root as `original-failure.log` and `permissions-results.json`.
The cluster/database remain available for read-only inspection with:
`node scripts/test-copy-journey-selected-permissions.mjs --inspect`.
Write mode refuses occupied targets; do not reset/drop either retained cluster.
Synthetic auth/Storage catalogs do not establish real Auth/PostgREST or device
behavior. No live project was accessed for this fix.

## SQL Editor instructions for a separately approved application

1. Confirm the intended project and that the failed transaction left no selected
   RPC, standalone receipt table or same-name execution role. If conflicting
   objects remain, stop for review; do not drop them or run cleanup guesses.
2. In Dashboard → SQL Editor, open a **new query** using the intended `postgres`
   role. Paste the **entire new replacement file above**, including BEGIN/COMMIT,
   and run it once. Do not run the old file first or paste this after the old one.
3. If it errors, retain the exact error and stop. Do not replay all repository
   migrations or manually change migration-history records. If it succeeds,
   verify the RPC/owner/grants and perform the separately approved synthetic
   Auth/PostgREST checks before claiming application success.

These instructions make the result reviewable; they do not authorize a hosted
application in this local-fix task. The previous standalone acceptance gates,
including a named nonproduction Supabase target and real API/editor checks,
remain applicable. Independent review of this replacement and its local evidence
is the next step before presenting it for any application decision.
