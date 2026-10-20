# Customize Stops backend — review-only proposal

This backend change supports [Mobile PR #3](https://github.com/jithu810/Travel_Mvp_Mobile/pull/3)
without changing Mobile application code. It combines the required integrity
prerequisites and the selected-stop copy RPC into one reviewable Web PR.
GitHub publication is authorized. Applying hosted SQL, merging, deploying,
repairing real data or entering real provenance attestations is not authorized.
No SQL from this proposal has been applied to a hosted database.

## Ordered migration set and rollout gates

Apply none of these files merely because this PR exists. Rehearse on a separately
approved isolated restored snapshot and resolve its audit findings first:

1. `supabase/migrations/20261005000000_legacy_media_review.sql` creates the
   administrative provenance inventory and approval table. It does not activate
   integrity enforcement or automatically attest existing references.
2. Run the applicable read-only audit; review provenance and invalid historical
   metadata/stop ordering. Real attestations and repairs require their own approval
   and evidence. There is no bulk approval or silent zero-based stop conversion.
3. `supabase/migrations/20261005010000_rpc_integrity_hardening.sql` validates those
   gates and atomically installs RPC-only mutations, an RLS-bound execution role,
   journey-scoped media capabilities, approved policies and finite versions.
4. `supabase/migrations/20261020164047_copy_journey_selected.sql` adds selected-copy
   receipts and the RPC below. It depends on the first two migrations and must not
   be cherry-picked ahead of hardening.

The files follow the repository's existing October 1–4 history. A read-only hosted
metadata inspection on 2026-10-20 found existing public tables and an empty migration
ledger, while the selected RPC, private prerequisite tables and hardened sequence
constraint were absent. An empty ledger does not mean an empty schema and does not
authorize replaying the repository's core CREATE statements. Exact function bodies,
ACLs, memberships, schema exposure, RLS and legacy data still need comparison on
an approved target. No deployed parity or real-user provenance pass is claimed.

`supabase/audits/customize_stops_readiness.sql` works before and after the review
objects exist. It uses READ ONLY/ROLLBACK, returns aggregate data counts and
catalog metadata, and guards optional private objects. It reports absent approval
prerequisites as unavailable. `supabase/audits/backend_integrity.sql` provides the
detailed administrative legacy inventory after the review migration; its raw
identifier/media-path output must remain private. See
[backend-integrity-hardening.md](backend-integrity-hardening.md) for activation,
legacy attestations, compatibility and forward-recovery requirements.

## RPC and authorization

Client contract:
`copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid) -> uuid`.
The client generates one stable draft UUID for an immutable confirmation request.
The RPC accepts 1–50 unique source stop IDs from a published non-demo journey,
validates coordinates, preserves source ordering in compact 1-based sequence,
assigns fresh stop IDs and returns a private caller-owned attributed copy.
Durable authorized media is retained; skipped stops and source geometry are not
copied. Source rows are not mutated.

The Mobile review SQL has the correct core columns/signature but is incompatible
with hardened authorization: authenticated clients lose direct journey/stop INSERT
privileges and access to the retired `private.copy_media_path` helper. It also
omits media-capability propagation and allows direct receipt insertion. The new
migration preserves the hardening boundary instead of restoring those privileges.

A public SECURITY INVOKER wrapper calls a private SECURITY DEFINER implementation
owned by `journey_rpc`, the existing NOLOGIN/NOBYPASSRLS role that does not own data
tables. Owner-specific RLS still applies. Both entry points fix an empty search
path; PUBLIC/anon EXECUTE is revoked. Authenticated can execute both because the
wrapper runs as its caller. Direct SQL invocation of the private handler has the
same bounded validation. The private schema must remain unexposed to PostgREST.

Only `journey_rpc` receives receipt SELECT/INSERT grants with owner RLS. Clients
cannot fabricate or read receipts, capabilities or arbitrary journey mutations.
No UPDATE/DELETE receipt policy or RPC-role grant is added. Receipts survive
source/copy deletion; owning-profile deletion removes them.

An advisory transaction lock serializes the draft UUID. A source parent SHARE lock
matches hardened save's UPDATE-lock protocol before snapshotting metadata/stops.
The copy seeds its authorized media capabilities, then invokes hardened save
validation in the same transaction. Failure leaves no partial receipt, journey,
stops or capabilities. Timeout/deadlock errors use SQLSTATE 40001.

Same UUID/source/canonical stop set replays return the existing copy, including
an edited or published copy, without overwriting it. Changed selections/sources
and foreign-account collisions fail. Deleted copies are not recreated. Source
removal clears attribution through the existing FK, and later replay reports
unavailable rather than recreating anything. Existing whole-journey copying and
save behavior is supplied by the prerequisite hardening migration; the selected
migration does not replace those functions.

## Portable validation for reviewers

From the repository root with its existing dependencies:

```text
npm run test:db
npm run test:db:selected
```

The default database command includes historical schema/creation/track suites,
the full-chain integrity suite and the 84-assertion selected-copy suite. The second
command runs the selected-copy suite alone. These checks use disposable in-memory
PGlite with synthetic auth/Storage catalogs and read no environment files, hosted
credentials or databases. Package changes add scripts only; dependency versions
and the lockfile are unchanged.

The integrity suite covers 54 explicit rejection checks plus ownership/media,
versioning, lifecycle, seed ordering, legacy-gate and policy/privilege-drift upgrade
assertions. Selected-copy coverage includes owner grants/RLS, subset ordering,
new IDs, media/attribution, source immutability, one-stop copies, atomic invalid
inputs, client receipt forgery, collisions, edited/published replay, deletion and
user-deletion receipt cascades. Earlier independent reviewers found no actionable
findings in the stable SQL/test/audit snapshots and independently repeated the
84 selected-copy assertions and staged audit checks.

The readiness audit was tested before private review objects, after review and
after the full migration chain. An invalid synthetic legacy fixture was detected;
hardening rejected unresolved media without changing its rows. Fixture-only
attestation/metadata correction allowed activation. These results attest only
synthetic fixtures, not any real historical reference.

## Recorded real PostgreSQL SQL validation

On 2026-10-20 the owner separately authorized a new portable PostgreSQL 17.11
cluster under `D:/Travel_Mvp/.local-tests/customize-stops-pg`, loopback port 55439,
and database `journey_integrity_test_customize_stops`, with synthetic fixtures
only. Directory/port emptiness was verified before creation. No Windows service,
registry, global PATH or existing installation/data directory was changed.
Runtime binaries, logs and fixtures remain ignored and are not included in this PR.

The archive came from [PostgreSQL's Windows download flow](https://www.postgresql.org/download/windows/)
and [EDB's portable archive page](https://www.enterprisedb.com/download-postgresql-binaries),
file ID 1260616, version 17.11-5. SHA256
`80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F`
matched the [EDB contributor's published checksum](https://github.com/EnterpriseDB/edb-installers/issues/731).

The opt-in `scripts/test-copy-journey-selected-concurrency.mjs` passed six groups:

- Exact cluster identity, pinned loopback target and empty-schema/role safeguards.
- Simultaneous same-key/reordered-selection calls block then produce exactly one
  copy/receipt; SQL ownership/media/attribution, source immutability, auth denial,
  mismatched/cross-account collisions and edited/published replay also pass.
- Source-save/copy locking yields a coherent updated parent/stop snapshot.
- Five-second advisory timeout returns 40001 with complete rollback.
- Cancellation of only the known synthetic PID/application/database/user after
  writes returns 57014 and rolls back all transaction artifacts.
- Copy/source-delete locking retains the independent copy; deleted-source/copy
  replay never recreates rows. Deletion cases use fixtures created by the run.

That harness is deliberately machine-pinned, not a portable CI command. It uses
absolute approved-root psql/data paths, fixed host/port/user/database, cluster
identity verification and scrubbed libpq variables. Its write mode refuses the
retained nonempty database; do not rerun setup, reset/drop it, or redirect it to a
shared/hosted target. The separate generic integrity concurrency harness has not
been executed; its stale-save race remains a distinct pending case.

Read-only inspection retained three journeys, seven stops and three receipts.
The readiness audit returned zero editor/stop/version/row-bound failures. Its one
unresolved legacy approval count comes from the authorized synthetic foreign-path
copy: the legacy inventory is a preactivation gate, not a requirement to attest
later valid capability-backed copies. No bulk approval was entered. Independent
review inspected the six execution groups, target identity, role/RLS/grants,
failed-target absence and audit results without rerunning fixture writes.

At the recorded check the synthetic server was running only on `127.0.0.1:55439`.
On that specifically provisioned machine, inspect with:
`node scripts/test-copy-journey-selected-concurrency.mjs --inspect`.
Stop only that cluster with:

```powershell
& 'D:/Travel_Mvp/.local-tests/customize-stops-pg/pgsql/bin/pg_ctl.exe' stop -D 'D:/Travel_Mvp/.local-tests/customize-stops-pg/data' -m fast -w
```

## Remaining acceptance and approval

Real PostgreSQL tests exercise actual functions/roles/RLS with simulated
`auth.uid()` and Storage tables. They do not establish Supabase Auth token,
PostgREST, Storage API or Mobile physical-device parity. Nonproduction Supabase
end-to-end testing, full deployed catalog/grant comparison, isolated real-data
legacy audit/attestation, the remaining generic stale-save race and Mobile swipe,
accessibility/native-map checks remain pending.

Publication is review-only. Before any hosted activation, approve an exact target
and migration set after reviewing isolated-snapshot/parity evidence. Read-only
hosted audit SQL needs its own authorization; it must not repair data, enter
attestations or create billable resources. Real-data repair/attestation, hosted SQL
application, merges and deployment each remain separate approvals. Do not load
real data into the retained synthetic-only cluster.
