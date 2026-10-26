// LOCAL ONLY: in-memory PGlite with synthetic fixtures. No hosted DSNs, credentials or environment files.
// Covers the recorded live migrations 20261024041322 (thumbnail read policy) and the
// customize-stops capture: fresh creation, live-hash equality, verified no-op re-runs,
// fail-closed partial/drift states, selected-copy RPC contract and media nulling.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { offlineDb, migrations, migrationDirectory, as } from './lib/offline-db.mjs';

const captureName = (await readdir(migrationDirectory)).find(n => /^\d{14}_capture_customize_stops\.sql$/.test(n));
assert.ok(captureName && captureName > '20261025153306', 'Capture migration is ordered after 20261025153306');
const captureSql = await readFile(new URL(captureName, migrationDirectory), 'utf8');
const thumbnailSql = await readFile(new URL('20261024041322_journey_media_thumbnail_v1_read.sql', migrationDirectory), 'utf8');
const liveHashes = {
  'private.standalone_copy_journey_selected(uuid,uuid[],uuid)': 'b9a95cb7700305d411fc587cfee49514',
  'public.copy_journey_selected(uuid,uuid[],uuid)': 'bb564a93eb33c7a7d4a616048fceaa15',
  'private.customize_stops_jwt_uid()': '74d7f773eb11814b26f5de32e3f075cd',
};
const author = '51000000-0000-0000-0000-000000000001';
const copier = '51000000-0000-0000-0000-000000000002';
const foreign = '51000000-0000-0000-0000-000000000003';
const id = n => `52000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const sid = n => `53000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const media = n => `54000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const input = n => ({ id: id(n), title: 'Standalone synthetic route', description: 'Source metadata',
  destination_slug: 'fixture-city', destination_name: 'Fixture City', destination_latitude: 10, destination_longitude: 20,
  traveler_type: 'solo', duration_days: 3, status: 'published', updated_at: null, cover_image_path: null,
  stops: [1, 2, 3].map(v => ({ id: sid(n * 10 + v), sequence: v, name: `Stop ${v}`, description: `Memory ${v}`,
    latitude: 10 + v / 100, longitude: 20 + v / 100, mapbox_place_id: `fixture-${v}`, rating: v, day_number: v, photo_path: null })) });
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const reject = async (p, code, m) => { await assert.rejects(p, e => e.code === code, m); checks++; };
const rejectMessage = async (p, pattern) => { await assert.rejects(p, e => pattern.test(e.message)); checks++; };
const beforeCapture = n => n < captureName;

// Catalog snapshot used to prove a re-run changes nothing (xmin changes on any rewrite).
const catalogSnapshot = db => db.query(`select jsonb_build_object(
  'functions',(select jsonb_agg(jsonb_build_object('fn',p.oid::regprocedure::text,'def',pg_get_functiondef(p.oid),
    'acl',p.proacl::text,'owner',p.proowner::regrole::text,'xmin',p.xmin::text) order by p.oid::regprocedure::text)
    from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace)),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
  'policyRows',(select jsonb_agg(xmin::text order by oid) from pg_policy),
  'classes',(select jsonb_agg(jsonb_build_array(oid::regclass::text,relacl::text,xmin::text) order by oid::regclass::text)
    from pg_class where relnamespace in ('public'::regnamespace,'private'::regnamespace)),
  'roles',(select jsonb_agg(jsonb_build_array(rolname,xmin::text) order by rolname) from pg_authid),
  'members',(select jsonb_agg(to_jsonb(m) order by roleid,member) from pg_auth_members m),
  'namespaces',(select jsonb_agg(jsonb_build_array(nspname,nspacl::text) order by nspname) from pg_namespace)) as value`)
  .then(r => r.rows[0].value);

// 1. Fresh database in timestamp order; capture creates the live end state.
const db = await offlineDb();
const save = async p => (await db.query('select public.save_journey($1::jsonb) as result', [JSON.stringify(p)])).rows[0].result;
const copy = async (src, ids, target) => (await db.query('select public.copy_journey_selected($1,$2::uuid[],$3) as id', [src, ids, target])).rows[0].id;
const copyAll = async src => (await db.query('select public.copy_journey($1) as id', [src])).rows[0].id;
const row = async target => (await db.query('select to_jsonb(j) as value from public.journeys j where id=$1', [target])).rows[0]?.value;
const stops = async target => (await db.query('select * from public.journey_stops where journey_id=$1 order by sequence', [target])).rows;
const admin = () => db.exec('reset role');
const counts = async () => { await admin(); return (await db.query(`select
  (select count(*)::int from public.journeys) as journeys,
  (select count(*)::int from public.journey_stops) as stops,
  (select count(*)::int from private.standalone_selected_copy_receipts) as receipts`)).rows[0]; };
try {
  await migrations(db, beforeCapture);
  // Legacy rows that already carry media must be untouched by the capture.
  await db.query('insert into auth.users values($1),($2),($3)', [author, copier, foreign]);
  await as(db, 'authenticated', author);
  await save(input(90));
  await db.query("update public.journeys set cover_image_path='/images/goa.jpg' where id=$1", [id(90)]);
  await db.query("update public.journey_stops set photo_path='/images/goa.jpg' where journey_id=$1", [id(90)]);
  await admin();
  const legacy = async () => JSON.stringify((await db.query(`select (select jsonb_agg(to_jsonb(j) order by id) from public.journeys j) as j,
    (select jsonb_agg(to_jsonb(s) order by id) from public.journey_stops s) as s`)).rows[0]);
  const legacyBefore = await legacy();
  await db.exec(captureSql);
  eq(await legacy(), legacyBefore, 'Capture leaves existing journey/stop rows unchanged');

  for (const [fn, hash] of Object.entries(liveHashes)) {
    eq((await db.query("select md5(replace(pg_get_functiondef($1::regprocedure),chr(13),'')) as h", [fn])).rows[0].h, hash, `${fn} hashes to the live value`);
  }
  eq((await db.query(`select rolcanlogin,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname='customize_stops_rpc'`)).rows[0],
    { rolcanlogin: false, rolsuper: false, rolinherit: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  eq((await db.query(`select count(*)::int as n from pg_auth_members where roleid='customize_stops_rpc'::regrole or member='customize_stops_rpc'::regrole`)).rows[0].n, 0,
    'Temporary installer membership removed (PGlite superuser has no bootstrap membership)');
  eq((await db.query(`select has_schema_privilege('customize_stops_rpc','public','USAGE') as public_usage,
    has_schema_privilege('customize_stops_rpc','private','USAGE') as private_usage,
    has_schema_privilege('customize_stops_rpc','private','CREATE') as private_create,
    has_schema_privilege('customize_stops_rpc','auth','USAGE') as auth_usage,
    has_schema_privilege('customize_stops_rpc','storage','USAGE') as storage_usage,
    has_table_privilege('customize_stops_rpc','storage.objects','SELECT') as objects,
    has_function_privilege('customize_stops_rpc','auth.uid()','EXECUTE') as auth_uid`)).rows[0],
    { public_usage: true, private_usage: true, private_create: false, auth_usage: false, storage_usage: false, objects: false, auth_uid: true },
    'Live schema privileges; auth.uid() EXECUTE only via PUBLIC, unusable without auth USAGE');
  eq((await db.query(`select p.oid::regprocedure::text as fn,r.rolname as owner,p.prosecdef,p.proconfig,p.proacl::text as acl
    from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid in ('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure,
    'private.customize_stops_jwt_uid()'::regprocedure,'public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) order by 1`)).rows,
    [{ fn: 'copy_journey_selected(uuid,uuid[],uuid)', owner: 'postgres', prosecdef: false, proconfig: ['search_path=""'], acl: '{postgres=X/postgres,authenticated=X/postgres}' },
     { fn: 'private.customize_stops_jwt_uid()', owner: 'postgres', prosecdef: true, proconfig: ['search_path=""'], acl: '{postgres=X/postgres,customize_stops_rpc=X/postgres}' },
     { fn: 'private.standalone_copy_journey_selected(uuid,uuid[],uuid)', owner: 'customize_stops_rpc', prosecdef: true, proconfig: ['search_path=""', 'lock_timeout=5s'],
       acl: '{customize_stops_rpc=X/customize_stops_rpc,authenticated=X/customize_stops_rpc}' }]);
  eq((await db.query(`select relacl::text as acl,relrowsecurity,relforcerowsecurity from pg_class where oid='private.standalone_selected_copy_receipts'::regclass`)).rows[0],
    { acl: '{postgres=arwdDxtm/postgres,customize_stops_rpc=ar/postgres}', relrowsecurity: true, relforcerowsecurity: false }, 'Live receipts ACL');
  for (const role of ['anon', 'authenticated']) {
    eq((await db.query(`select has_table_privilege($1,'private.standalone_selected_copy_receipts','SELECT,INSERT,UPDATE,DELETE') as t,
      has_function_privilege($1,'private.customize_stops_jwt_uid()','EXECUTE') as helper`, [role])).rows[0], { t: false, helper: false });
  }
  eq((await db.query(`select has_function_privilege('anon','public.copy_journey_selected(uuid,uuid[],uuid)','EXECUTE') as anon_wrapper,
    has_function_privilege('anon','private.standalone_copy_journey_selected(uuid,uuid[],uuid)','EXECUTE') as anon_rpc`)).rows[0],
    { anon_wrapper: false, anon_rpc: false });
  eq((await db.query(`select count(*)::int as n from pg_policies where 'customize_stops_rpc'=any(roles)`)).rows[0].n, 7);

  // 2. Re-runs are verified no-ops.
  const snapshot = await catalogSnapshot(db);
  await db.exec(captureSql);
  await db.exec(thumbnailSql);
  eq(await catalogSnapshot(db), snapshot, 'Re-running capture and thumbnail migrations changes no catalog row');

  // 3. Selected-copy RPC contract.
  await as(db, 'anon'); await reject(copy(id(1), [sid(11)], id(10)), '42501');
  await reject(db.query('select private.standalone_copy_journey_selected($1,$2::uuid[],$3)', [id(1), [sid(11)], id(10)]), '42501');
  await as(db, 'authenticated'); await reject(copy(id(1), [sid(11)], id(10)), '28000');
  await admin(); await reject(copy(id(1), [sid(11)], id(10)), '28000', 'Privileged session without a JWT subject is rejected');
  await as(db, 'authenticated', author); await save(input(1)); await save(input(2));
  await db.query("update public.journeys set cover_image_path='https://fixture.invalid/object/sign/photo?token=synthetic' where id=$1", [id(1)]);
  await db.query("update public.journey_stops set photo_path='journey-media/unknown/private.jpg' where journey_id=$1", [id(1)]);
  const before = await row(id(1)), beforeStops = await stops(id(1));
  await as(db, 'authenticated', copier);
  eq(await copy(id(1), [sid(13), sid(11)], id(10)), id(10));
  const draft = await row(id(10)), selected = await stops(id(10));
  eq([draft.user_id, draft.status, draft.is_demo, draft.copied_from_journey_id], [copier, 'draft', false, id(1)]);
  eq(draft.cover_image_path, null, 'Selected copy stores no cover'); eq(selected.map(s => s.photo_path), [null, null], 'Selected copy stores no stop photos');
  eq(selected.map(s => [s.sequence, s.name, s.day_number]), [[1, 'Stop 1', 1], [2, 'Stop 3', 3]]);
  eq(selected.every(s => !input(1).stops.some(old => old.id === s.id)), true);
  await as(db, 'authenticated', author); eq(await row(id(1)), before); eq(await stops(id(1)), beforeStops);

  // Remix of a remix: the copier publishes the copy with their own media, a third user copies it.
  await as(db, 'authenticated', copier);
  await save({ ...draft, status: 'published', stops: selected });
  await db.query("update public.journeys set cover_image_path='/images/varkala.jpg' where id=$1", [id(10)]);
  await db.query("update public.journey_stops set photo_path='/images/varkala.jpg' where journey_id=$1", [id(10)]);
  const published = await row(id(10)), publishedStops = await stops(id(10));
  eq(await copy(id(1), [sid(11), sid(13)], id(10)), id(10), 'Identical replay returns the existing copy');
  eq(await row(id(10)), published, 'Replay never overwrites the edited copy'); eq(await stops(id(10)), publishedStops);
  await as(db, 'authenticated', foreign);
  const second = await copy(id(10), [publishedStops[0].id], id(12));
  eq((await row(second)).cover_image_path, null); eq((await stops(second)).map(s => s.photo_path), [null]);
  const whole = await copyAll(id(10));
  eq((await row(whole)).cover_image_path, null, 'copy_journey of a remix stores no cover');
  eq((await stops(whole)).map(s => s.photo_path), [null, null], 'copy_journey of a remix stores no stop photos');
  await as(db, 'authenticated', author); eq(JSON.parse(await legacy()).j.find(j => j.id === id(90)).cover_image_path, '/images/goa.jpg', 'Legacy row keeps its media');

  // Idempotency and atomic rejection.
  await as(db, 'authenticated', copier);
  eq(await copy(id(1), [sid(12)], id(11)), id(11)); eq((await stops(id(11))).map(s => s.sequence), [1]);
  for (const [src, ids, target] of [[id(1), [], id(20)], [id(1), null, id(20)], [id(1), [null], id(20)],
    [id(1), [sid(11), sid(11)], id(20)], [id(1), [sid(21)], id(20)], [id(1), [sid(11)], id(1)], [null, [sid(11)], id(20)],
    [id(1), [sid(11)], null], [id(1), Array.from({ length: 51 }, (_, i) => sid(100 + i)), id(20)],
    [id(1), [sid(12)], id(10)], [id(2), [sid(21)], id(10)]]) {
    const baseline = await counts(); await as(db, 'authenticated', copier);
    await reject(copy(src, ids, target), '22023'); eq(await counts(), baseline);
  }
  await as(db, 'authenticated', copier);
  await reject(db.exec('select * from private.standalone_selected_copy_receipts'), '42501');
  await reject(db.query('insert into private.standalone_selected_copy_receipts(draft_id,user_id,source_id,selected_stop_ids) values($1,$2,$3,$4::uuid[])', [id(20), copier, id(1), [sid(11)]]), '42501');
  await as(db, 'authenticated', foreign); await reject(copy(id(1), [sid(11), sid(13)], id(10)), '22023', 'Foreign draft_id collision');
  await as(db, 'authenticated', author);
  await save({ ...input(3), status: 'draft' }); await save(input(4));
  await db.query('update public.journeys set is_demo=true where id=$1', [id(4)]);
  for (const [src, ids] of [[id(3), [sid(31)]], [id(4), [sid(41)]]]) {
    const baseline = await counts(); await as(db, 'authenticated', copier);
    await reject(copy(src, ids, id(30)), 'P0002', 'Draft and demo sources are not copyable'); eq(await counts(), baseline);
  }
  await as(db, 'authenticated', copier);
  await db.query('delete from public.journeys where id=$1', [id(11)]);
  await reject(copy(id(1), [sid(12)], id(11)), 'P0002', 'Deleted copy is not recreated by a retry');
  await admin(); eq((await db.query('select count(*)::int as n from private.standalone_selected_copy_receipts where user_id=$1', [copier])).rows[0].n, 2);
  await db.query('delete from auth.users where id=$1', [copier]);
  eq((await db.query('select count(*)::int as n from private.standalone_selected_copy_receipts where user_id=$1', [copier])).rows[0].n, 0);

  // 4. Thumbnail read policy (recorded live 20261024041322).
  await as(db, 'authenticated', author);
  const jid = id(5), cover = media(1);
  await save(input(5));
  const thumb = `${author}/${jid}/cover/${cover}.thumb-512-v1.jpg`;
  await db.query('update public.journeys set cover_image_path=$2 where id=$1', [jid, `journey-media/${author}/${jid}/cover/${cover}.full-v1.jpg`]);
  await admin();
  await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1),('journey-media',$2)", [thumb, `${author}/${jid}/cover/${cover}.other.jpg`]);
  const visible = async () => (await db.query("select name from storage.objects where bucket_id='journey-media' order by name")).rows.map(r => r.name);
  await as(db, 'anon'); eq(await visible(), [thumb], 'Published reference exposes only its v1 thumbnail');
  await as(db, 'authenticated', author); await db.query("update public.journeys set status='draft',published_at=null where id=$1", [jid]);
  await as(db, 'anon'); eq(await visible(), [], 'Draft thumbnail hidden from anon');
  await as(db, 'authenticated', foreign); eq(await visible(), [], 'Draft thumbnail hidden from other users');
  await as(db, 'authenticated', author); eq((await visible()).includes(thumb), true, 'Owner reads own draft thumbnail');
  await admin();
  eq((await db.query("select count(*)::int as n from pg_policies where policyname='journey_media_thumbnail_v1_read'")).rows[0].n, 1);
} finally { await db.close(); }

// 5. Fail-closed states: partial objects, drift and wrong ordering never change anything.
async function expectRejected(setup, pattern) {
  const fresh = await offlineDb();
  try {
    await migrations(fresh, beforeCapture);
    if (setup.full) await fresh.exec(captureSql);
    await fresh.exec(setup.sql);
    const snapshot = await catalogSnapshot(fresh);
    await rejectMessage(fresh.exec(captureSql), pattern);
    await fresh.exec('rollback');
    eq(await catalogSnapshot(fresh), snapshot, `Rejected run leaves catalogs unchanged: ${pattern}`);
  } finally { await fresh.close(); }
}
await expectRejected({ sql: 'create role customize_stops_rpc nologin noinherit' }, /Partial customize-stops state \(1 of 5/);
await expectRejected({ sql: 'create function public.copy_journey_selected(uuid,uuid[],uuid) returns uuid language sql as $$ select null::uuid $$' }, /Partial customize-stops state/);
await expectRejected({ sql: 'create table private.journey_media_authorizations(journey_id uuid, media_path text)' }, /must run first/);
await expectRejected({ full: true, sql: 'alter policy standalone_copy_read on public.journeys using (true)' }, /execution-role policies/);
await expectRejected({ full: true, sql: 'grant usage on schema auth to customize_stops_rpc' }, /schema privileges/);
await expectRejected({ full: true, sql: 'grant update (user_id) on public.journeys to customize_stops_rpc' }, /journey\/stop privileges/);
await expectRejected({ full: true, sql: 'grant execute on function public.copy_journey_selected(uuid,uuid[],uuid) to anon' }, /function ownership or ACL/);
await expectRejected({ full: true, sql: 'grant authenticated to customize_stops_rpc' }, /role attributes or membership/);
await expectRejected({ full: true, sql: `create or replace function public.copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)
  returns uuid language sql set search_path = '' as $$ select draft_id $$` }, /function definitions/);
await expectRejected({ full: true, sql: 'grant delete on private.standalone_selected_copy_receipts to customize_stops_rpc' }, /receipts table/);

console.log(`PASS customize-stops capture: ${checks} assertions; live hashes/ACLs/policies on fresh create, verified no-op re-runs, fail-closed partial/drift/order states, selected-copy contract with null media (incl. remix of remix and copy_journey), legacy rows untouched, idempotency, atomic rejection and thumbnail read policy.`);
