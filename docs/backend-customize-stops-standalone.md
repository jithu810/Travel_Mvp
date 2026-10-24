# Standalone Customize Stops alternative — local review

This is a separate, unpublished alternative for
[Mobile PR #3](https://github.com/jithu810/Travel_Mvp_Mobile/pull/3). It does not
depend on the October 5 integrity migrations or the October 20 selected-copy
migration in the earlier backend proposal. Those files and all existing work
remain unchanged. No hosted database writes, publication, merge or deployment was performed.

## Exact migration choice

The only candidate file for this alternative is:

`supabase/standalone-customize-stops/supabase/migrations/20261021024312_copy_journey_selected_standalone.sql`

Supabase CLI 2.101.0 generated its name with `migration new` in the standalone
work directory. It intentionally sits outside the default `supabase/migrations`
loader so ordinary database commands cannot silently combine both proposals.
The required starting schema is the existing October 1–4 core baseline, including
the October 4 custom-destination contract. Architect's current read-only hosted
catalog inspection matches those relevant columns and existing owner/read
policies, and found the selected RPC and standalone objects absent. This is not
a complete deployed ACL, function-body, schema-exposure or API-parity guarantee.

This **replaces** the October 5 + October 20 proposal as an option; it must not
precede or follow it. Never run `db push` across the old pending migrations to
install this option. Its preflight rejects an existing selected RPC, hardened
media capability table or receipt collision. A same-name execution role also
causes an atomic failure rather than being adopted. Existing tables plus an
empty remote migration ledger do not authorize replaying historical CREATE SQL.
Any later adoption of full hardening needs an explicitly reviewed reconciliation
migration; neither original migration set can simply be stacked on this one.

## Behavior and deliberate media tradeoff

The RPC retains the Mobile signature:
`copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid) -> uuid`.
It accepts an authenticated user's stable draft UUID and 1–50 unique stop IDs
from a published non-demo source. It copies only those stops in original source
order, compacts sequence to 1-based positions, assigns new stop IDs, preserves
content/coordinates/day/rating/custom-destination metadata and source attribution,
and creates a private caller-owned draft. Source rows are unchanged.

**All inherited cover and stop images are omitted**, including otherwise valid
ones. This is intentional: no Storage reads, grants, policies, reference
classification, legacy approval table or media backfill is required. Unknown
historical ownership cannot become a new inherited reference. Existing source
media remains untouched. The user can add new images through the existing editor.

Static Mobile inspection confirms `normalizeDraft`, `loadPrivateDraft` and photo
fallbacks accept null images, and selected confirmation checks ID/owner/attribution
and stop count rather than requiring images. Native UI and Mobile `hydrateDraft()`
were not executed in this backend task. The SQL tests separately verify
`get_journey_detail`'s expected draft shape and baseline `save_journey` editing and
publication, including custom destination metadata.

The function validates only the requested source/selection, using the baseline
editor's title/description/duration/traveler/destination/stop bounds. Known legacy
slugs with null destination name retain the editor's existing fallback; invalid
custom destination metadata is rejected. Optional rating/day values may be null.
Zero-based source stop sequence is accepted and compacted in the new draft.
It does not scan, repair or classify other journeys or media references.

## Authorization, idempotency and source races

A new `customize_stops_rpc` NOLOGIN/NOINHERIT/NOBYPASSRLS role owns only a private
definer implementation, not data tables. Explicit RLS permits published/owned
reads and caller-owned private inserts. Grants are limited to required columns;
the role receives no Storage access, DELETE or owner/lineage UPDATE privilege.
A title-only UPDATE grant plus constrained UPDATE RLS enables PostgreSQL's source
locking SELECT; the implementation contains no UPDATE statement. Clients receive
no role membership. The public wrapper is SECURITY INVOKER; both entry points use
an empty search path, revoke PUBLIC/anon execution and grant authenticated
execution. Direct private invocation enforces the same complete contract.

Receipts are inaccessible to clients. Only the execution role can SELECT/INSERT
its caller's receipt, and it has no receipt UPDATE/DELETE grant. Receipts reference
`auth.users`, so baseline profile deletion/recreation cannot erase tombstones.
Actual auth-user deletion removes them. There are no source/draft foreign keys,
so deleting a source/copy does not permit RPC recreation. Same UUID/source/canonical
stop-set retries return the existing owned attributed copy, including after edits
or publication. Mismatches and foreign-account collisions fail atomically.

An advisory transaction lock serializes the draft UUID. A parent SHARE lock
serializes source metadata updates, unpublication and deletion. Parent plus all
requested child rows are then captured in one SQL statement snapshot. Direct
child edits in the unhardened baseline do not need a parent lock: the copy sees
the committed snapshot and later edits cannot change its captured JSON. There
is no table-wide lock and no reliance on the hardened save implementation.
Timeout/deadlock failures become 40001; other rejections leave no partial receipt,
journey or stop rows.

This does **not** fix the baseline's existing direct-client mutation holes.
Authenticated owners retain their existing journey/stop grants and policies,
including the ability to alter their own data outside this RPC. Receipt replay
does not overwrite owned edited data and is not a general tamper-proof history
of all direct writes or administrative operations. Existing save, whole-journey
copy and Storage policies are unchanged. The full integrity proposal remains a
separate security project rather than a prerequisite hidden in this option.

## Checks actually run

`node scripts/test-copy-journey-selected-standalone.mjs` passed 70 assertions
against only the October 1–4 migrations plus this one file, in disposable PGlite.
Coverage includes narrow role/grants/RLS, unchanged existing RPC/Storage/client
catalogs, zero-based input compaction, null-media behavior, source immutability,
custom-destination draft detail and editor save/publish, malformed/foreign stop
atomicity, auth and receipt-forgery denial, collisions, edited replay, deleted-copy
replay and profile-delete/auth-delete receipt behavior. A separate test proved the
standalone file rejects the original hardened proposal atomically. Independent
Code Reviewer reran these checks successfully and found no actionable SQL issues.

Real PostgreSQL 17.11 testing used the previously authorized portable cluster
only at `127.0.0.1:55439`, with its exact data-directory/system-identifier guard.
The harness created a **new** synthetic-only database:
`journey_integrity_test_customize_stops_standalone`.
The prior `journey_integrity_test_customize_stops` database was not reset or
modified. PostgreSQL roles are cluster-global; compatible existing anon/authenticated
roles were checked and reused without alteration, and only the new standalone
execution role was added. No server installation or service change was needed.

`node scripts/test-copy-journey-selected-standalone-concurrency.mjs --run-synthetic-fixtures`
passed seven groups at 08:19:30 Asia/Kolkata on 2026-10-21:

- Pinned local cluster identity, absent new database/role and empty target checks.
- Concurrent same-UUID replay waits on the advisory lock then yields exactly one
  draft/receipt; null images, source equality, collisions and editor replay pass.
- Direct multi-child transactions produce all-old or all-new committed snapshots.
- Direct parent-plus-child update makes copying wait, then yields coherent content.
- Direct child updates after capture remain possible while the copy transaction
  is open and do not mutate the copied snapshot; no table-wide lock is introduced.
- Five-second lock timeout returns 40001, and cancellation of only a verified
  synthetic PID/application/database/user returns 57014; neither leaves partial rows.
- Direct unpublish/delete waits behind the parent SHARE lock; copied drafts survive
  source deletion and receipt replay never recreates a deleted copy/source.

Both new scripts passed Node syntax and zero-warning scoped ESLint. The migration
and original tests/audits were not edited. Evidence remains in the ignored local
runtime root as `standalone-concurrency-results.json`. The new database is retained
for read-only review. The machine-pinned harness is opt-in, not a CI-portable
command, and refuses occupied targets. `--inspect` performs read-only inspection;
do not rerun fixture creation, drop/reset either database or load real data there.
SQL concurrency evidence uses synthetic `auth.uid()` and Storage catalogs, not
Supabase Auth tokens, PostgREST, Storage API or native-device execution.

## Remaining gates and safe disablement

No safe isolated nonproduction Supabase target is currently available. The rollout
sequence is:

1. Obtain approval naming an isolated nonproduction Supabase target, provision
   schema-only parity with the live baseline and synthetic accounts, and apply
   **only the standalone file** to that approved target.
2. Verify real Auth/PostgREST confirmation, draft detail, editor save and null-image
   behavior there.
3. Before live application, obtain a backup, repeat the catalog/grant preflight,
   and obtain explicit approval naming the live project and exact migration file.

Physical swipe, accessibility and native-map checks remain feature acceptance
work, not prerequisites for installing the nonproduction database migration.
No real legacy-media classifications are needed for this media-free path.

If disabling a deployed version becomes necessary, first revoke authenticated
EXECUTE on both new entry points. Retain receipts/tombstones and copied drafts;
do not drop them as an ordinary rollback or reopen broad grants. Corrections or
transition to full hardening need new reviewed forward migrations.

This alternative is unpublished. The existing backend draft PR contains the old
three-migration path; replacing its scope would need later publication
authorization. This task grants no commit, push, PR update, hosted database writes, billing,
real-data repair, merge or deployment permission.
