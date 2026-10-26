// SUPERSEDED: tests the media-copying 20261020164047 selected-copy proposal; live uses standalone
// (see supabase/migrations/20261026045508_capture_customize_stops.sql). Not run by any script.
// Executes the complete local migration history in disposable PostgreSQL/WASM.
// No .env, sockets, hosted credentials or persistent database files are used.
import assert from 'node:assert/strict';
import { offlineDb, migrations, as } from './lib/offline-db.mjs';

const author = '10000000-0000-0000-0000-000000000001';
const copier = '10000000-0000-0000-0000-000000000002';
const foreign = '10000000-0000-0000-0000-000000000003';
const jid = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const sid = n => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const db = await offlineDb();
let assertions = 0;
const equal = (a,b) => { assert.deepEqual(a,b); assertions++; };
const reject = async (promise,code) => { await assert.rejects(promise,e => e.code === code); assertions++; };
const save = async p => (await db.query('select public.save_journey($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
const copy = async (source,ids,target) => (await db.query('select public.copy_journey_selected($1::uuid,$2::uuid[],$3::uuid) as id',[source,ids,target])).rows[0].id;
const row = async id => (await db.query('select to_jsonb(j) as value from public.journeys j where id=$1',[id])).rows[0]?.value;
const stops = async id => (await db.query('select * from public.journey_stops where journey_id=$1 order by sequence',[id])).rows;
const admin = async () => db.exec('reset role');
const counts = async () => {
  await admin();
  return (await db.query(`select (select count(*)::int from public.journeys) as journeys,
    (select count(*)::int from public.journey_stops) as stops,
    (select count(*)::int from private.selected_copy_requests) as receipts,
    (select count(*)::int from private.journey_media_authorizations) as media`)).rows[0];
};
const input = n => ({ id:jid(n), title:'Selected coastal route', description:'Source description',
  destination_slug:'varkala', traveler_type:'friends', duration_days:3, status:'published', updated_at:null,
  cover_image_path:null, stops:[1,2,3].map((v,i) => ({id:sid(n*10+v),sequence:v,name:`Stop ${v}`,
    description:`Memory ${v}`,latitude:8.7+i/10,longitude:76.7+i/10,
    mapbox_place_id:`place-${v}`,photo_path:null,rating:v,day_number:v})) });
try {
  await migrations(db);
  await db.query('insert into auth.users(id) values($1),($2),($3)',[author,copier,foreign]);
  const catalog = (await db.query(`select n.nspname as schema,p.prosecdef,r.rolname as owner,p.proconfig
    from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace
    where p.oid in ('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure,
      'private.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) order by n.nspname`)).rows;
  equal(catalog[0].schema,'private'); equal(catalog[0].owner,'journey_rpc'); equal(catalog[0].prosecdef,true);
  equal(catalog[1].schema,'public'); equal(catalog[1].prosecdef,false);
  equal(catalog.every(p => p.proconfig.includes('search_path=""')),true);
  equal((await db.query(`select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname='journey_rpc'`)).rows[0],
    {rolcanlogin:false,rolsuper:false,rolbypassrls:false});
  equal((await db.query(`select count(*)::int as n from pg_auth_members where roleid='journey_rpc'::regrole`)).rows[0].n,0);
  for (const role of ['anon','authenticated']) {
    equal((await db.query(`select has_table_privilege($1,'private.selected_copy_requests','SELECT,INSERT,UPDATE,DELETE') as ok`,[role])).rows[0].ok,false);
  }
  await as(db,'anon');
  await reject(copy(jid(1),[sid(11)],jid(10)),'42501');
  await reject(db.query('select private.copy_journey_selected($1,$2::uuid[],$3)',[jid(1),[sid(11)],jid(10)]),'42501');
  await as(db,'authenticated');
  await reject(copy(jid(1),[sid(11)],jid(10)),'28000');

  await as(db,'authenticated',author);
  const source = input(1);
  source.updated_at = (await save({...source,status:'draft'})).updated_at;
  const cover = `${author}/${source.id}/cover/source.jpg`;
  const kept = `${author}/${source.id}/stop/kept.jpg`;
  const skipped = `${author}/${source.id}/stop/skipped.jpg`;
  for (const name of [cover,kept,skipped]) await db.query("insert into storage.objects(bucket_id,name) values('journey-media',$1)",[name]);
  source.cover_image_path=`journey-media/${cover}`;
  source.stops[0].photo_path=`journey-media/${kept}`;
  source.stops[1].photo_path=`journey-media/${skipped}`;
  source.updated_at=(await save(source)).updated_at;
  const sourceBefore=await row(source.id), stopsBefore=await stops(source.id);
  await save(input(2));

  await as(db,'authenticated',copier);
  equal(await copy(source.id,[sid(13),sid(11)],jid(10)),jid(10));
  const draft=await row(jid(10)), selected=await stops(jid(10));
  equal({user:draft.user_id,status:draft.status,demo:draft.is_demo,source:draft.copied_from_journey_id},
    {user:copier,status:'draft',demo:false,source:source.id});
  equal(selected.map(s=>[s.sequence,s.name,s.day_number]),[[1,'Stop 1',1],[2,'Stop 3',3]]);
  equal(selected.every(s=>!source.stops.some(old=>old.id===s.id)),true);
  equal(draft.cover_image_path,source.cover_image_path);
  equal(selected[0].photo_path,source.stops[0].photo_path);
  equal(selected[0].description,source.stops[0].description);
  equal(selected[0].mapbox_place_id,source.stops[0].mapbox_place_id);
  equal(Number(selected[0].rating),source.stops[0].rating);
  equal(await row(source.id),sourceBefore); equal(await stops(source.id),stopsBefore);
  await admin();
  equal((await db.query('select selected_stop_ids from private.selected_copy_requests where draft_id=$1',[jid(10)])).rows[0].selected_stop_ids,[sid(11),sid(13)]);
  equal((await db.query('select media_path from private.journey_media_authorizations where journey_id=$1 order by media_path',[jid(10)])).rows.map(r=>r.media_path).sort(),
    [source.cover_image_path,source.stops[0].photo_path].sort());
  await as(db,'authenticated',copier);
  equal((await db.query("select name from storage.objects where bucket_id='journey-media' and name=$1",[kept])).rows.length,1);
  equal((await db.query("select name from storage.objects where bucket_id='journey-media' and name=$1",[skipped])).rows.length,1); // Published source still grants read.
  const published={...draft,title:'Edited copy',status:'published',stops:selected};
  await save(published);
  const edited=await row(jid(10)), editedStops=await stops(jid(10));
  equal(await copy(source.id,[sid(11),sid(13)],jid(10)),jid(10));
  equal(await row(jid(10)),edited); equal(await stops(jid(10)),editedStops);
  equal(await copy(source.id,[sid(12)],jid(11)),jid(11));
  equal((await stops(jid(11))).map(s=>[s.sequence,s.name]),[[1,'Stop 2']]);

  // Every rejected request is atomic: no journey, stops, capability or receipt.
  const invalid = [
    [source.id,[],jid(20),'22023'], [source.id,null,jid(20),'22023'],
    [source.id,[null],jid(20),'22023'], [source.id,[sid(11),sid(11)],jid(20),'22023'],
    [source.id,[sid(21)],jid(20),'22023'], [source.id,[sid(99)],jid(20),'22023'],
    [source.id,[sid(11)],source.id,'22023'], [null,[sid(11)],jid(20),'22023'],
    [source.id,[sid(11)],null,'22023'], [source.id,Array.from({length:51},(_,i)=>sid(100+i)),jid(20),'22023'],
    [source.id,[sid(12)],jid(10),'22023'], [jid(2),[sid(21)],jid(10),'22023']
  ];
  for (const [src,ids,target,code] of invalid) {
    const before=await counts(); await as(db,'authenticated',copier);
    await reject(copy(src,ids,target),code); equal(await counts(),before);
  }
  await as(db,'authenticated',copier);
  await reject(db.query('select public.copy_journey_selected($1,ARRAY[[$2::uuid,$3::uuid]],$4)',[source.id,sid(11),sid(13),jid(20)]),'22023');
  for (const sql of [
    `select * from private.selected_copy_requests`,
    `insert into private.selected_copy_requests(draft_id,user_id,source_id,selected_stop_ids) values('${jid(30)}','${copier}','${source.id}',array['${sid(11)}'::uuid])`,
    `update private.selected_copy_requests set source_id='${jid(2)}'`,
    `delete from private.selected_copy_requests`,
    `insert into private.journey_media_authorizations values('${jid(10)}','forged')`,
    `insert into public.journeys(id,user_id,title) values('${jid(30)}','${copier}','Forged')`,
  ]) await reject(db.exec(sql),'42501');
  await as(db,'authenticated',foreign);
  await reject(copy(source.id,[sid(11),sid(13)],jid(10)),'22023');
  equal(await row(jid(11)),undefined); // Foreign private drafts remain invisible.
  await as(db,'authenticated',copier);
  await save({...input(30),status:'draft'});
  await reject(copy(source.id,[sid(11)],jid(30)),'22023');
  await admin(); equal((await db.query('select count(*)::int as n from private.selected_copy_requests where draft_id=$1',[jid(30)])).rows[0].n,0);

  // Private, demo, invalid-coordinate sources fail without rows or receipts.
  await as(db,'authenticated',author);
  await save({...input(3),status:'draft'}); await save(input(4)); await save(input(5));
  await admin();
  await db.query('update public.journeys set is_demo=true where id=$1',[jid(4)]);
  await db.query('update public.journey_stops set latitude=null,longitude=null where id=$1',[sid(51)]);
  for (const [src,ids,code] of [[jid(3),[sid(31)],'P0002'],[jid(4),[sid(41)],'P0002'],[jid(5),[sid(51)],'22023']]) {
    const before=await counts(); await as(db,'authenticated',copier);
    await reject(copy(src,ids,jid(40)),code); equal(await counts(),before);
  }
  await as(db,'authenticated',author);
  const ownPrivate=await row(jid(3));
  await reject(copy(jid(3),[sid(31)],jid(41)),'P0002');
  equal(await row(jid(3)),ownPrivate);

  // Deletion never releases a completed UUID, including after source deletion.
  await as(db,'authenticated',copier);
  await db.query('delete from public.journeys where id=$1',[jid(11)]);
  await reject(copy(source.id,[sid(12)],jid(11)),'P0002');
  equal(await row(jid(11)),undefined);
  await as(db,'authenticated',author);
  await db.query('delete from public.journeys where id=$1',[source.id]);
  await as(db,'authenticated',copier);
  equal((await row(jid(10))).copied_from_journey_id,null);
  await reject(copy(source.id,[sid(11),sid(13)],jid(10)),'P0002');
  // Kept immutable media remains readable via the copy after source deletion.
  equal((await db.query("select name from storage.objects where bucket_id='journey-media' and name=$1",[kept])).rows.length,1);
  equal((await db.query("select name from storage.objects where bucket_id='journey-media' and name=$1",[skipped])).rows.length,0);
  await admin();
  equal((await db.query('select count(*)::int as n from private.selected_copy_requests where user_id=$1',[copier])).rows[0].n,2);
  await db.query('delete from auth.users where id=$1',[copier]);
  equal((await db.query('select count(*)::int as n from private.selected_copy_requests where user_id=$1',[copier])).rows[0].n,0);
  console.log(`PASS selected-copy SQL runtime: ${assertions} assertions; full migration chain, auth/RLS/grants, subset/media/attribution, atomic rejection, replay and deletion. Multi-session concurrency and hosted parity remain unverified.`);
} finally { await db.close(); }
