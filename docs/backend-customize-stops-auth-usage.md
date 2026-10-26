# Customize Stops: missing auth schema USAGE

The smallest permission change is:

```sql
grant usage on schema auth to customize_stops_rpc;
```

This must be executed by the `auth` schema owner or an authorized grantor.
**The ordinary SQL Editor `postgres` role cannot apply it in the reported setup.**
Architect's read-only catalog results report schema owner `supabase_admin`,
`postgres` without USAGE grant option or permission to assume that owner, and the
RPC role without `auth` USAGE. The RPC role already has EXECUTE on `auth.uid()`;
do not add another function grant, table privileges or broader role membership.
Use the platform-authorized owner/admin path, such as Supabase Support, rather
than attempting `SET ROLE supabase_admin` or changing schema ownership.

The reviewable patch is `supabase/patches/customize_stops_auth_usage.sql`.
It contains just that one ACL mutation. This task prepared and tested it locally;
the specialist made no live Supabase calls or hosted database changes.

## Why installation could appear successful

The standalone file already contains a schema-USAGE grant. PostgreSQL can issue
`WARNING: no privileges were granted for "auth"` and continue when its installer
has USAGE but lacks grant option on a schema managed by another owner. That does
not establish the requested ACL. At runtime the private function executes as
`customize_stops_rpc`, so its `auth.uid()` initialization then fails with
`42501: permission denied for schema auth`, even though the function's EXECUTE
privilege is already present. The previous local installation fixture owned its
auth schema; the new managed-schema fixture covers this distinction.

## Authorized application and verification

First, the intended operator can inspect grant authority without changing data:

```sql
select current_user,
  has_schema_privilege(current_user, 'auth', 'USAGE WITH GRANT OPTION') as can_grant_auth_usage;
```

If this is false, **stop**; do not run the patch and treat a warning/no-op as a
fix. Request the schema owner or platform-authorized grantor to apply the exact
single GRANT above and verify its result. Do not rerun the full migration.

After the authorized grant, verify:

```sql
select
  has_schema_privilege('customize_stops_rpc', 'auth', 'USAGE') as auth_usage,
  has_function_privilege('customize_stops_rpc', 'auth.uid()', 'EXECUTE') as uid_execute,
  has_schema_privilege('customize_stops_rpc', 'auth', 'CREATE') as auth_create,
  has_table_privilege('customize_stops_rpc', 'auth.users', 'SELECT') as auth_users_select;
```

Expected: `true, true, false, false`. Then retry the existing Customize Stops
confirmation normally. The failed call's local reproduction wrote no draft or
receipt; the tested same-UUID retry and replay create exactly one result.
Do not claim any hosted retry succeeded until it has actually been observed.

Support request scope: the installed Customize Stops RPC fails with SQLSTATE
42501, schema `auth`; execution role `customize_stops_rpc` needs only schema
USAGE. Its `auth.uid()` EXECUTE is already effective, while current SQL Editor
`postgres` has no authority to grant the schema privilege. Request that exact
owner-authorized GRANT and verification, without table access, ownership changes,
role elevation or Storage-policy changes.

## Local evidence

`node scripts/test-copy-journey-selected-auth-usage.mjs --offline` tests the actual
full replacement RPC in PGlite. Removing only its auth-USAGE reproduces the exact
42501 with uid EXECUTE still true and no partial rows. The exact tiny patch then
restores access, and all 70 existing standalone assertions plus incompatible-path
rejection pass. Original SQL/test files were read, never modified.

`--run-local-auth-usage` passed a real PostgreSQL 17.11 managed-schema model in
a new synthetic database, `journey_auth_usage_test`, on the previously approved
isolated cluster at `127.0.0.1:55440`. The pinned data directory and cluster system
identifier were verified first. No existing role attributes, previous test
databases, retained data, service or server configuration changed.

This real test uses a minimal installed-state namespace/RLS probe with the same
definer role and `auth.uid()` initialization; the actual complete RPC is covered
by the PGlite test above. It proved:

- The non-owner installer has auth-USAGE but no grant option and cannot assume
  the owner; its exact GRANT warns/skips and leaves RPC USAGE false.
- UID EXECUTE is already true. Runtime fails with 42501/schema-auth before writes.
- The namespace owner's single USAGE grant fixes same-UUID retry and replay.
- Only RPC schema-USAGE changes. CREATE and `auth.users` SELECT remain false;
  function definitions, Storage policies/table grants and receipt ACLs remain
  identical. Anonymous RPC execution and direct client receipt access stay denied.

Node syntax and zero-warning scoped ESLint passed. Ignored local evidence is in
the permissions-test runtime root as `auth-usage-skipped-grant.log`,
`auth-usage-runtime-failure.log` and `auth-usage-results.json`. `--inspect` is
read-only; write mode refuses occupied targets. These are synthetic local tests,
not proof of hosted application, real Supabase Auth/PostgREST or device success.

No auth-user table permissions, Storage upload/read policies, service-role access,
RLS bypass, full migration rerun, commits, pushes or deployment are part of this
fix. Independent review should verify this narrow patch and evidence before any
application decision; all pre-existing migrations and unrelated work remain intact.
