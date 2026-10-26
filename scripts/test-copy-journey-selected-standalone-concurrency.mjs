// Opt-in synthetic-only PostgreSQL 17 test. Target is pinned to the approved
// portable cluster. No environment files, hosted DSNs, database resets or
// pre-existing/user-data deletion; this creates a NEW standalone database only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fixtureSql, migrationDirectory } from './lib/offline-db.mjs';

const mode=process.argv[2];
if(process.argv.length!==3 || !['--run-synthetic-fixtures','--inspect'].includes(mode)) {
  throw new Error('Usage: node scripts/test-copy-journey-selected-standalone-concurrency.mjs --run-synthetic-fixtures | --inspect');
}
const root='D:/Travel_Mvp/.local-tests/customize-stops-pg';
const database='journey_integrity_test_customize_stops_standalone';
const user='journey_test_admin';
const port='55439';
const psql=join(root,'pgsql/bin/psql.exe');
const identity=JSON.parse(await readFile(join(root,'cluster-identity.json'),'utf8'));
const environment=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG/i.test(k)));
const args=['--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align',
  '-h','127.0.0.1','-p',port,'-U',user,'-d',database,'-v','ON_ERROR_STOP=1'];
const sessions=new Set();
const evidence=[];
function session(name,target=database) {
  assert.ok([database,'postgres'].includes(target));
  const app=`journey_standalone_${name}`;
  const child=spawn(psql,args.map(arg=>arg===database?target:arg),{stdio:['pipe','pipe','pipe'],windowsHide:true,
    env:{...environment,PGAPPNAME:app,PGCONNECT_TIMEOUT:'3',PGPASSFILE:join(root,'no-password-file')}});
  sessions.add(child);
  let out='',err='';
  child.stdout.on('data',b=>{out+=b;}); child.stderr.on('data',b=>{err+=b;});
  const done=new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('exit',code=>{sessions.delete(child);resolve({code,out,err});});
  });
  done.catch(()=>{});
  child.stdin.on('error',()=>{});
  child.stdin.write("\\set VERBOSITY sqlstate\nset statement_timeout='20s';set lock_timeout='8s';\n");
  return {app,child,done,write:sql=>child.stdin.write(sql+'\n'),end:()=>child.stdin.end(),
    async marker(marker) {
      const deadline=Date.now()+12000;
      while(!out.includes(marker)) {
        if(child.exitCode!==null) throw new Error(`Session ${app} ended before ${marker}: ${err}`);
        if(Date.now()>deadline) throw new Error(`Timed out waiting for ${marker}`);
        await new Promise(r=>setTimeout(r,50));
      }
    }};
}
async function query(sql,target=database) {
  const s=session('control',target);s.write(sql);s.end();const r=await s.done;
  if(r.code!==0) throw new Error(`Local test SQL failed: ${r.err}`);
  return r.out.trim();
}
const json=async(sql,target=database)=>JSON.parse(await query(sql,target));
const bool=async sql=>assert.equal(await query(sql),'t');
async function waitFor(app,condition) {
  assert.match(app,/^journey_standalone_[a-z_]+$/);
  const deadline=Date.now()+10000;
  while(Date.now()<deadline) {
    if(await query(`select exists(select 1 from pg_stat_activity where application_name='${app}'
      and datname='${database}' and usename='${user}' and ${condition});`)==='t') return;
    await new Promise(r=>setTimeout(r,60));
  }
  throw new Error(`Expected activity did not appear for ${app}`);
}
async function fails(sql,code) {
  const s=session('expected_error');s.write(sql);s.end();const r=await s.done;
  assert.notEqual(r.code,0);assert.match(r.err,new RegExp(`\\b${code}\\b`));
}
const id=n=>`61000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const stop=n=>`62000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const author='63000000-0000-0000-0000-000000000001';
const copier='63000000-0000-0000-0000-000000000002';
const foreign='63000000-0000-0000-0000-000000000003';
const auth=uid=>`set role authenticated;set request.jwt.claim.sub='${uid}';`;
const sqlJson=p=>`'${JSON.stringify(p).replaceAll("'","''")}'::jsonb`;
const save=p=>`select public.save_journey(${sqlJson(p)});`;
const copy=(src,ids,target)=>`select public.copy_journey_selected('${src}',array[${ids.map(s=>`'${s}'::uuid`).join(',')}],'${target}');`;
const payload=n=>({id:id(n),title:'Standalone synthetic route',description:'Fixture only',
  destination_slug:'fixture-city',destination_name:'Fixture City',destination_latitude:10,destination_longitude:20,
  traveler_type:'solo',duration_days:3,status:'published',updated_at:null,cover_image_path:null,
  stops:[1,2,3].map(v=>({id:stop(n*10+v),sequence:v,name:`Synthetic stop ${v}`,description:`Note ${v}`,
    latitude:10+v/100,longitude:20+v/100,mapbox_place_id:`synthetic-${v}`,photo_path:null,rating:v,day_number:v}))});
const snapshot=src=>json(`select jsonb_build_object('journey',to_jsonb(j),'stops',
  (select jsonb_agg(to_jsonb(s) order by sequence) from public.journey_stops s where journey_id=j.id))
  from public.journeys j where id='${src}';`);
const absent=target=>bool(`select not exists(select 1 from public.journeys where id='${target}')
  and not exists(select 1 from private.standalone_selected_copy_receipts where draft_id='${target}')
  and not exists(select 1 from public.journey_stops where journey_id='${target}');`);
try {
  const server=await json(`select jsonb_build_object('version',current_setting('server_version_num')::int,
    'data',current_setting('data_directory'),'cluster',current_setting('cluster_name'),
    'user',session_user,'host',host(inet_server_addr()),'port',inet_server_port(),
    'systemIdentifier',(select system_identifier::text from pg_control_system()));`,'postgres');
  assert.ok(server.version>=170000&&server.version<180000);
  assert.equal(server.host,'127.0.0.1');assert.equal(server.port,55439);assert.equal(server.user,user);
  assert.equal(server.cluster,'journey_customize_stops_synthetic_only');assert.equal(server.systemIdentifier,identity.systemIdentifier);
  const expected=normalize(await realpath(join(root,'data'))).toLowerCase();
  assert.equal(normalize(await realpath(server.data)).toLowerCase(),expected);
  assert.equal(normalize(await realpath(identity.dataDirectory)).toLowerCase(),expected);
  evidence.push({check:'pinned existing synthetic cluster identity; new separate database',passed:true,server});
  if(mode==='--inspect') {
    console.log(JSON.stringify({server,database,readOnlyInspection:await json(`begin transaction read only;
      select jsonb_build_object('journeys',(select count(*) from public.journeys),
        'receipts',(select count(*) from private.standalone_selected_copy_receipts),
        'stops',(select count(*) from public.journey_stops));rollback;`)}));
  } else {
    // Roles are cluster-global. Preserve previous test roles/data, and never
    // adopt a colliding standalone execution role or occupied database.
    assert.equal(await query(`select not exists(select 1 from pg_database where datname='${database}')
      and not exists(select 1 from pg_roles where rolname='customize_stops_rpc')
      and (select count(*)=2 from pg_roles where rolname in ('anon','authenticated')
        and not rolcanlogin and not rolsuper and not rolbypassrls);`,'postgres'),'t');
    await query(`create database ${database};`,'postgres');
    await bool(`select not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname not like 'pg_%' and n.nspname<>'information_schema');`);
    const standaloneDir=new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url);
    const standaloneFiles=(await readdir(standaloneDir)).filter(n=>n.endsWith('.sql'));assert.equal(standaloneFiles.length,1);
    let setup=fixtureSql.replace('create role anon nologin; create role authenticated nologin;','');
    assert.ok(!/create role (anon|authenticated)/i.test(setup));
    for(const name of (await readdir(migrationDirectory)).filter(n=>n.endsWith('.sql')&&n<'20261005').sort()) {
      setup+='\n'+await readFile(new URL(name,migrationDirectory),'utf8');
    }
    setup+='\n'+await readFile(new URL(standaloneFiles[0],standaloneDir),'utf8');
    await query(setup+`\ninsert into auth.users values('${author}'),('${copier}'),('${foreign}');`);
    await query(auth(author)+save(payload(1))+save(payload(2)));
    await query(auth(author)+`update public.journeys set cover_image_path='journey-media/unverified/fixture.jpg' where id='${id(1)}';
      update public.journey_stops set photo_path='https://fixture.invalid/photo?synthetic=1' where journey_id='${id(1)}';`);
    const initial=await snapshot(id(1));
    await fails(`set role anon;${copy(id(1),[stop(11)],id(100))}`,'42501');
    const first=session('same_first');first.write(`begin;${auth(copier)}${copy(id(1),[stop(13),stop(11)],id(100))}\n\\echo COPIED`);
    await first.marker('COPIED');
    const second=session('same_second');second.write(auth(copier)+copy(id(1),[stop(11),stop(13)],id(100)));second.end();
    await waitFor(second.app,"wait_event_type='Lock' and wait_event='advisory'");
    first.write('commit;');first.end();assert.equal((await first.done).code,0);assert.equal((await second.done).code,0);
    await bool(`select (select count(*)=1 from public.journeys where id='${id(100)}')
      and (select count(*)=1 from private.standalone_selected_copy_receipts where draft_id='${id(100)}');`);
    const selected=await snapshot(id(100));assert.deepEqual(selected.stops.map(s=>s.name),['Synthetic stop 1','Synthetic stop 3']);
    assert.equal(selected.journey.cover_image_path,null);assert.ok(selected.stops.every(s=>s.photo_path===null));
    assert.equal(selected.journey.user_id,copier);assert.equal(selected.journey.copied_from_journey_id,id(1));
    assert.deepEqual(await snapshot(id(1)),initial);
    await fails(auth(copier)+copy(id(1),[stop(12)],id(100)),'22023');
    await fails(auth(foreign)+copy(id(1),[stop(11),stop(13)],id(100)),'22023');
    await query(auth(copier)+save({...selected.journey,title:'Edited standalone draft',stops:selected.stops}));
    const saved=await snapshot(id(100));assert.equal(saved.journey.destination_name,'Fixture City');
    await query(auth(copier)+copy(id(1),[stop(11),stop(13)],id(100)));assert.deepEqual(await snapshot(id(100)),saved);
    evidence.push({check:'same-key concurrent replay exactly1; subset/null-media/owner/attribution/source equality; changed/cross-account rejection; baseline custom-destination editor save and replay',passed:true});

    // Direct child writes do not lock the parent. One snapshot must never mix
    // two selected rows from an uncommitted multi-row source edit.
    const childWriter=session('direct_children');childWriter.write(`begin;${auth(author)}
      update public.journey_stops set name='New child one' where id='${stop(11)}';
      update public.journey_stops set name='New child three' where id='${stop(13)}';\n\\echo CHILDREN_CHANGED`);
    await childWriter.marker('CHILDREN_CHANGED');
    await query(auth(copier)+copy(id(1),[stop(11),stop(13)],id(101)));
    assert.deepEqual((await snapshot(id(101))).stops.map(s=>s.name),['Synthetic stop 1','Synthetic stop 3']);
    childWriter.write('commit;');childWriter.end();assert.equal((await childWriter.done).code,0);
    await query(auth(copier)+copy(id(1),[stop(11),stop(13)],id(102)));
    assert.deepEqual((await snapshot(id(102))).stops.map(s=>s.name),['New child one','New child three']);
    evidence.push({check:'unhardened direct multi-row child edits: before/after committed snapshots contain both old or both new stops',passed:true});

    // Direct UPDATE parent plus children: parent SHARE lock must wait for the
    // entire writer transaction, without assuming any save_journey lock.
    const writer=session('direct_parent');writer.write(`begin;${auth(author)}
      update public.journeys set title='Direct coherent parent' where id='${id(1)}';
      update public.journey_stops set name='Direct coherent child' where id='${stop(11)}';\n\\echo DIRECT_CHANGED`);
    await writer.marker('DIRECT_CHANGED');
    const waitingCopy=session('copy_after_direct');waitingCopy.write(auth(copier)+copy(id(1),[stop(11)],id(103)));waitingCopy.end();
    await waitFor(waitingCopy.app,"wait_event_type='Lock'");writer.write('commit;');writer.end();
    assert.equal((await writer.done).code,0);assert.equal((await waitingCopy.done).code,0);
    const coherent=await snapshot(id(103));assert.equal(coherent.journey.title,'Direct coherent parent');assert.equal(coherent.stops[0].name,'Direct coherent child');
    evidence.push({check:'direct parent+child update/copy waits and returns coherent committed metadata and stops',passed:true});

    // A parent SHARE lock must not turn direct child writes into a global lock.
    const openCopy=session('open_copy');openCopy.write(`begin;${auth(copier)}${copy(id(1),[stop(11)],id(104))}\n\\echo OPEN_COPY`);
    await openCopy.marker('OPEN_COPY');
    await query(auth(author)+`update public.journey_stops set description='Direct post-snapshot edit' where id='${stop(11)}';`);
    await bool(`select not exists(select 1 from public.journeys where id='${id(104)}');`); // Uncommitted copy is invisible.
    openCopy.write('commit;');openCopy.end();assert.equal((await openCopy.done).code,0);
    assert.notEqual((await snapshot(id(104))).stops[0].description,'Direct post-snapshot edit');
    evidence.push({check:'post-snapshot direct child edit remains allowed and cannot mutate captured copy; no table-wide lock',passed:true});

    const holder=session('timeout_holder');holder.write(`begin;${auth(copier)}${copy(id(1),[stop(11)],id(110))}\n\\echo KEY_HELD`);await holder.marker('KEY_HELD');
    const timeout=session('timeout');timeout.write(auth(copier)+copy(id(1),[stop(11)],id(110)));timeout.end();
    await waitFor(timeout.app,"wait_event_type='Lock' and wait_event='advisory'");
    const timed=await timeout.done;assert.notEqual(timed.code,0);assert.match(timed.err,/40001/);
    holder.write('rollback;');holder.end();assert.equal((await holder.done).code,0);await absent(id(110));
    const cancelled=session('cancel');cancelled.write(`begin;${auth(copier)}${copy(id(1),[stop(11)],id(111))}\n\\echo CANCEL_READY\nselect pg_sleep(30);commit;`);cancelled.end();
    await cancelled.marker('CANCEL_READY');await waitFor(cancelled.app,"wait_event='PgSleep'");
    const pid=Number(await query(`select pid from pg_stat_activity where application_name='${cancelled.app}' and datname='${database}' and usename='${user}' and wait_event='PgSleep';`));assert.ok(Number.isInteger(pid)&&pid>0);
    await bool(`select pg_cancel_backend(pid) from pg_stat_activity where pid=${pid} and application_name='${cancelled.app}' and datname='${database}' and usename='${user}';`);
    const cancelResult=await cancelled.done;assert.notEqual(cancelResult.code,0);assert.match(cancelResult.err,/57014/);await absent(id(111));
    evidence.push({check:'bounded advisory timeout40001 and known-session cancellation57014 leave no partial target/receipt/stops',passed:true});

    const publicCopy=session('unpublish_copy');publicCopy.write(`begin;${auth(copier)}${copy(id(1),[stop(11)],id(105))}\n\\echo PUBLISHED_LOCK`);await publicCopy.marker('PUBLISHED_LOCK');
    const unpublish=session('direct_unpublish');unpublish.write(auth(author)+`update public.journeys set status='draft',published_at=null where id='${id(1)}';`);unpublish.end();
    await waitFor(unpublish.app,"wait_event_type='Lock'");publicCopy.write('commit;');publicCopy.end();assert.equal((await publicCopy.done).code,0);assert.equal((await unpublish.done).code,0);
    await fails(auth(copier)+copy(id(1),[stop(11)],id(106)),'P0002');await absent(id(106));
    const deletingCopy=session('delete_copy');deletingCopy.write(`begin;${auth(copier)}${copy(id(2),[stop(21)],id(107))}\n\\echo DELETE_LOCK`);await deletingCopy.marker('DELETE_LOCK');
    const deletion=session('direct_delete');deletion.write(auth(author)+`delete from public.journeys where id='${id(2)}';`);deletion.end();
    await waitFor(deletion.app,"wait_event_type='Lock'");deletingCopy.write('commit;');deletingCopy.end();assert.equal((await deletingCopy.done).code,0);assert.equal((await deletion.done).code,0);
    assert.equal((await snapshot(id(107))).journey.copied_from_journey_id,null);
    await fails(auth(copier)+copy(id(2),[stop(21)],id(107)),'P0002');
    await query(auth(copier)+`delete from public.journeys where id='${id(102)}';`);
    await fails(auth(copier)+copy(id(1),[stop(11),stop(13)],id(102)),'P0002');
    evidence.push({check:'direct unpublish/delete serialize behind source lock; independent copy survives; deleted copy/source replay does not recreate',passed:true});
    await writeFile(join(root,'standalone-concurrency-results.json'),JSON.stringify({timestamp:new Date().toISOString(),database,evidence},null,2)+'\n');
    console.log(`PASS standalone real PostgreSQL: ${evidence.length} check groups; separate synthetic database retained, previous test database untouched.`);
  }
} finally {for(const child of sessions)child.kill();}
