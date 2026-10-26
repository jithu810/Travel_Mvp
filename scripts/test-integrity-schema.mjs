import assert from 'node:assert/strict';
import { offlineDb, migrations, migrationDirectory, as } from './lib/offline-db.mjs';
import { generateSeed, demoId } from './generate-demo-seed.mjs';
import { readdir, readFile } from 'node:fs/promises';

// Hardening must replay after the recorded live migrations (thumbnail, remix-without-media,
// customize-stops capture); names are resolved, never hard-coded, so re-dating is checked.
const names = (await readdir(migrationDirectory)).filter(n => n.endsWith('.sql')).sort();
const HARDENING = names.find(n => n.endsWith('_rpc_integrity_hardening.sql'));
const LEGACY = names.find(n => n.endsWith('_legacy_media_review.sql'));
const CAPTURE = names.find(n => n.endsWith('_capture_customize_stops.sql'));
assert.ok(HARDENING && LEGACY && CAPTURE);
for (const earlier of ['20261024041322_journey_media_thumbnail_v1_read.sql','20261025153306_remix_without_media.sql',CAPTURE])
  assert.ok(names.includes(earlier) && earlier < LEGACY && LEGACY < HARDENING, `${earlier} replays before hardening`);
assert.equal(names.some(n => n.includes('copy_journey_selected')), false, 'Media-copying selected-copy proposal is superseded');
const hardeningSql = await readFile(new URL(HARDENING, migrationDirectory), 'utf8');
const captureSql = await readFile(new URL(CAPTURE, migrationDirectory), 'utf8');

const owner = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const jid = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const sid = n => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const input = (n = 1) => ({ id: jid(n), title: 'Coastal route', description: '',
  destination_slug: 'varkala', traveler_type: 'solo', duration_days: 2,
  status: 'draft', updated_at: null, cover_image_path: null,
  stops: [{ id: sid(n), sequence: 1, name: 'Cliff', description: '', latitude: 8.7,
    longitude: 76.7, mapbox_place_id: null, photo_path: null, rating: 4, day_number: 1 }] });
let checks = 0;
async function rejects(promise, code) {
  await assert.rejects(promise, error => error.code === code); checks++;
}

const db = await offlineDb();
const save = async p => (await db.query('select public.save_journey($1::jsonb) as result', [JSON.stringify(p)])).rows[0].result;
const row = async id => (await db.query('select to_jsonb(j) as result from public.journeys j where id=$1', [id])).rows[0]?.result;
const copy = async id => (await db.query('select public.copy_journey($1) as id', [id])).rows[0].id;
try {
  await migrations(db);
  await db.query('insert into auth.users(id) values($1),($2)', [owner,other]);
  const roles = (await db.query("select rolcanlogin,rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname='journey_rpc'")).rows[0];
  assert.deepEqual(roles, { rolcanlogin: false, rolsuper: false, rolbypassrls: false, rolcreaterole: false });
  // PostgreSQL 16+ gives a non-superuser CREATEROLE creator (live: postgres) an automatic
  // admin-only membership, which stays after the temporary grant is revoked. Accept only
  // that shape: no INHERIT/SET for anyone, and never a client role.
  assert.equal((await db.query(`select count(*)::int as n from pg_auth_members m join pg_roles r on r.oid=m.member
    where m.roleid='journey_rpc'::regrole and (m.inherit_option or m.set_option or not m.admin_option
      or r.rolname in ('anon','authenticated'))`)).rows[0].n,0);
  // Identity helper stays owned by the migration role; only journey_rpc may execute it.
  assert.deepEqual((await db.query(`select pg_get_userbyid(proowner) as owner,prosecdef,proconfig,
      has_function_privilege('journey_rpc',oid,'EXECUTE') as rpc,has_function_privilege('anon',oid,'EXECUTE') as anon,
      has_function_privilege('authenticated',oid,'EXECUTE') as authenticated
    from pg_proc where oid='private.journey_rpc_uid()'::regprocedure`)).rows[0],
    { owner:'postgres',prosecdef:true,proconfig:['search_path=""'],rpc:true,anon:false,authenticated:false });
  assert.equal((await db.query(`select count(*)::int as n from pg_proc where oid in ('public.save_journey(jsonb)'::regprocedure,
    'public.copy_journey(uuid)'::regprocedure,'private.journey_media_readable(text)'::regprocedure)
    and pg_get_functiondef(oid) ~ 'auth\\.uid\\('`)).rows[0].n,0,'Execution-role bodies use the identity helper');
  assert.equal((await db.query(`select count(*)::int as n from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid in ('public.save_journey(jsonb)'::regprocedure,'public.copy_journey(uuid)'::regprocedure)
      and r.rolname='journey_rpc' and p.prosecdef and p.proconfig @> array['search_path=""']`)).rows[0].n, 2);
  assert.equal((await db.query("select count(*)::int as n from pg_trigger where tgconstraint <> 0 and tgdeferrable and not tgisinternal")).rows[0].n, 0);
  // Full sorted replay: hardening passed its allowlist with the recorded live policies present.
  assert.equal((await db.query("select to_regprocedure('private.copy_authorized_media(uuid,text)') is null as absent")).rows[0].absent,true,'copy_authorized_media is not created');
  assert.deepEqual((await db.query(`select policyname,roles from pg_policies where policyname like 'standalone\\_copy\\_%'
    or policyname='journey_media_thumbnail_v1_read' order by policyname`)).rows.map(r=>r.policyname),
    ['journey_media_thumbnail_v1_read','standalone_copy_insert','standalone_copy_lock','standalone_copy_read',
     'standalone_copy_receipts_insert','standalone_copy_receipts_read','standalone_copy_stops_insert','standalone_copy_stops_read']);
  assert.match((await db.query("select pg_get_functiondef('public.copy_journey(uuid)'::regprocedure) as d")).rows[0].d,/,null,false,source_id\)/);
  // The recorded customize-stops capture still verifies as a no-op after hardening.
  const fnSnapshot = async () => JSON.stringify((await db.query(`select jsonb_agg(jsonb_build_array(oid::regprocedure::text,proacl::text,xmin::text) order by oid)
    as v from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace)`)).rows[0].v);
  const beforeRerun = await fnSnapshot();
  await db.exec(captureSql);
  assert.equal(await fnSnapshot(), beforeRerun, 'Capture re-run after hardening changes nothing');
  await as(db,'anon');
  await rejects(save(input()), '42501');
  await rejects(copy(jid(1)), '42501');
  await as(db,'authenticated',owner);
  // PGlite's session user is superuser even after SET ROLE; inspect membership.
  assert.equal((await db.query("select pg_has_role('authenticated','journey_rpc','MEMBER') as ok")).rows[0].ok,false);
  let p = input();
  const savedContract=await save({ ...p, user_id: other, is_demo: true, copied_from_journey_id: jid(99) });
  assert.deepEqual(Object.keys(savedContract).sort(),['id','status','updated_at']);
  assert.equal(savedContract.id,p.id); assert.equal(savedContract.status,'draft');
  assert.equal(typeof savedContract.updated_at,'string');
  p.updated_at = savedContract.updated_at;
  await db.exec('create temp table journeys(id uuid); create temp table journey_stops(id uuid);');
  // Attacker-controlled search_path and temp names cannot redirect qualified SQL.
  await db.exec("set search_path=pg_temp,public");
  p.updated_at=(await save(p)).updated_at;
  assert.equal((await db.query('select count(*)::int as n from pg_temp.journeys')).rows[0].n,0);
  await db.exec('reset search_path');
  let current = await row(p.id);
  assert.equal(current.user_id,owner); assert.equal(current.is_demo,false); assert.equal(current.copied_from_journey_id,null);
  for (const role of ['anon','authenticated']) {
    await as(db,role,role === 'authenticated' ? owner : '');
    for (const sql of [
      `insert into public.journeys(user_id,title) values('${owner}','Bypass')`,
      `update public.journeys set is_demo=true where id='${p.id}'`,
      `insert into public.journey_stops(journey_id,sequence,name) values('${p.id}',2,'Bypass')`,
      `update public.journey_stops set photo_path='forged' where journey_id='${p.id}'`,
      `delete from public.journey_stops where journey_id='${p.id}'`,
      'truncate public.journey_stops',
      `insert into public.journeys(id,user_id,title) values('${p.id}','${owner}','Bypass') on conflict(id) do update set title=excluded.title`,
      `insert into private.journey_media_authorizations values('${p.id}','forged')`,
      "select private.copy_media_path('https://example.com/image.jpg')",
      'select private.journey_rpc_uid()',
    ]) await rejects(db.exec(sql),'42501');
  }
  await as(db,'authenticated',other);
  await rejects(save(p),'40001'); // No owned row; versioned request cannot create one.
  await rejects(copy(p.id),'P0002');
  assert.equal((await db.query('delete from public.journeys where id=$1 returning id',[p.id])).rows.length,0);
  await as(db,'authenticated',owner);
  for (const bad of [null, [], { ...p,id:'bad' }, { ...p,duration_days:'bad' }, { ...p,title:5 },
    { ...p,stops:null }, { ...p,cover_image_path:{} }, { ...p,description:'x'.repeat(5001) },
    { ...p,stops:[{ ...p.stops[0],sequence:2 }] }, { ...p,status:'published',stops:[] },
    { ...p,status:'published',stops:[{ ...p.stops[0],latitude:null,longitude:null }] },
    { ...p,stops:[{ ...p.stops[0],day_number:3 }] }, { ...p,stops:[{ ...p.stops[0],rating:6 }] },
    { ...p,stops:[{ ...p.stops[0],mapbox_place_id:'x'.repeat(501) }] },
    { ...p,stops:[p.stops[0],p.stops[0]] },
    { ...p,stops:Array.from({length:51},(_,i) => ({ ...p.stops[0],id:sid(100+i),sequence:i+1 })) },
  ]) await rejects(save(bad),'22023');

  // Versions advance even inside one transaction, and when the clock is behind OLD.
  await db.exec('begin');
  const a = await save(p); const b = await save({ ...p,updated_at:a.updated_at });
  assert.notEqual(a.updated_at,b.updated_at);
  assert.equal((await db.query('select $1::timestamptz > $2::timestamptz as ok',[b.updated_at,a.updated_at])).rows[0].ok,true);
  await db.exec('commit');
  await rejects(save({ ...p,updated_at:a.updated_at }),'40001');
  p.updated_at=b.updated_at;
  await db.exec('reset role');
  await db.query("update public.journeys set updated_at='2099-01-01' where id=$1",[p.id]); // Trigger owns version; explicit timestamp is ignored.
  await db.exec('alter table public.journeys disable trigger journeys_updated_at');
  await db.query("update public.journeys set updated_at='2099-01-01' where id=$1",[p.id]);
  await db.exec('alter table public.journeys enable trigger journeys_updated_at');
  await as(db,'authenticated',owner); p.updated_at=(await row(p.id)).updated_at;
  const future = await save(p);
  assert.equal((await db.query("select $1::timestamptz > '2099-01-01'::timestamptz as ok",[future.updated_at])).rows[0].ok,true);
  p.updated_at=future.updated_at;

  // Save -> immutable upload -> attach. A known foreign path cannot be attached.
  const ownObject=`${owner}/${p.id}/cover/photo.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)",[ownObject]);
  const victim=input(2);
  await as(db,'authenticated',other); victim.updated_at=(await save(victim)).updated_at;
  const victimObject=`${other}/${victim.id}/cover/private.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)",[victimObject]);
  victim.cover_image_path=`journey-media/${victimObject}`; victim.updated_at=(await save(victim)).updated_at;
  await as(db,'authenticated',owner);
  for (const media of [`journey-media/${victimObject}`,`journey-media/${ownObject}.missing`,
    '/images/forged.jpg','https://example.com/new.jpg','https://example.com/object/sign/a?token=x']) {
    await rejects(save({ ...p,cover_image_path:media }),'22023');
  }
  p.cover_image_path=`journey-media/${ownObject}`; p.stops[0].photo_path=p.cover_image_path;
  p.updated_at=(await save(p)).updated_at;
  await as(db,'anon');
  assert.equal((await db.query("select name from storage.objects where name=$1",[ownObject])).rows.length,0);
  await as(db,'authenticated',owner);
  p.status='published'; p.updated_at=(await save(p)).updated_at;
  const replacement=`${owner}/${p.id}/cover/replacement.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)",[replacement]);
  p.cover_image_path=`journey-media/${replacement}`; p.updated_at=(await save(p)).updated_at;
  // Published edits can restore an earlier owner upload while stops reuse it.
  p.cover_image_path=`journey-media/${ownObject}`; p.updated_at=(await save(p)).updated_at;
  // Execution-role RLS permits locking a published source, but not modifying it.
  await as(db,'journey_rpc',other);
  await rejects(db.query("update public.journeys set title='Stolen' where id=$1",[p.id]),'42501');
  await rejects(db.query('update public.journeys set user_id=$1 where id=$2',[other,p.id]),'42501');
  await rejects(db.query('delete from public.journeys where id=$1',[p.id]),'42501');
  await rejects(db.query('select * from storage.objects'),'42501'); // No object IDs/metadata grant.
  await as(db,'anon');
  assert.equal((await db.query("select name from storage.objects where name=$1",[ownObject])).rows.length,1);
  assert.equal((await db.query("select name from storage.objects where name=$1",[victimObject])).rows.length,0);
  await as(db,'authenticated',other);
  const copiedId=await copy(p.id); const copied=await row(copiedId);
  assert.equal(copied.status,'draft'); assert.equal(copied.user_id,other);
  assert.equal(copied.cover_image_path,null,'Hardened copy_journey stores no inherited cover (other user)');
  const stops=(await db.query('select to_jsonb(s) as result from public.journey_stops s where journey_id=$1 order by sequence',[copiedId])).rows.map(r=>r.result);
  assert.ok(stops.length>0 && stops.every(s=>s.photo_path===null),'Hardened copy_journey stores no inherited stop photos (other user)');
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from private.journey_media_authorizations where journey_id=$1',[copiedId])).rows[0].n,0,'Copies receive no media capability');
  await as(db,'authenticated',owner);
  const ownCopy=await copy(p.id);
  assert.equal((await row(ownCopy)).cover_image_path,null,'Hardened copy_journey stores no cover (owner)');
  assert.ok((await db.query('select photo_path from public.journey_stops where journey_id=$1',[ownCopy])).rows.every(s=>s.photo_path===null),'Hardened copy_journey stores no stop photos (owner)');
  await db.query('delete from public.journeys where id=$1',[ownCopy]);
  await as(db,'authenticated',other);
  // Customize Stops selected copy keeps working after hardening and stores no media.
  const selectedId=(await db.query('select public.copy_journey_selected($1,$2::uuid[],$3) as id',[p.id,[p.stops[0].id],jid(70)])).rows[0].id;
  assert.equal(selectedId,jid(70)); assert.equal((await row(selectedId)).cover_image_path,null,'Selected copy stores no cover after hardening');
  assert.deepEqual((await db.query('select photo_path from public.journey_stops where journey_id=$1',[selectedId])).rows,[{ photo_path:null }]);
  const selected=await row(selectedId);
  const selectedStops=(await db.query('select to_jsonb(s) as result from public.journey_stops s where journey_id=$1',[selectedId])).rows.map(r=>r.result);
  await save({ ...selected,title:'Edited selected copy',stops:selectedStops }); // Hardened editor accepts the selected draft.
  await db.query('delete from public.journeys where id=$1',[selectedId]);
  let cp={ ...copied,stops }; cp.updated_at=(await save(cp)).updated_at;
  // Neither clients nor execution role can overwrite immutable uploaded objects.
  await as(db,'authenticated',owner);
  assert.equal((await db.query("update storage.objects set name='overwritten' where name=$1 returning name",[ownObject])).rows.length,0);
  assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[ownObject])).rows.length,0);
  await as(db,'authenticated',other);
  // Recipients cannot import the source author's media by re-sending its path.
  await rejects(save({ ...cp,cover_image_path:p.cover_image_path }),'22023');
  await rejects(save({ ...cp,stops:cp.stops.map(s=>({ ...s,photo_path:p.cover_image_path })) }),'22023');
  await db.query('insert into public.saved_journeys(user_id,journey_id) values($1,$2)',[other,p.id]);
  await db.query('insert into public.journey_likes(user_id,journey_id) values($1,$2)',[other,p.id]);
  await as(db,'authenticated',owner);
  await db.query('delete from public.journeys where id=$1',[p.id]);
  await rejects(save(p),'40001');
  await as(db,'authenticated',other);
  const afterDelete=await row(copiedId);
  assert.equal(afterDelete.copied_from_journey_id,null); assert.notEqual(afterDelete.updated_at,cp.updated_at);
  await rejects(save(cp),'40001'); cp.updated_at=afterDelete.updated_at;
  cp.status='published'; cp.updated_at=(await save(cp)).updated_at;
  assert.equal((await db.query('select * from public.saved_journeys where journey_id=$1',[p.id])).rows.length,0);
  assert.equal((await db.query('select * from public.journey_likes where journey_id=$1',[p.id])).rows.length,0);
  await as(db,'authenticated',owner);
  const third=await copy(copiedId);
  await as(db,'authenticated',other); await db.query('delete from public.journeys where id=$1',[copiedId]);
  await as(db,'authenticated',owner);
  assert.equal((await row(third)).cover_image_path,null,'Remix of a remix stores no inherited cover');
  assert.equal((await db.query('select name from storage.objects where name=$1',[ownObject])).rows.length,1);
  await as(db,'anon');
  assert.equal((await db.query('select name from storage.objects where name=$1',[ownObject])).rows.length,0);

  // A stop failure must roll back version, parent, authorization and children together.
  await db.exec('reset role');
  await db.exec(`create function public.reject_test_stop() returns trigger language plpgsql as $$ begin raise exception 'Injected'; end $$;
    create trigger reject_test_stop before insert on public.journey_stops for each row execute function public.reject_test_stop();`);
  await as(db,'authenticated',owner); const before=await row(third);
  const thirdStops=(await db.query('select to_jsonb(s) as result from public.journey_stops s where journey_id=$1',[third])).rows.map(r=>r.result);
  await rejects(save({ ...before,title:'Must roll back',cover_image_path:null,stops:thirdStops }),'P0001');
  assert.deepEqual(await row(third),before);
  await db.exec('reset role'); await db.exec('drop trigger reject_test_stop on public.journey_stops');
  await as(db,'authenticated',owner);
  // A remix of a remix holds no capability for the original author's media.
  assert.ok(thirdStops.every(s=>s.photo_path===null),'Remix of a remix stores no inherited stop photos');
  await rejects(save({ ...before,cover_image_path:p.cover_image_path,stops:thirdStops }),'22023');
  const max=input(9); max.stops=Array.from({length:50},(_,i)=>({ ...max.stops[0],id:sid(100+i),sequence:i+1 }));
  await save(max);
  await db.query("delete from public.journeys where id=$1 and user_id=$2 and status='draft' and is_demo=false returning id",[max.id,owner]);
  assert.equal(await row(max.id),undefined);
  // Current demo seeding remains privileged and explicit, but emits valid stops
  // and authorizes only its known repository cover assets.
  await db.exec('reset role');
  const samples=JSON.parse(await readFile(new URL('../src/lib/discovery/demo-journeys.json',import.meta.url),'utf8'));
  const seed=generateSeed(samples,owner); await db.exec(seed); await db.exec(seed);
  await as(db,'authenticated',other);
  const demoCopy=await copy(demoId(samples[0].id));
  assert.equal((await row(demoCopy)).cover_image_path,null,'Demo remixes also start without inherited media');
  console.log(`PASS: full migration chain; ${checks} rejection checks; RPC ownership, media capabilities, copy chains, versions, cascades and atomic rollback (offline PGlite).`);
} finally { await db.close(); }

// Upgrade gate: historical references are not automatically trusted.
const legacy=await offlineDb();
try {
  await migrations(legacy,n=>n<HARDENING);
  await legacy.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  await as(legacy,'authenticated',owner);
  await legacy.query("insert into public.journeys(id,user_id,title,cover_image_path,destination_slug,traveler_type) values($1,$2,'Legacy copy',$3,'goa','solo')",
    [jid(77),owner,`journey-media/${other}/${jid(88)}/cover/photo.jpg`]);
  await legacy.exec('reset role');
  await assert.rejects(migrations(legacy,n=>n>=HARDENING),/Legacy media review required/);
  await legacy.exec('rollback');
  assert.equal((await legacy.query("select has_table_privilege('authenticated','public.journeys','INSERT') as ok")).rows[0].ok,true,'Failed migration is atomic');
  await legacy.query('insert into private.legacy_journey_media_approvals(journey_id,media_path,review_note) values($1,$2,$3)',
    [jid(77),`journey-media/${other}/${jid(88)}/cover/photo.jpg`,'Offline fixture: independently verified historical copy']);
  await migrations(legacy,n=>n>=HARDENING);
  await as(legacy,'authenticated',owner);
  assert.equal((await legacy.query('select cover_image_path from public.journeys where id=$1',[jid(77)])).rows[0].cover_image_path,
    `journey-media/${other}/${jid(88)}/cover/photo.jpg`);
  console.log('PASS: legacy upgrade blocks ambiguous media, preserves rows, and accepts explicit reviewed provenance.');
} finally { await legacy.close(); }

const acl=await offlineDb();
try {
  await migrations(acl,n=>n<HARDENING);
  await acl.exec(`create role unexpected_writer nologin;
    grant unexpected_writer to authenticated;
    grant update on public.journeys to unexpected_writer;`);
  await assert.rejects(migrations(acl,n=>n>=HARDENING),/Unexpected inherited client mutation privileges/);
  await acl.exec('rollback');
  assert.equal((await acl.query("select count(*)::int as n from pg_roles where rolname='journey_rpc'")).rows[0].n,0);
  await acl.exec(`revoke update on public.journeys from unexpected_writer;
    grant insert(title),update(title) on public.journeys to authenticated;
    grant update(photo_path) on public.journey_stops to public;`);
  await acl.exec('alter table public.journeys disable row level security');
  await assert.rejects(migrations(acl,n=>n>=HARDENING),/Unexpected RLS bypass/);
  await acl.exec('rollback');
  await acl.exec(`alter table public.journeys enable row level security;
    create policy unexpected_delete on public.journeys for delete to authenticated using(true);`);
  await assert.rejects(migrations(acl,n=>n>=HARDENING),/Unexpected policies/);
  await acl.exec('rollback'); await acl.exec('drop policy unexpected_delete on public.journeys');
  await migrations(acl,n=>n>=HARDENING);
  assert.equal((await acl.query("select has_any_column_privilege('authenticated','public.journeys','INSERT,UPDATE') as ok")).rows[0].ok,false);
  assert.equal((await acl.query("select has_any_column_privilege('anon','public.journey_stops','UPDATE') as ok")).rows[0].ok,false);
  console.log('PASS: inherited privilege drift aborts atomically; explicit and PUBLIC column privileges are removed.');
} finally { await acl.close(); }

// Same-name drift must not survive, even when command/roles also changed.
const policies=await offlineDb();
try {
  await migrations(policies,n=>n<HARDENING);
  await policies.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  await policies.query(`insert into public.journeys(id,user_id,title,destination_slug,traveler_type)
    values($1,$2,'Private','goa','solo')`,[jid(90),owner]);
  await policies.query("insert into public.journey_stops(id,journey_id,sequence,name) values($1,$2,1,'Private stop')",[sid(90),jid(90)]);
  const targets=[['public','journeys','journeys_delete_own'],['public','journeys','journeys_read'],
    ['public','journey_stops','journey_stops_read'],['storage','objects','journey_media_read'],
    ['storage','objects','journey_media_insert'],['storage','objects','profile_avatars_read'],
    ['storage','objects','profile_avatars_insert']];
  for (const [schema,table,name] of targets) await policies.exec(`drop policy ${name} on ${schema}.${table};
    create policy ${name} on ${schema}.${table} for all to public using(true) with check(true);`);
  // Demonstrate the reported cross-owner deletion, without retaining its effects.
  await as(policies,'authenticated',other);
  await policies.exec('begin');
  assert.equal((await policies.query('delete from public.journeys where id=$1 returning id',[jid(90)])).rows.length,1);
  await policies.exec('rollback'); await policies.exec('reset role');
  // Force a late activation failure after policy recreation; all DDL must roll back.
  await policies.exec('create policy unexpected_storage on storage.objects for select to anon using(true)');
  await assert.rejects(migrations(policies,n=>n>=HARDENING),/Unexpected policies/);
  await policies.exec('rollback');
  assert.equal((await policies.query("select cmd from pg_policies where policyname='journeys_delete_own'")).rows[0].cmd,'ALL');
  assert.equal((await policies.query("select to_regclass('private.journey_media_authorizations') as relation")).rows[0].relation,null);
  assert.equal((await policies.query("select count(*)::int as n from pg_roles where rolname='journey_rpc'")).rows[0].n,0);
  await policies.exec('drop policy unexpected_storage on storage.objects');
  await migrations(policies,n=>n>=HARDENING);
  const clean=await offlineDb();
  try {
    await migrations(clean);
    const definitions="select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies order by schemaname,tablename,policyname";
    assert.deepEqual((await policies.query(definitions)).rows,(await clean.query(definitions)).rows);
  } finally { await clean.close(); }
  for (const [role,user] of [['anon',''],['authenticated',other]]) {
    await as(policies,role,user);
    assert.equal((await policies.query('select id from public.journeys where id=$1',[jid(90)])).rows.length,0);
    assert.equal((await policies.query('select id from public.journey_stops where journey_id=$1',[jid(90)])).rows.length,0);
  }
  await as(policies,'authenticated',other);
  assert.equal((await policies.query('delete from public.journeys where id=$1 returning id',[jid(90)])).rows.length,0);
  await rejects(policies.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)",[`${owner}/${jid(90)}/forged.jpg`]),'42501');
  await rejects(policies.query("insert into storage.objects(bucket_id,name) values('profile-avatars',$1)",[`${owner}/forged.jpg`]),'42501');
  await as(policies,'authenticated',owner);
  assert.equal((await policies.query('delete from public.journeys where id=$1 returning id',[jid(90)])).rows.length,1);
  console.log('PASS: seven unsafe same-name policies restored to canonical definitions; owner deletion, private visibility, Storage writes and late-failure atomicity.');
} finally { await policies.close(); }

const metadata=await offlineDb();
try {
  await migrations(metadata,n=>n<HARDENING);
  await metadata.query('insert into auth.users(id) values($1)',[owner]);
  const cases=[{destination_slug:null,traveler_type:'solo'},
    {destination_slug:'goa',traveler_type:null},
    {destination_slug:null,traveler_type:null},
    {destination_slug:'goa',traveler_type:'solo',destination_name:''},
    {destination_slug:'goa',traveler_type:'solo',destination_name:'Goa'},
    {destination_slug:'goa',traveler_type:'solo',destination_name:'   ',destination_latitude:15,destination_longitude:73}];
  for (const status of ['draft','published']) for (const fields of cases) {
    await metadata.query(`insert into public.journeys(id,user_id,title,status,published_at)
      values($1,$2,'Historical',$3,case when $3='published' then now() end)`,[jid(91),owner,status]);
    for (const [key,value] of Object.entries(fields)) await metadata.query(`update public.journeys set ${key}=$1 where id=$2`,[value,jid(91)]);
    await metadata.query("insert into public.journey_stops(journey_id,sequence,name,latitude,longitude) values($1,1,'Stop',15,73)",[jid(91)]);
    const before=(await metadata.query('select to_jsonb(j) as row from public.journeys j')).rows;
    await assert.rejects(migrations(metadata,n=>n>=HARDENING),/Legacy journey metadata review required/);
    await metadata.exec('rollback');
    assert.deepEqual((await metadata.query('select to_jsonb(j) as row from public.journeys j')).rows,before);
    assert.equal((await metadata.query("select has_table_privilege('authenticated','public.journeys','INSERT') as ok")).rows[0].ok,true);
    await metadata.query('delete from public.journeys where id=$1',[jid(91)]);
  }
  // Named destinations without display metadata use save's established fallback.
  await metadata.query(`insert into public.journeys(id,user_id,title,status,published_at,destination_slug,traveler_type)
    values($1,$2,'Historical Goa','published',now(),'goa','solo')`,[jid(92),owner]);
  await metadata.query("insert into public.journey_stops(journey_id,sequence,name,latitude,longitude) values($1,1,'Stop',15,73)",[jid(92)]);
  await migrations(metadata,n=>n>=HARDENING);
  await as(metadata,'authenticated',owner);
  const copied=(await metadata.query('select public.copy_journey($1) as id',[jid(92)])).rows[0].id;
  assert.equal((await metadata.query('select destination_name from public.journeys where id=$1',[copied])).rows[0].destination_name,'Goa');
  console.log('PASS: twelve incomplete historical metadata cases rejected unchanged/atomically; valid named-place fallback remains copyable.');
} finally { await metadata.close(); }

// Allowlist and media-copy postconditions, each in an isolated in-memory database.
async function hardeningRejects(setupSql, pattern, sql = hardeningSql) {
  const gate=await offlineDb();
  try {
    await migrations(gate,n=>n<HARDENING);
    if (setupSql) await gate.exec(setupSql);
    await assert.rejects(gate.exec(sql),pattern); checks++;
    await gate.exec('rollback');
    assert.equal((await gate.query("select count(*)::int as n from pg_roles where rolname='journey_rpc'")).rows[0].n,0,'Rejected activation is atomic');
    assert.equal((await gate.query("select to_regclass('private.journey_media_authorizations') as r")).rows[0].r,null);
  } finally { await gate.close(); }
}
// Live Customize Stops policy names are allowed only for customize_stops_rpc.
await hardeningRejects('alter policy standalone_copy_read on public.journeys to customize_stops_rpc, authenticated',/Unexpected policies/);
await hardeningRejects('create policy standalone_copy_extra on public.journey_stops for select to authenticated using (true)',/Unexpected policies/);
await hardeningRejects('create policy unexpected_thumbnail on storage.objects for select to anon using (true)',/Unexpected policies/);
// A media-copying copy_journey in the activation file is caught by the postcondition guard.
const mutated=hardeningSql.replace(
  "(source->>'duration_days')::integer,null,false,source_id)",
  "(source->>'duration_days')::integer,private.copy_media_path(source->>'cover_image_path'),false,source_id)");
assert.notEqual(mutated,hardeningSql);
await hardeningRejects(null,/Remix media copy detected/,mutated);
// So is a pre-existing selected-copy RPC that was changed to copy media.
await hardeningRejects(`do $d$ declare d text := pg_get_functiondef('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure);
  begin execute replace(d,'source->>''traveler_type'',days,null,false,source_id)',
    'source->>''traveler_type'',days,private.copy_media_path(source->>''cover_image_path''),false,source_id)'); end $d$`,/Remix media copy detected/);
await hardeningRejects('create function private.copy_authorized_media(source_id uuid, media text) returns text language sql as $$ select media $$',/Remix media copy detected/);
// Execution-role bodies must not name auth.uid() (live journey_rpc has no auth USAGE;
// see test-integrity-live-acl.mjs), and the identity helper must stay journey_rpc-only.
const directUid=hardeningSql.replace('uid uuid := (select private.journey_rpc_uid());','uid uuid := (select auth.uid());');
assert.notEqual(directUid,hardeningSql);
await hardeningRejects(null,/must use private\.journey_rpc_uid\(\), not auth\.uid\(\)/,directUid);
const widenedHelper=hardeningSql.replace('grant execute on function private.journey_rpc_uid() to journey_rpc;',
  'grant execute on function private.journey_rpc_uid() to journey_rpc, authenticated;');
assert.notEqual(widenedHelper,hardeningSql);
await hardeningRejects(null,/Identity helper drift/,widenedHelper);
console.log(`PASS: activation allowlist accepts only the recorded live customize-stops/thumbnail policies and the postcondition guard rejects media-copying copy paths (${checks} checks).`);
