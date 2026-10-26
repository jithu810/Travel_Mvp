import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrationDirectory } from './lib/offline-db.mjs';

// Hardening under Supabase-like ACLs, applied by a NON-superuser migrator.
// Isolated in-memory PGlite only: no environment files, sockets or hosted database.
//
// Modelled on the live project (read-only catalog evidence, 2026-10-26):
// - "mig" plays live `postgres`: NOSUPERUSER, CREATEROLE, BYPASSRLS, member of anon and
//   authenticated with INHERIT and SET (also of service_role), owner of the database,
//   schema private and app objects; CREATE WITH GRANT OPTION on public and private.
// - supabase_admin is a superuser (it must not be the activating role).
// - schema auth is owned by supabase_admin; mig has USAGE WITHOUT grant option.
// - auth.uid() is owned by supabase_auth_admin and executable by PUBLIC.
// - storage.objects is owned by supabase_storage_admin (mig is not a member); mig has
//   grantable SELECT(name,bucket_id). supautils policy_grants lets postgres manage
//   storage.objects policies; emulated by running only those statements privileged.
// Assumed (standard Supabase): anon/authenticated/service_role have auth USAGE.
// Pre-hardening history is replayed privileged (as live tooling did), then app objects
// are handed to mig; 051105 and 051106 then run as mig.
//
// Regression: in the ed3038f version, `grant usage on schema ... auth ... to journey_rpc`
// only warned ("no privileges were granted for "auth""), the migration committed, and
// save_journey/copy_journey/journey_media_readable (owned by journey_rpc, bodies parsed as
// journey_rpc) failed with 42501 "permission denied for schema auth". Reproduced below.
const fixture = `
create role supabase_admin nologin superuser; create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role mig nologin nosuperuser createrole bypassrls;
grant anon, authenticated to mig with inherit true, set true;
grant service_role to mig;
do $db$ begin execute format('alter database %I owner to mig', current_database()); end $db$;
create schema auth authorization supabase_admin;
grant all on schema auth to supabase_auth_admin;
create table auth.users(id uuid primary key); alter table auth.users owner to supabase_auth_admin;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
alter function auth.uid() owner to supabase_auth_admin;
grant usage on schema auth to mig;
grant usage on schema auth to anon, authenticated, service_role;
grant select, references on auth.users to mig;
create schema storage authorization supabase_admin;
grant all on schema storage to supabase_storage_admin;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,unique(bucket_id,name));
alter table storage.buckets owner to supabase_storage_admin; alter table storage.objects owner to supabase_storage_admin;
alter table storage.objects enable row level security;
grant usage on schema storage to mig with grant option;
grant usage on schema storage to anon, authenticated, service_role;
grant select (name, bucket_id) on storage.objects to mig with grant option;
grant select on storage.objects to anon; grant select,insert,update,delete on storage.objects to authenticated;
grant select on storage.buckets to anon, authenticated;`;

const names = (await readdir(migrationDirectory)).filter(n => n.endsWith('.sql')).sort();
const LEGACY = names.find(n => n.endsWith('_legacy_media_review.sql'));
const HARDENING = names.find(n => n.endsWith('_rpc_integrity_hardening.sql'));
assert.ok(LEGACY && HARDENING && LEGACY < HARDENING && names.at(-1) === HARDENING);
const text = async n => readFile(new URL(n, migrationDirectory), 'utf8');
const hardeningSql = await text(HARDENING);
const A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b';
const jid = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const sid = n => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
let checks = 0;

// supautils policy_grants emulation: storage.objects policy DDL runs privileged, all else as mig.
const policyGrants = sql => sql
  .replace(/(drop policy (?:if exists )?\w+ on storage\.objects;)/g, 'reset role; $1 set role mig;')
  .replace(/(create policy \w+ on storage\.objects[^;]*;)/g, 'reset role; $1 set role mig;');

async function liveDb() {
  const db = new PGlite();
  await db.exec(fixture);
  for (const n of names) if (n < LEGACY) await db.exec(await text(n));
  await db.exec(`do $$ declare r record; begin
    execute 'alter schema private owner to mig';
    for r in select c.oid::regclass as rel from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname in ('public','private') and c.relkind in ('r','v','m','p') and pg_get_userbyid(c.relowner)='postgres' loop
      execute format('alter table %s owner to mig', r.rel);
    end loop;
    for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace s on s.oid=p.pronamespace
      where s.nspname in ('public','private') and pg_get_userbyid(p.proowner)='postgres' loop
      execute format('alter function %s owner to mig', r.f);
    end loop;
  end $$;
  insert into auth.users(id) values('${A}'),('${B}');`);
  const facts = (await db.query(`select (select rolsuper from pg_roles where rolname='mig') as su,
    has_schema_privilege('mig','auth','USAGE WITH GRANT OPTION') as auth_grantable,
    pg_has_role('mig','supabase_storage_admin','MEMBER') as storage_owner,
    (select pg_get_userbyid(datdba) from pg_database where datname=current_database()) as db_owner,
    pg_has_role('mig','anon','SET') and pg_has_role('mig','anon','USAGE') as anon_set_inherit,
    pg_has_role('mig','authenticated','SET') and pg_has_role('mig','authenticated','USAGE') as authenticated_set_inherit,
    has_schema_privilege('mig','public','CREATE WITH GRANT OPTION') as public_create,
    has_schema_privilege('mig','private','CREATE WITH GRANT OPTION') as private_create,
    pg_get_userbyid((select relowner from pg_class where oid='public.journeys'::regclass)) as journeys_owner`)).rows[0];
  assert.deepEqual(facts, { su: false, auth_grantable: false, storage_owner: false, db_owner: 'mig',
    anon_set_inherit: true, authenticated_set_inherit: true, public_create: true, private_create: true,
    journeys_owner: 'mig' }, 'Live-like migrator');
  await db.exec('set role mig');
  await db.exec(await text(LEGACY));
  return db;
}
async function activate(db, sql) {
  const notices = [];
  try {
    await db.exec(policyGrants(sql), { onNotice: n => notices.push(n.message) });
    return { ok: true, notices };
  } catch (error) {
    await db.exec('rollback');
    return { ok: false, notices, error };
  }
}
async function as(db, role, user = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  if (role) await db.exec(`set role ${role}`);
}
async function rejects(promise, code) { await assert.rejects(promise, e => e.code === code); checks++; }
const save = (db, p) => db.query('select public.save_journey($1::jsonb) as r', [JSON.stringify(p)]).then(r => r.rows[0].r);
const draft = n => ({ id: jid(n), title: 'Route', description: '', destination_slug: 'goa', traveler_type: 'solo',
  duration_days: 2, status: 'draft', updated_at: null, cover_image_path: null,
  stops: [{ id: sid(n), sequence: 1, name: 'Stop', latitude: 15.4, longitude: 73.8, photo_path: null, rating: 4, day_number: 1 }] });
const rpcHasAuth = async db => (await db.query("select has_schema_privilege('journey_rpc','auth','USAGE') as u")).rows[0].u;

// 1. ed3038f pattern: auth USAGE grant (only warns) + auth.uid() in journey_rpc-owned bodies.
const smokeStart = hardeningSql.indexOf('    -- Smoke test as the client roles');
const smokeEnd = hardeningSql.indexOf("    execute format('set local role %I', me);");
assert.ok(smokeStart > 0 && smokeEnd > smokeStart);
const oldPattern = sql => sql.replaceAll('(select private.journey_rpc_uid())', '(select auth.uid())')
  .replace('grant usage on schema public, private, storage to journey_rpc;',
    'grant usage on schema public, private, auth, storage to journey_rpc;\ngrant execute on function auth.uid() to journey_rpc;')
  .replace("raise exception 'Execution-role functions must use private.journey_rpc_uid(), not auth.uid()';", 'null;');
const ed3038f = oldPattern(hardeningSql.slice(0, smokeStart) + hardeningSql.slice(smokeEnd));
assert.notEqual(ed3038f, hardeningSql);
{
  const db = await liveDb();
  const result = await activate(db, ed3038f);
  assert.equal(result.ok, true, 'The old pattern committed on live-like ACLs');
  assert.ok(result.notices.some(m => m === 'no privileges were granted for "auth"'), 'Auth USAGE grant only warns');
  await db.exec('reset role');
  assert.equal(await rpcHasAuth(db), false);
  // Storage RLS calls journey_media_readable per row, so a row must exist.
  await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)", [`${A}/${jid(1)}/cover/photo.jpg`]);
  await as(db, 'authenticated', B);
  await rejects(save(db, draft(1)), '42501');
  await rejects(db.query('select public.copy_journey($1)', [jid(1)]), '42501');
  await as(db, 'anon');
  await rejects(db.query('select name from storage.objects'), '42501');
  await db.close();
}
// 2. The fixed migration's in-transaction smoke test aborts the same body pattern atomically.
{
  const db = await liveDb();
  const result = await activate(db, oldPattern(hardeningSql));
  assert.equal(result.ok, false); assert.equal(result.error.code, '42501');
  assert.match(result.error.message, /permission denied for schema auth/); checks++;
  assert.equal((await db.query("select count(*)::int as n from pg_roles where rolname='journey_rpc'")).rows[0].n, 0, 'Atomic');
  await db.close();
}
// 2b. A different (even superuser) role, e.g. supabase_admin via a connector, is refused
// before any DDL, so later postgres migrations can always alter the new objects.
{
  const db = await liveDb();
  await db.exec('reset role; set role supabase_admin');
  const result = await activate(db, hardeningSql);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Run this migration as the owner of public\.journeys \(live: postgres\), not supabase_admin/); checks++;
  assert.equal((await db.query("select count(*)::int as n from pg_roles where rolname='journey_rpc'")).rows[0].n, 0, 'Atomic');
  await db.close();
}

// 3. Fixed migration applied by the non-superuser migrator.
const db = await liveDb();
try {
  const result = await activate(db, hardeningSql);
  assert.equal(result.ok, true, result.error?.message);
  assert.equal(result.notices.some(m => /auth/.test(m)), false, 'No auth grant is attempted');
  await db.exec('reset role');
  assert.equal(await rpcHasAuth(db), false, 'journey_rpc still has no auth USAGE');
  assert.deepEqual((await db.query(`select pg_get_userbyid(proowner) as owner,
      has_function_privilege('journey_rpc',oid,'EXECUTE') as rpc,has_function_privilege('authenticated',oid,'EXECUTE') as client
    from pg_proc where oid='private.journey_rpc_uid()'::regprocedure`)).rows[0], { owner: 'mig', rpc: true, client: false });
  // PG16+ creator membership remains admin-only, as on live.
  assert.deepEqual((await db.query(`select pg_get_userbyid(member) as member,admin_option,inherit_option,set_option
    from pg_auth_members where roleid='journey_rpc'::regrole`)).rows,
    [{ member: 'mig', admin_option: true, inherit_option: false, set_option: false }]);

  // Author A: save, own upload, attach, publish.
  await as(db, 'authenticated', A);
  let src = draft(1); src.updated_at = (await save(db, src)).updated_at;
  const aCover = `${A}/${jid(1)}/cover/photo.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)", [aCover]); // own upload (RLS)
  src = { ...src, status: 'published', cover_image_path: `journey-media/${aCover}`,
    stops: src.stops.map(s => ({ ...s, photo_path: `journey-media/${aCover}` })) };
  src.updated_at = (await save(db, src)).updated_at;
  // A's private draft photo.
  let priv = draft(2); priv.updated_at = (await save(db, priv)).updated_at;
  const aPrivate = `${A}/${jid(2)}/cover/private.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)", [aPrivate]);
  priv.updated_at = (await save(db, { ...priv, cover_image_path: `journey-media/${aPrivate}` })).updated_at;

  // Other user B: copy, published-photo read, own upload, foreign path rejected.
  await as(db, 'authenticated', B);
  const copyId = (await db.query('select public.copy_journey($1) as id', [jid(1)])).rows[0].id;
  const copied = (await db.query('select to_jsonb(j) as r from public.journeys j where id=$1', [copyId])).rows[0].r;
  assert.equal(copied.user_id, B); assert.equal(copied.cover_image_path, null); assert.equal(copied.copied_from_journey_id, jid(1));
  const copyStops = (await db.query('select to_jsonb(s) as r from public.journey_stops s where journey_id=$1', [copyId])).rows.map(r => r.r);
  assert.ok(copyStops.length === 1 && copyStops.every(s => s.photo_path === null));
  assert.deepEqual((await db.query('select name from storage.objects order by name')).rows.map(r => r.name), [aCover],
    'B reads the published photo, not the private one');
  const remix = { ...copied, stops: copyStops };
  remix.updated_at = (await save(db, remix)).updated_at;
  await rejects(save(db, { ...remix, cover_image_path: `journey-media/${aCover}` }), '22023');
  await rejects(save(db, { ...remix, cover_image_path: `journey-media/${aPrivate}` }), '22023');
  const bCover = `${B}/${copyId}/cover/own.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)", [bCover]);
  remix.updated_at = (await save(db, { ...remix, cover_image_path: `journey-media/${bCover}` })).updated_at;
  await rejects(db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)", [`${A}/${jid(1)}/cover/forged.jpg`]), '42501');

  // Anonymous: published photo readable; RPCs, direct writes and private photos blocked.
  await as(db, 'anon');
  assert.deepEqual((await db.query('select name from storage.objects order by name')).rows.map(r => r.name), [aCover]);
  await rejects(save(db, draft(3)), '42501');
  await rejects(db.query('select public.copy_journey($1)', [jid(1)]), '42501');
  await rejects(db.query('select private.journey_rpc_uid()'), '42501');
  await rejects(db.query("insert into public.journeys(user_id,title) values($1,'x')", [A]), '42501');
  await rejects(db.query('update public.journeys set title=$1 where id=$2', ['x', jid(1)]), '42501');
  await as(db, 'authenticated', B);
  await rejects(db.query('select private.journey_rpc_uid()'), '42501');
  console.log(`PASS live-like ACLs: ed3038f pattern warns, commits and fails 42501 at run time; the smoke test aborts it atomically; activation by another role (supabase_admin) is refused; fixed hardening applied by a non-superuser migrator saves, copies, attaches own uploads, serves published photos to other users and anon, rejects foreign paths and blocks anon (${checks} checks).`);
} finally { await db.close(); }
