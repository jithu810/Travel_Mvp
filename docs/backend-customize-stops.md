# Customize Stops backend preparation — 2026-10-20

> SUPERSEDED (2026-10-26): this proposal copied inherited media and was never applied. It now
> lives in `supabase/superseded/20261020164047_copy_journey_selected.sql`. Live uses the
> standalone media-free RPC, recorded in `supabase/migrations/20261026045508_capture_customize_stops.sql`.
> The hardening files are re-dated to 20261026051105 / 20261026051106.

Local, unpublished work for [Mobile PR #3](https://github.com/jithu810/Travel_Mvp_Mobile/pull/3).
No SQL was run against a hosted database. Neither Mobile checkout was modified.

## Migration and compatibility

`supabase/migrations/20261020164047_copy_journey_selected.sql` was generated with
Supabase CLI 2.101.0 `migration new copy_journey_selected`. It follows the existing
history, including the protected, unpublished `20261005000000_legacy_media_review.sql`
and `20261005010000_rpc_integrity_hardening.sql`. Those files were not changed.
It must not be cherry-picked or applied ahead of those prerequisites. The earlier
legacy audit and approvals required by hardening remain separate rollout gates.

The Mobile SQL proposal matches the core column names and the client signature
`copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid) -> uuid`.
It does **not** match the hardened authorization model: authenticated clients no
longer have journey/stop INSERT privileges or access to `private.copy_media_path`.
The proposal also omits journey-scoped media capability propagation and grants
clients direct receipt INSERT access. Installing it unchanged would fail after
hardening and would weaken receipt integrity if those grants were restored.

The prepared migration uses a public SECURITY INVOKER wrapper and a private
SECURITY DEFINER implementation owned by the existing `journey_rpc` role. This
role is NOLOGIN, NOBYPASSRLS and does not own the data tables. Explicit owner RLS
still governs journey/stop/media/receipt writes. Both functions have an empty
search path. PUBLIC and anon EXECUTE are revoked. Authenticated receives EXECUTE
on both entry points because the wrapper runs as its caller; direct SQL invocation
of the private handler has exactly the same validation, rather than a privileged
alternate path. The private schema is intended to remain unexposed to PostgREST.

Receipts have SELECT/INSERT grants only for `journey_rpc`, owner-specific RLS,
no client privileges and no UPDATE/DELETE policy or role grant. They survive
source/copy deletion and are removed when the owning profile is deleted. A source
deletion clears the existing attribution FK; a later replay reports unavailable
and never recreates a draft. Normal edited/published copies return their original
UUID without being overwritten. A changed source/selection or foreign-account
UUID collision fails atomically. Receipt stop sets are canonicalized; caller
order never changes source order.

The handler locks the source parent consistently with hardened `save_journey`,
copies only selected source stops in compact 1-based sequence with fresh IDs,
preserves attribution and durable authorized media, seeds the copy's media
capabilities, then calls hardened save validation within the same transaction.
Only published non-demo sources and valid, unique selections of 1–50 located
stops are accepted. A bounded advisory transaction lock serializes the draft UUID.
Lock/deadlock errors become SQLSTATE 40001; rejection leaves no partial receipt,
journey, stops or capabilities. Existing all-stop copy and save functions are
unchanged.

## Local checks

Run `node scripts/test-copy-journey-selected.mjs` from `D:\Travel_Mvp`.
This uses the already-installed PGlite and existing offline harness, loads the
complete migration history into memory and reads no environment files or hosted
credentials. The initial run passed 84 assertions covering function ownership,
RLS and grants, anonymous/missing-user denial, cross-owner subset copying,
source order/new IDs/metadata/media preservation and source immutability,
edited/published replay, one-stop selection, invalid-input and foreign-stop
atomicity, private/demo/invalid-coordinate rejection, client receipt/capability
forgery denial, UUID collisions, deleted-copy/source replay, inherited media
readability after source deletion and user-deletion receipt cascade.

Independent Code Reviewer inspected the stable migration/test/documentation
snapshot, found no actionable findings, and independently passed all 84 runtime
assertions, Node syntax and whitespace checks. Reviewed hashes matched the
implementation handoff. Architect's post-migration
`node scripts/test-integrity-schema.mjs` also passed against the full chain,
including 54 rejection checks and legacy, drift, policy and metadata upgrade
checks. The earlier `npm run test:db` baseline passed. Architect verified that
all 22 protected pre-existing file hashes remained unchanged.

The initial PGlite checks did not establish multi-session lock behavior. At that
stage no usable local PostgreSQL server was available. The later explicitly
authorized portable PostgreSQL run below establishes local multi-session SQL
behavior; this remains separate from hosted schema or Supabase API parity.

Supabase's current [function guidance](https://supabase.com/docs/guides/database/functions)
and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
were consulted. CLI installation used npm's external tool cache only; package
manifests and lockfiles were not changed.

## Readiness follow-up — 2026-10-20

The Architect inspected hosted metadata through read-only connector tools at
22:23:26 Asia/Kolkata (16:53:26 UTC). The selected project is
`gwybjhqgnrpouwcdvusi`, PostgreSQL 17.11. The migration listing and branch listing
were empty. An empty migration ledger is not evidence of an empty schema or
permission to apply the complete local history: the public application tables
already exist. The generated public function types include `copy_journey` and
`save_journey` but exclude `copy_journey_selected`. The private-table listing
excludes legacy media approvals, media authorizations and selected-copy receipts.
The hosted stop sequence constraint permits zero; local hardening requires one
or greater. These observations establish that the October 5/20 local baseline
has not been established on the selected hosted project. They do not establish
the exact installed function bodies, ownership, ACLs, RLS policy definitions,
role memberships or legacy data safety. No hosted SQL or live-user row audit was
executed. No deployed authorization parity or hosted integration pass is claimed.

Security advisors reported existing anonymous/authenticated SECURITY DEFINER
exposure warnings for other RPCs and disabled leaked-password protection.
These are triage items, not evidence of an exploit or a result of installing
this migration. Public read APIs may be intentional; no unrelated grants or
functions were changed. The performance advisor returned no findings.
Remediation references: [anonymous definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Git inspection confirms both October 5 prerequisites and the October 20 selected
copy migration are untracked local files on `backend/integrity-hardening` at
`428182a0454c8f536c56024eeb0497f4f4a05c81`; the committed history stops before
those files. The existing hardening documentation explicitly treats review,
provenance attestation and activation as local preparation. Do not treat the
working tree's complete PGlite chain as deployed migration history, or use a
blank remote ledger to justify replaying existing core CREATE statements.

Before portable provisioning, local tool inventory found no `psql`, `postgres`, `pg_isready` or Docker on PATH,
no matching PostgreSQL/Supabase/Docker Windows services, and no `bin` directory
under the PostgreSQL 16/17 installation folders (only data directories). Listing
listening TCP ports was denied, so port absence is not claimed. No PG/Supabase/
database environment variable names, local `.env` files or `supabase/config.toml`
were found in the Web checkout. No already-configured disposable database was
identified. No existing data directory was opened. That inventory limitation was
resolved for SQL testing by the later approved portable setup below; the existing
PostgreSQL 16/17 data directories remain untouched.

`supabase/audits/customize_stops_readiness.sql` is a read-only audit artifact for
an approved isolated restored snapshot first. It begins a READ ONLY transaction
and rolls it back. It returns aggregate gate counts plus function, role, RLS,
membership and grant metadata; it does not return journey identifiers or media
paths. It handles missing October 5 private objects and reports the approval
gate as unavailable rather than passed. Categories are editor metadata,
stop count/order/day/location, finite versions, row bounds, media provenance and
supported media form; the optional approval gate counts unresolved attestations.
Function definition hashes and ACL/policy output support comparison with the
tested local baseline, without treating object existence alone as parity.

The audit was executed locally in disposable PGlite before review objects,
after the review migration and after hardening plus selected copy. A synthetic
invalid metadata/legacy-media fixture was detected before hardening; protected
activation rejected its unresolved media. A fixture-only attestation and metadata
repair allowed the full chain to apply in memory, and the post-hardening audit
reported zero metadata/bounds/aggregate/version failures. This establishes the
audit's local compatibility and gate behavior only. It does not attest any real
legacy reference or validate concurrent sessions. Independent Code Reviewer
reviewed the stable follow-up audit/document snapshot and found no actionable
findings. The reviewer independently repeated the staged audit checks, verified
activation rejection/rollback and unchanged fixture rows, and reran all 84
selected-copy assertions successfully. Audit SHA256:
`2AFE7DE04F4038FA36434B1F00F91058F056C2593C38BD56491F24454C843A0A`.
The migration and existing runtime test retain their previously reviewed hashes.
All 24 other pre-existing modified/untracked Web file hashes were preserved.

For an approved restored snapshot, compare this audit with `backend_integrity.sql`;
resolve each provenance/metadata gate with evidence before considering hosted
activation. Applying the legacy-review migration, entering real attestations,
repairing data, applying hardening and applying selected-copy SQL are distinct
reviewable actions, not consequences of this readiness assessment.

## Approved portable PostgreSQL verification — 2026-10-20

The product owner explicitly authorized checking the new directory
`D:\Travel_Mvp\.local-tests\customize-stops-pg` and port 55439, then installing
and starting a disposable PostgreSQL 17 cluster there with synthetic fixtures.
Immediate checks before creation confirmed the directory did not exist and the
port had no connections. The new root contains its own `*` `.gitignore`; runtime
files, downloads, logs and synthetic data are ignored without changing repository
Git configuration. No existing installation/data directory or Windows service
was changed, and no global PATH or registry change was made.

The [PostgreSQL Windows page](https://www.postgresql.org/download/windows/)
links to [EDB's portable binary archives](https://www.enterprisedb.com/download-postgresql-binaries).
EDB file ID 1260616 resolved to the PostgreSQL 17.11-5 x64 archive. Its
381,531,864 bytes hashed to
`80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F`,
matching the checksum [published by an EDB contributor in its installer repository](https://github.com/EnterpriseDB/edb-installers/issues/731).
Only the archive's `pgsql/bin`, `lib` and `share` runtime files were extracted,
with destination paths checked to remain in the approved root.

`initdb -D D:/Travel_Mvp/.local-tests/customize-stops-pg/data -U journey_test_admin
--auth-host=trust --auth-local=trust --encoding=UTF8 --locale=C` initialized only
the new cluster. Configuration restricts the listener to `127.0.0.1:55439` and
allows only `journey_test_admin` from that IPv4 loopback address; other users and
IPv6 connections are rejected. Trust authentication is confined to this synthetic
local cluster. Startup used the approved-root `pg_ctl start -D .../data
-l .../server.log -w -t 30` through a hidden launcher, without service registration.

Before database creation and again before fixture writes, checks confirmed
PostgreSQL 17.11 (`170011`), the exact approved data directory, cluster name
`journey_customize_stops_synthetic_only`, loopback address/port and system
identifier `7698797662592581460`. The only test database created is
`journey_integrity_test_customize_stops`. Its initial application schema was empty,
the fixture roles did not exist and no other session occupied it. An initial
identity guard stopped safely on PostgreSQL's `127.0.0.1/32` text formatting;
read-only inspection verified the same server and `host(inet_server_addr())`
normalized the address before any database or fixture writes continued.

Actual command:
`node scripts/test-copy-journey-selected-concurrency.mjs --run-synthetic-fixtures`.
It passed six groups at 22:40:31 Asia/Kolkata (17:10:31 UTC):

- Pinned cluster identity and empty-target safeguards.
- Simultaneous same-UUID requests, including reordered source IDs: the second
  session demonstrably waits on the advisory lock and both return exactly one
  draft/receipt. SQL integration verifies source order, fresh IDs, private owner
  attribution, media capabilities, source immutability, auth/receipt-forgery
  rejection, mismatched/cross-account collisions and edited/published replay.
- Source-save/copy locking: the copy waits and then receives coherent updated
  journey metadata and stop content.
- Five-second same-key lock timeout: SQLSTATE 40001 and rollback leave no target
  journey, receipt, stops or media capabilities.
- Cancellation after copy writes but before commit: only the known synthetic
  PID/application/database/user session is cancelled; SQLSTATE 57014 and complete
  transaction rollback are verified.
- Copy/source-delete locking: deletion waits, the independent copy survives with
  cleared attribution, and source/copy deletion replays return unavailable without
  recreating rows. All deletion cases concern fixtures created by this run.

The harness uses the absolute approved-root `psql`, fixed host/port/user/database,
scrubs ambient libpq variables, suppresses password prompting/default password
files and checks the cluster identity file before writes. It refuses a nonempty
database and cannot be rerun in fixture-write mode against this retained database.
`--inspect` performs identity checks and read-only aggregate inspection instead.
Syntax validation passed. No migration, prior runtime test, protected audit,
application code, Mobile file, package manifest or lockfile changed.

The real PostgreSQL read-only readiness audit also completed successfully.
It reports three journeys, seven stops and three retained receipts; editor
metadata, stop aggregate, version and row-bound failure counts are all zero.
The legacy inventory reports two references, one non-owner path and one unresolved
legacy approval. This is expected **after activation**: the synthetic selected
copy retained its source's authorized media path under a new journey owner, with
the corresponding `journey_media_authorizations` capability. The legacy inventory
recomputes non-owner references and is a preactivation attestation gate, not a
requirement to approve every later valid RPC copy. Do not bulk-approve this count
or treat it as a real-user provenance result. The earlier preactivation fixture
tests established that genuinely unresolved legacy paths block activation.

Evidence remains under the ignored runtime root: `concurrency-results.json`,
`readiness-audit.log`, `initdb.log`, `server.log` and `cluster-identity.json`.
At 22:41:05 Asia/Kolkata the server was running as PID 9148 with only the verified
loopback listener. The database and synthetic fixtures are retained for review.
Independent Code Reviewer found no actionable harness issues and reviewed all six
recorded execution groups. Independent syntax, whitespace, `--inspect`, pinned
identity, role/grant/RLS, failed-target absence and read-only readiness-audit
checks passed; fixture writes were not rerun. The reviewer confirmed the retained
three journeys, seven stops and three receipts and zero data-bound/aggregate gates.
The stale local-provisioning approval paragraph was corrected after review.
Earlier migration and PGlite review findings remain unchanged. All 25 other
pre-existing modified/untracked file hashes were preserved.

To inspect: `node scripts/test-copy-journey-selected-concurrency.mjs --inspect`.
To stop only this approved cluster, use:

```powershell
& 'D:/Travel_Mvp/.local-tests/customize-stops-pg/pgsql/bin/pg_ctl.exe' stop -D 'D:/Travel_Mvp/.local-tests/customize-stops-pg/data' -m fast -w
```

These tests use synthetic `auth.uid()` and Storage-table fixtures with real
PostgreSQL roles/RLS/functions; they do not test Supabase Auth tokens, PostgREST,
Storage API behavior or Mobile devices. Hosted schema parity, restored real-data
audit/attestation, Supabase end-to-end testing and physical-device acceptance
remain separate pending work. No hosted tools or databases were used in this
portable setup and test run.

## Remaining approval and acceptance

Commit/push, application of any prerequisite or selected-copy SQL to a hosted
project, production writes and deployment each remain unauthorized. A future
rollout needs explicit approval naming the target and exact migration set,
deployed schema/grant parity verification, prerequisite legacy audit resolution
and nonproduction Supabase end-to-end contract tests. The real PostgreSQL
concurrency and synthetic SQL integration gate above has now passed.
Mobile physical-device swipe, accessibility and native-map checks remain pending
and are not proven by this backend test.

The local provisioning/startup/synthetic-test approval above has been exercised.
Next approval, if real-data readiness is pursued, must identify the isolated
restored snapshot and the scope of read-only schema/data audit or authorize
specific hosted read-only SQL separately; neither grants repair/attestation or
rollout permission. Any real-data repair/attestation, hosted rollout and publication
remain separate approvals. Local concurrency passing alone does not justify
hosted activation while schema parity and isolated-snapshot gates lack evidence.

Concrete next approval, if pursued: authorize read-only catalog and aggregate
integrity/provenance SQL on the explicitly named hosted project
`gwybjhqgnrpouwcdvusi`, or approve a separately identified sanitized snapshot and
an isolated restored target. Neither action is authorized by the local-only
approval exercised here. Do not load real data into this synthetic-only cluster.
The audit must not apply migrations, repair rows, insert attestations, create
billable resources or publish identifiers/media paths. Approve any subsequent
repair, attestation, migration rollout or publication separately after reviewing
the audit evidence.
