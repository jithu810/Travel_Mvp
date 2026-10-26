# Backend integrity hardening — local implementation

## Independent review corrections — 2026-10-19

The activation migration now recreates seven retained client policies rather than
trusting their names: owner journey deletion, journey and stop reads, journey-media
reads/uploads, and avatar reads/uploads. Recreation resets command, role targets,
permissiveness and expressions; unexpected additional policies still abort.
New execution-role policies continue to be created explicitly. All policy changes
remain inside the activation transaction.

The metadata gate now mirrors save's destination/traveler requirements for all
existing journeys. Missing metadata, blank named destinations and missing named
destination coordinates abort without data repair. Known legacy slugs with null
destination_name retain the supported fallback and remain copyable. The audit
reports the same incompatibilities.

Correction validation:

- `npm run test:db` passed all historical suites and the expanded integrity suite.
- `npm run test:db:integrity` passed again after adding an explicit assertion for
  the existing `{id,status,updated_at}` save response contract.
- Seven same-name policies deliberately changed to `FOR ALL TO PUBLIC USING
  (true) WITH CHECK (true)` are restored to the same complete catalog definitions
  as a clean activation. The test reproduces cross-owner deletion before
  activation, then verifies wrong-owner deletion denial and owner deletion success.
- Private journey/stop visibility and cross-owner journey-media/avatar upload
  denial pass after drift repair. Existing lifecycle tests cover publication,
  save/copy, immutable Storage, versions and deletion contracts.
- A late unknown-Storage-policy failure rolls back policy recreation, role and
  capability-table creation. Twelve incomplete metadata cases (draft/published)
  abort atomically, preserve user rows and retain pre-activation grants.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed;
  no type generation or incremental cache writes were requested.
- `npm run lint` passed with zero warnings. `git diff --check` passed for tracked
  changes; new migration/test files are exercised by the database suite and lint.

Files changed for these corrections only: the activation migration,
`supabase/audits/backend_integrity.sql`, `scripts/test-integrity-schema.mjs`, and
this document. Previously existing branch work was preserved. Web source/RPC
signatures and error mapping are unchanged. Browser end-to-end and real-session
Supabase verification were not run as part of these corrections.

Status: implemented locally on `backend/integrity-hardening`; pending independent
review corrections and isolated Supabase verification. No hosted backend has been contacted.
No deferred aggregate triggers are included. Historical migrations are unchanged.

## Enforcement boundary

Authenticated clients retain journey/stop reads and owner-authorized parent
journey deletion. Journey INSERT/UPDATE and all stop mutations are RPC-only.
The migration removes the old write policies and table **and column** privileges
from PUBLIC, anon and authenticated, then rejects unexpected inherited mutation
privileges. Profile, likes, saves and travel-track APIs retain their existing rules.
Disabled RLS, client table ownership/bypass roles and unexpected journey/stop/
Storage policy names also abort activation. Activation deterministically recreates
all retained client journey/stop and Storage policies with approved commands,
roles and expressions. Expected names cannot preserve drifted definitions.

`journey_rpc` is a new NOLOGIN, NOINHERIT, NOBYPASSRLS role. It owns only the save,
copy and media helper functions, not application or Storage tables. No client is
a member. Its grants are limited to journey/stop reads, explicit insert/update
columns, stop deletion, media capability management and Storage bucket/name
reads. It cannot delete journeys, update owners/demo/lineage, write timestamps,
update stops in place, modify Storage objects or read their other metadata.
Functions fix search_path and qualify application objects. Temporary CREATE
privileges needed for ownership transfer are revoked before commit.
The migration administrator also receives temporary role membership for ownership
transfer on non-superuser installations; it is removed before commit.

RLS remains enabled for the execution role. Its journey UPDATE USING condition
also admits published sources because PostgreSQL row-locking SELECT needs UPDATE
visibility. WITH CHECK requires the caller's ownership; user_id is not writable.
Save additionally selects the caller's own parent explicitly before mutation.
Copy always selects a published source and constructs a caller-owned private
draft with fresh stop IDs and immediate-source lineage. It then calls save to
apply the same complete validation. Payload owner/demo/lineage fields are ignored.

Aggregate invariants are validated by the two atomic RPCs. Ordinary row CHECK
constraints provide additional protection. Administrative direct writes remain
trusted operations and must maintain aggregates and media capabilities themselves;
there is deliberately no trigger guarantee for arbitrary privileged writers.

## Media authorization

`private.journey_media_authorizations` records paths authorized for each journey.
It is RLS-protected and inaccessible to clients. Authorization has three sources:

1. New upload: exact caller/journey Storage prefix and an existing journey-media
   object. Existence is checked under the RLS-bound execution role.
2. Retained media: both a capability and an existing cover/stop reference in the
   locked destination journey. Retained stop media may become the cover and vice
   versa. Removing every reference retires a foreign capability.
3. Copy: none. Since `20261025153306_remix_without_media.sql` neither `copy_journey`
   nor the Customize Stops `copy_journey_selected` copies the source author's cover or
   stop photos: copies store NULL media and receive no media capability.
   `private.copy_authorized_media` was removed; activation aborts if it exists or if
   either copy function references a media-copy helper.

Storage reads require either the existing uploader prefix or an authorized,
currently referenced path on a published/caller-owned journey. The boolean helper
runs as journey_rpc and does not bypass RLS. Publishing a forged reference alone
cannot grant access. Legacy copies made before remix-without-media keep their
reviewed references and capabilities after the source is deleted or unpublished. Source deletion clears lineage and advances
the recipient's version; it does not delete shared Storage objects.

Reviewed `/images/` and durable HTTPS references can be retained. New
arbitrary URLs are not accepted by save. Legacy/copy HTTPS forms reject query,
fragment, user-info and Storage/object endpoint forms, including signed URLs.
Existing uploads remain immutable. Failed or ambiguous final saves may leave
unattached uploads; no automatic deletion or retry was added.

## Versions, locks and errors

Save locks the parent FOR UPDATE before comparing the submitted timestamptz.
Every parent UPDATE uses `greatest(clock_timestamp(), OLD.updated_at + 1 microsecond)`.
This also handles lineage clearing, repeated saves in one transaction and a clock
behind the previous version. Nonfinite legacy versions block activation. Clients
must preserve the returned timestamp string exactly, including microseconds;
no JSON shape, signature or Mobile contract changes are required.

A non-null submitted version with no owned parent raises 40001 instead of
recreating a deleted journey. Concurrent first creates with the same UUID still
resolve via the primary-key conflict. A null version cannot overwrite an existing
row. Save locks one existing destination before touching its children/capabilities.
Copy locks its source FOR SHARE before reading parent plus stops, then inserts a
fresh destination. RPCs have a five-second lock timeout. Lock timeout/deadlock
failures map to 40001, already understood by both clients; there is no automatic
write retry. Invalid cast/row-bound failures in save map to 22023. Existing 42501
and 23505 permission/conflict behavior remains recognizable to clients.

Parent deletion remains direct and takes PostgreSQL's normal delete/FK locks.
Cascades remove children, social relationships, tracks and destination media
capabilities. Source-to-copy FK updates can still participate in deadlocks with
complex administrative/multi-row operations; database abort plus bounded failure
is the recovery policy. Do not claim universal deadlock freedom.

## Legacy upgrade and deployment gate

These are forward-only migrations, intended to be rehearsed on an isolated
restored snapshot before any separately authorized deployment:

1. `20261026051105_legacy_media_review.sql` (re-dated from 20261005000000 so both
   files run after the recorded live migrations through 20261026045508) creates an admin-only inventory and
   attestation table. It does **not** close the old write vulnerability on its own.
2. Run the read-only `supabase/audits/backend_integrity.sql`. Review foreign paths,
   known demo assets, missing objects, externally hosted media and row/aggregate
   violations. Current lineage alone is not proof of original authorization.
3. For each legitimate ambiguous reference, an authorized operator must explicitly
   record journey_id, exact media_path and a meaningful provenance review_note in
   `private.legacy_journey_media_approvals`. No bulk-approval/backfill is provided.
   Source-deleted copies may need evidence outside the current database. A missing
   object may be attested for preservation, but remains unavailable to display.
4. Review and repair invalid data separately. Existing zero-based demo stops need
   an explicit reviewed one-based conversion before activation. Do not rerun the
   seed generator as a repair: it rejects zero-based legacy rows. The updated
   generator creates one-based rows and authorizes only its known local cover.
5. `20261026051106_rpc_integrity_hardening.sql` (re-dated from 20261005010000) acquires parent/stop table write
   locks before rechecking inventory and seeding capabilities. Invalid/ambiguous
   data aborts activation without deleting or rewriting records. Row constraints
   are validated. Function ownership, grants, policies and Storage enforcement
   switch atomically in the same transaction.

The preflight also rejects missing traveler types and destinations that cannot
pass save/copy validation, for drafts and published rows alike. Known named-place
slugs without destination_name retain save's established metadata fallback.
A non-null destination_name must be nonblank and have valid coordinates/slug.
The read-only audit uses the same predicate. Activation never fills in user rows;
incompatible historical metadata requires separately reviewed remediation.

The migration requires role-creation and function ownership-transfer privileges.
A pre-existing journey_rpc role is a collision and causes failure; it is not
silently reused. Test the actual Supabase migration role's capabilities in an
isolated environment. DDL uses a five-second lock timeout and five-minute statement
timeout; failures require inspection and a controlled retry, not longer blind waits.
Concurrent old writes finish before activation or are denied after its locks/grant
changes. Views/inventory scans may be expensive on large datasets. The audit
output contains identifiers/media paths and must not be published indiscriminately.

If activation fails, its transaction rolls back; the separate review table remains.
If a later defect is found, use a new forward corrective migration that keeps
RPC-only grants, ownership checks and media authorization intact. Do not restore
broad client writes, drop capability enforcement, or edit applied migrations.
Pause affected mutations if a safe corrective version is unavailable. Rehearse
that corrective migration and re-run the role/media matrix before reopening writes.

## Validation and remaining acceptance work

`npm run test:db` runs the existing historical suites and the new full-chain suite.
The historical suites intentionally exercise their pinned historical schemas;
`test-integrity-schema.mjs` discovers every migration in sorted order and covers
current ACLs, execution-role RLS, malformed inputs, Storage isolation, copy chains,
retirement, rollbacks, versions, seeded demos, legacy attestation and ACL drift.
PGlite uses isolated in-memory PostgreSQL with simulated Supabase auth and Storage
catalogs. It never reads environment files, credentials or a hosted database.

The opt-in real-session harness requires installed psql and a **dedicated fresh
local PostgreSQL cluster** with an empty disposable database. It rejects DSNs,
forces loopback and requires a journey_integrity_test_ database name and explicit
port. It creates roles/schemas and leaves all fixture data for inspection. Do not
point it at a shared development cluster. Example invocation after provisioning
that disposable cluster independently:

```
node scripts/test-integrity-concurrency.mjs journey_integrity_test_review 55439
```

It tests two sessions competing on one version and a locked copy racing source
deletion. It is not part of default offline checks. Real-session execution is
pending because PostgreSQL/psql is not installed in this workspace.

Before deployment approval, independent review must verify:

- Actual Supabase role/default ACLs, schema exposure, function ownership transfer,
  Storage signed-URL requests and immutable uploads, including private copies.
- The real-session harness plus save/delete in both orders, copy/edit snapshots,
  lock-timeout/deadlock paths, rollback and corrective-migration rehearsal.
- Web draft/publish/edit/photo replacement, exact-ID deletion and ambiguous
  responses; existing installed Mobile save/upload/copy/delete and full timestamp
  precision against isolated PostgREST. Mobile files were not modified.
- Snapshot legacy provenance attestations, zero-based seed repair, invalid-row
  remediation, lock duration and failure behavior under representative data size.

No hosted deployment, migration application, physical-device validation or real
Supabase Storage API verification is implied by the offline tests.

## Local implementation report

Checks completed on 2026-10-19:

- `npm run test:db` passed the historical schema, creation/social/media and track
  suites plus the full-chain integrity suite. The latest integrity suite was
  rerun after final SQL/test edits and passed: 54 explicit rejection checks,
  lifecycle/version/copy/seed assertions, legacy-gate and privilege-drift upgrades.
- `npm run lint` passed with zero warnings after final code edits.
- `npm run typecheck` passed. No application TypeScript contracts changed.
- `node --check scripts/test-integrity-concurrency.mjs` passed syntax validation.
- `git diff --check` passed for tracked changes. New SQL is parsed/executed by
  the full-chain tests; new JavaScript is covered by lint and execution/syntax checks.

Changed files:

- `supabase/migrations/20261026051105_legacy_media_review.sql`: review inventory
  and explicit administrative provenance attestations.
- `supabase/migrations/20261026051106_rpc_integrity_hardening.sql`: atomic RPC-only
  grants, RLS-bound execution role, media capabilities, validation and versions.
- `supabase/audits/backend_integrity.sql`: read-only legacy/privilege inventory.
- `scripts/lib/offline-db.mjs`: isolated auth/Storage fixture and ordered loader.
- `scripts/test-integrity-schema.mjs`: current-schema security/upgrade regressions.
- `scripts/test-integrity-concurrency.mjs`: opt-in local real-session harness,
  added but not executed because psql/PostgreSQL is unavailable.
- `scripts/generate-demo-seed.mjs`: one-based new stops, zero-based legacy guard
  and explicit authorization of known repository cover assets.
- `scripts/test-schema.mjs`: seed-order expectations follow the corrected generator.
- `package.json`: full-chain integrity checks join the database test command.
- `docs/backend-integrity-hardening.md`: design, rollout/recovery and this report.

Unresolved acceptance items are the independent-review checklist above, especially
real-session races, hosted-platform parity in an isolated test environment and
legacy provenance/repairs. The legacy gate intentionally blocks deployment rather
than guessing or silently repairing ambiguous data. No files in Mobile, historical
migrations or main were changed; no dependencies were installed and no commit,
push, merge or deployment was performed.
