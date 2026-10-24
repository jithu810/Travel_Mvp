// Standalone alternative only: core migrations through October 4, synthetic DB.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { offlineDb, migrations, as } from './lib/offline-db.mjs';

export const standaloneDirectory=new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url);
const files=(await readdir(standaloneDirectory)).filter(n=>n.endsWith('.sql'));
assert.equal(files.length,1);
export const standaloneSql=await readFile(new URL(files[0],standaloneDirectory),'utf8');
const author='51000000-0000-0000-0000-000000000001';
const copier='51000000-0000-0000-0000-000000000002';
const foreign='51000000-0000-0000-0000-000000000003';
const id=n=>`52000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const sid=n=>`53000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const input=n=>({id:id(n),title:'Standalone synthetic route',description:'Source metadata',
  destination_slug:'fixture-city',destination_name:'Fixture City',destination_latitude:10,destination_longitude:20,
  traveler_type:'solo',duration_days:3,status:'published',updated_at:null,cover_image_path:null,
  stops:[1,2,3].map(v=>({id:sid(n*10+v),sequence:v,name:`Stop ${v}`,description:`Memory ${v}`,
    latitude:10+v/100,longitude:20+v/100,mapbox_place_id:`fixture-${v}`,rating:v,day_number:v,photo_path:null}))});
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const reject=async(p,code)=>{await assert.rejects(p,e=>e.code===code);checks++;};
const db=await offlineDb();
const save=async p=>(await db.query('select public.save_journey($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
const copy=async(src,ids,target)=>(await db.query('select public.copy_journey_selected($1,$2::uuid[],$3) as id',[src,ids,target])).rows[0].id;
const row=async target=>(await db.query('select to_jsonb(j) as value from public.journeys j where id=$1',[target])).rows[0]?.value;
const stops=async target=>(await db.query('select * from public.journey_stops where journey_id=$1 order by sequence',[target])).rows;
const detail=async target=>(await db.query('select public.get_journey_detail($1) as value',[target])).rows[0]?.value;
const admin=()=>db.exec('reset role');
const counts=async()=>{await admin();return(await db.query(`select
  (select count(*)::int from public.journeys) as journeys,
  (select count(*)::int from public.journey_stops) as stops,
  (select count(*)::int from private.standalone_selected_copy_receipts) as receipts`)).rows[0];};
const originalCatalog=async()=>(await db.query(`select jsonb_build_object(
  'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by p.oid) from pg_proc p
    where p.oid in ('public.save_journey(jsonb)'::regprocedure,'public.copy_journey(uuid)'::regprocedure)),
  'storage',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='storage'),
  'clientJourneyWrite',has_table_privilege('authenticated','public.journeys','INSERT,UPDATE'),
  'clientStopWrite',has_table_privilege('authenticated','public.journey_stops','INSERT,UPDATE,DELETE')) as value`)).rows[0].value;
try {
  await migrations(db,n=>n<'20261005');
  const catalog=await originalCatalog();
  await db.exec(standaloneSql);
  eq(await originalCatalog(),catalog);
  eq((await db.query(`select rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolbypassrls from pg_roles where rolname='customize_stops_rpc'`)).rows[0],
    {rolcanlogin:false,rolsuper:false,rolinherit:false,rolcreaterole:false,rolbypassrls:false});
  eq((await db.query(`select count(*)::int as n from pg_auth_members where roleid='customize_stops_rpc'::regrole`)).rows[0].n,0);
  eq((await db.query(`select has_table_privilege('customize_stops_rpc','storage.objects','SELECT') as objects,
    has_schema_privilege('customize_stops_rpc','storage','USAGE') as schema`)).rows[0],{objects:false,schema:false});
  eq((await db.query(`select to_regclass('private.journey_media_authorizations') is null as absent`)).rows[0].absent,true);
  for(const role of ['anon','authenticated']) eq((await db.query(`select has_table_privilege($1,
    'private.standalone_selected_copy_receipts','SELECT,INSERT,UPDATE,DELETE') as access`,[role])).rows[0].access,false);
  eq((await db.query(`select r.rolname as owner,p.prosecdef,p.proconfig from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure`)).rows[0],
    {owner:'customize_stops_rpc',prosecdef:true,proconfig:['search_path=""','lock_timeout=5s']});
  await db.query('insert into auth.users values($1),($2),($3)',[author,copier,foreign]);
  await as(db,'anon');await reject(copy(id(1),[sid(11)],id(10)),'42501');
  await reject(db.query('select private.standalone_copy_journey_selected($1,$2::uuid[],$3)',[id(1),[sid(11)],id(10)]),'42501');
  await as(db,'authenticated');await reject(copy(id(1),[sid(11)],id(10)),'28000');
  await as(db,'authenticated',author);await save(input(1));await save(input(2));
  // Simulate untrusted historical paths and zero-based stops. No classification
  // or Storage query is needed because every inherited media field is omitted.
  await db.query("update public.journeys set cover_image_path='https://fixture.invalid/object/sign/photo?token=synthetic' where id=$1",[id(1)]);
  await db.query("update public.journey_stops set sequence=sequence+10,photo_path='journey-media/unknown/private.jpg' where journey_id=$1",[id(1)]);
  await db.query('update public.journey_stops set sequence=sequence-11 where journey_id=$1',[id(1)]);
  const before=await row(id(1)), beforeStops=await stops(id(1));
  await as(db,'authenticated',copier);
  eq(await copy(id(1),[sid(13),sid(11)],id(10)),id(10));
  const draft=await row(id(10)), selected=await stops(id(10));
  eq([draft.user_id,draft.status,draft.is_demo,draft.copied_from_journey_id],[copier,'draft',false,id(1)]);
  eq([draft.destination_slug,draft.destination_name,draft.destination_latitude,draft.destination_longitude],['fixture-city','Fixture City',10,20]);
  eq(draft.cover_image_path,null);eq(selected.map(s=>s.photo_path),[null,null]);
  eq(selected.map(s=>[s.sequence,s.name,s.day_number]),[[1,'Stop 1',1],[2,'Stop 3',3]]);
  eq(selected.every(s=>!input(1).stops.some(old=>old.id===s.id)),true);
  eq(await row(id(1)),before);eq(await stops(id(1)),beforeStops);
  const loaded=await detail(id(10));
  eq([loaded.id,loaded.creator_id,loaded.status,loaded.is_demo,loaded.copied_from_journey_id],
    [id(10),copier,'draft',false,id(1)]);
  eq(loaded.stops.length,2);eq(loaded.cover_image_path,null);
  // Baseline editor save accepts retained attribution and custom destination.
  await save({...draft,title:'Edited standalone draft',stops:selected});
  let edited=await row(id(10));
  eq(edited.title,'Edited standalone draft');eq(edited.destination_name,'Fixture City');
  await save({...edited,status:'published',stops:await stops(id(10))});
  edited=await row(id(10));const editedStops=await stops(id(10));
  eq(await copy(id(1),[sid(11),sid(13)],id(10)),id(10));
  eq(await row(id(10)),edited);eq(await stops(id(10)),editedStops);
  eq(await copy(id(1),[sid(12)],id(11)),id(11));eq((await stops(id(11))).map(s=>s.sequence),[1]);

  for(const [src,ids,target] of [[id(1),[],id(20)],[id(1),null,id(20)],[id(1),[null],id(20)],
    [id(1),[sid(11),sid(11)],id(20)],[id(1),[sid(21)],id(20)],
    [id(1),[sid(11)],id(1)],[null,[sid(11)],id(20)],[id(1),[sid(11)],null],
    [id(1),Array.from({length:51},(_,i)=>sid(100+i)),id(20)],
    [id(1),[sid(12)],id(10)],[id(2),[sid(21)],id(10)]]) {
    const baseline=await counts();await as(db,'authenticated',copier);
    await reject(copy(src,ids,target),'22023');eq(await counts(),baseline);
  }
  await as(db,'authenticated',copier);
  await reject(db.query('select public.copy_journey_selected($1,ARRAY[[$2::uuid,$3::uuid]],$4)',[id(1),sid(11),sid(13),id(20)]),'22023');
  await reject(db.exec('select * from private.standalone_selected_copy_receipts'),'42501');
  await reject(db.query('insert into private.standalone_selected_copy_receipts(draft_id,user_id,source_id,selected_stop_ids) values($1,$2,$3,$4::uuid[])',[id(20),copier,id(1),[sid(11)]]),'42501');
  await as(db,'authenticated',foreign);await reject(copy(id(1),[sid(11),sid(13)],id(10)),'22023');
  await as(db,'authenticated',author);
  await save({...input(3),status:'draft'});await save(input(4));await save(input(5));await save(input(6));
  await db.query('update public.journeys set is_demo=true where id=$1',[id(4)]);
  await db.query('update public.journey_stops set latitude=null,longitude=null where id=$1',[sid(51)]);
  await db.query('update public.journey_stops set day_number=4 where id=$1',[sid(61)]);
  for(const [src,ids,code] of [[id(3),[sid(31)],'P0002'],[id(4),[sid(41)],'P0002'],
    [id(5),[sid(51)],'22023'],[id(6),[sid(61)],'22023']]) {
    const baseline=await counts();await as(db,'authenticated',copier);
    await reject(copy(src,ids,id(30)),code);eq(await counts(),baseline);
  }
  await as(db,'authenticated',copier);
  await save({...input(40),status:'draft'});
  await reject(copy(id(1),[sid(11)],id(40)),'22023');
  await db.query('delete from public.journeys where id=$1',[id(11)]);
  await reject(copy(id(1),[sid(12)],id(11)),'P0002');
  // Baseline profile deletion/recreation must not erase the auth-user tombstone.
  await db.query('delete from public.profiles where id=$1',[copier]);
  await db.query('insert into public.profiles(id) values($1)',[copier]);
  await reject(copy(id(1),[sid(11),sid(13)],id(10)),'P0002');
  await admin();eq((await db.query('select count(*)::int as n from private.standalone_selected_copy_receipts where user_id=$1',[copier])).rows[0].n,2);
  await db.query('delete from auth.users where id=$1',[copier]);
  eq((await db.query('select count(*)::int as n from private.standalone_selected_copy_receipts where user_id=$1',[copier])).rows[0].n,0);
  eq(await originalCatalog(),catalog);
  console.log(`PASS standalone selected-copy: ${checks} assertions; October-4 baseline, no Storage grants/media/legacy classification, original RPC/policy preservation, independent validation, draft hydration/editor save, idempotency and atomic rejection.`);
} finally {await db.close();}

// Never stack the standalone alternative onto the original hardened proposal.
const incompatible=await offlineDb();
try {
  await migrations(incompatible);
  await assert.rejects(incompatible.exec(standaloneSql),e=>/choose one reviewed alternative/.test(e.message));
  await incompatible.exec('rollback');
  eq((await incompatible.query("select count(*)::int as n from pg_roles where rolname='customize_stops_rpc'")).rows[0].n,0);
  console.log('PASS standalone alternative rejects existing hardened/selected objects without role or receipt changes.');
} finally {await incompatible.close();}
