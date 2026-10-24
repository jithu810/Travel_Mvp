// Opt-in synthetic-only PostgreSQL 17 test. Target is pinned to the approved
// portable cluster. No environment files, hosted DSNs, database resets or
// pre-existing/user-data deletion; deletion cases use newly created fixtures.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fixtureSql, migrationDirectory } from './lib/offline-db.mjs';

const mode=process.argv[2];
if(process.argv.length!==3 || !['--run-synthetic-fixtures','--inspect'].includes(mode)) {
  throw new Error('Usage: node scripts/test-copy-journey-selected-concurrency.mjs --run-synthetic-fixtures | --inspect');
}
const root='D:/Travel_Mvp/.local-tests/customize-stops-pg';
const database='journey_integrity_test_customize_stops';
const user='journey_test_admin';
const port='55439';
const psql=join(root,'pgsql/bin/psql.exe');
const identity=JSON.parse(await readFile(join(root,'cluster-identity.json'),'utf8'));
const environment=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG/i.test(k)));
const args=['--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align',
  '-h','127.0.0.1','-p',port,'-U',user,'-d',database,'-v','ON_ERROR_STOP=1'];
const sessions=new Set();
const evidence=[];
function session(name) {
  const app=`journey_selected_${name}`;
  const child=spawn(psql,args,{stdio:['pipe','pipe','pipe'],windowsHide:true,
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
async function query(sql) {
  const s=session('control');s.write(sql);s.end();const r=await s.done;
  if(r.code!==0) throw new Error(`Local test SQL failed: ${r.err}`);
  return r.out.trim();
}
const json=async sql=>JSON.parse(await query(sql));
const bool=async sql=>assert.equal(await query(sql),'t');
async function waitFor(app,condition) {
  assert.match(app,/^journey_selected_[a-z_]+$/);
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
const id=n=>`41000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const stop=n=>`42000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const author='43000000-0000-0000-0000-000000000001';
const copier='43000000-0000-0000-0000-000000000002';
const other='43000000-0000-0000-0000-000000000003';
const auth=uid=>`set role authenticated;set request.jwt.claim.sub='${uid}';`;
const sqlJson=p=>`'${JSON.stringify(p).replaceAll("'","''")}'::jsonb`;
const save=p=>`select public.save_journey(${sqlJson(p)});`;
const copy=(src,ids,target)=>`select public.copy_journey_selected('${src}',array[${ids.map(s=>`'${s}'::uuid`).join(',')}],'${target}');`;
const payload=n=>({id:id(n),title:'Synthetic route',description:'Fixture only',destination_slug:'varkala',
  traveler_type:'solo',duration_days:3,status:'published',updated_at:null,cover_image_path:null,
  stops:[1,2,3].map(v=>({id:stop(n*10+v),sequence:v,name:`Synthetic stop ${v}`,description:`Note ${v}`,
    latitude:8.7+v/100,longitude:76.7+v/100,mapbox_place_id:`synthetic-${v}`,photo_path:null,rating:v,day_number:v}))});
const snapshot=src=>json(`select jsonb_build_object('journey',to_jsonb(j),'stops',
  (select jsonb_agg(to_jsonb(s) order by sequence) from public.journey_stops s where journey_id=j.id))
  from public.journeys j where id='${src}';`);
const absent=target=>bool(`select not exists(select 1 from public.journeys where id='${target}')
  and not exists(select 1 from private.selected_copy_requests where draft_id='${target}')
  and not exists(select 1 from public.journey_stops where journey_id='${target}')
  and not exists(select 1 from private.journey_media_authorizations where journey_id='${target}');`);
try {
  // Identity checks occur before any fixture or migration writes. Never accept a
  // different cluster on the same port or a nonempty/shared database.
  const server=await json(`select jsonb_build_object('version',current_setting('server_version_num')::int,
    'data',current_setting('data_directory'),'cluster',current_setting('cluster_name'),
    'database',current_database(),'user',session_user,'host',host(inet_server_addr()),
    'port',inet_server_port(),'systemIdentifier',(select system_identifier::text from pg_control_system()));`);
  assert.ok(server.version>=170000 && server.version<180000);
  assert.equal(server.host,'127.0.0.1');assert.equal(server.port,55439);
  assert.equal(server.database,database);assert.equal(server.user,user);
  assert.equal(server.cluster,'journey_customize_stops_synthetic_only');
  assert.equal(server.systemIdentifier,identity.systemIdentifier);
  const expected=normalize(await realpath(join(root,'data'))).toLowerCase();
  assert.equal(normalize(await realpath(server.data)).toLowerCase(),expected);
  assert.equal(normalize(await realpath(identity.dataDirectory)).toLowerCase(),expected);
  evidence.push({check:'pinned isolated cluster identity',passed:true,server});
  if(mode==='--inspect') {
    console.log(JSON.stringify({server,readOnlyInspection:await json(`begin transaction read only;
      select jsonb_build_object('journeys',(select count(*) from public.journeys),
        'receipts',(select count(*) from private.selected_copy_requests),
        'stops',(select count(*) from public.journey_stops));rollback;`)}));
  } else {
    await bool(`select not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname not like 'pg_%' and n.nspname<>'information_schema')
      and not exists(select 1 from pg_roles where rolname in ('anon','authenticated','journey_rpc'))
      and not exists(select 1 from pg_stat_activity where datname='${database}' and pid<>pg_backend_pid());`);
    let setup=fixtureSql;
    for(const name of (await readdir(migrationDirectory)).filter(n=>n.endsWith('.sql')).sort()) {
      setup+='\n'+await readFile(new URL(name,migrationDirectory),'utf8');
    }
    await writeFile(join(root,'synthetic-setup.sql'),setup);
    await query(setup+`\ninsert into auth.users values('${author}'),('${copier}'),('${other}');`);
    let source=payload(1);
    await query(auth(author)+save({...source,status:'draft'}));
    source.updated_at=(await snapshot(source.id)).journey.updated_at;
    const media=`${author}/${source.id}/cover/synthetic.jpg`;
    source.cover_image_path=`journey-media/${media}`;source.stops[0].photo_path=source.cover_image_path;
    await query(auth(author)+`insert into storage.objects(bucket_id,name) values('journey-media','${media}');`+save(source));
    await query(auth(author)+save(payload(2)));
    const original=await snapshot(source.id);
    await fails(`set role anon;${copy(source.id,[stop(11)],id(100))}`,'42501');
    await fails(`set role authenticated;${copy(source.id,[stop(11)],id(100))}`,'28000');

    const first=session('same_first');
    first.write(`begin;${auth(copier)}${copy(source.id,[stop(13),stop(11)],id(100))}\n\\echo FIRST_COPIED`);
    await first.marker('FIRST_COPIED');
    const second=session('same_second');second.write(auth(copier)+copy(source.id,[stop(11),stop(13)],id(100)));second.end();
    await waitFor(second.app,"wait_event_type='Lock' and wait_event='advisory'");
    first.write('commit;');first.end();assert.equal((await first.done).code,0);
    assert.equal((await second.done).code,0);
    await bool(`select (select count(*)=1 from public.journeys where id='${id(100)}')
      and (select count(*)=1 from private.selected_copy_requests where draft_id='${id(100)}');`);
    const copied=await snapshot(id(100));
    assert.deepEqual(copied.stops.map(s=>[s.sequence,s.name]),[[1,'Synthetic stop 1'],[2,'Synthetic stop 3']]);
    assert.equal(copied.journey.user_id,copier);assert.equal(copied.journey.status,'draft');
    assert.equal(copied.journey.copied_from_journey_id,source.id);
    assert.equal(copied.journey.cover_image_path,source.cover_image_path);
    assert.equal(copied.stops[0].photo_path,source.cover_image_path);
    assert.ok(copied.stops.every(s=>!source.stops.some(old=>old.id===s.id)));
    assert.deepEqual(await snapshot(source.id),original);
    await bool(`select count(*)=1 from private.journey_media_authorizations where journey_id='${id(100)}';`);
    await fails(auth(copier)+copy(source.id,[stop(12)],id(100)),'22023');
    await fails(auth(other)+copy(source.id,[stop(11),stop(13)],id(100)),'22023');
    await fails(auth(copier)+`insert into private.selected_copy_requests values('${id(199)}','${copier}','${source.id}',array['${stop(11)}'::uuid],now());`,'42501');
    await query(auth(copier)+save({...copied.journey,title:'Edited synthetic copy',status:'published',stops:copied.stops}));
    const edited=await snapshot(id(100));
    await query(auth(copier)+copy(source.id,[stop(13),stop(11)],id(100)));
    assert.deepEqual(await snapshot(id(100)),edited);
    evidence.push({check:'simultaneous same key/reordered selection exactly one copy+receipt; auth/media/attribution/source immutability; mismatched and cross-account key; edited replay',passed:true});

    // Source-save transaction finishes before the waiting copy can snapshot.
    source={...(await snapshot(source.id)).journey,stops:(await snapshot(source.id)).stops};
    source.title='Edited source snapshot';source.stops[0].name='Edited stop snapshot';
    const saver=session('source_save');saver.write(`begin;${auth(author)}${save(source)}\n\\echo SOURCE_SAVED`);
    await saver.marker('SOURCE_SAVED');
    const afterSave=session('copy_after_save');afterSave.write(auth(copier)+copy(source.id,[stop(11),stop(13)],id(101)));afterSave.end();
    await waitFor(afterSave.app,"wait_event_type='Lock'");
    saver.write('commit;');saver.end();assert.equal((await saver.done).code,0);assert.equal((await afterSave.done).code,0);
    const coherent=await snapshot(id(101));assert.equal(coherent.journey.title,'Edited source snapshot');assert.equal(coherent.stops[0].name,'Edited stop snapshot');
    evidence.push({check:'concurrent source-save/copy waits and uses coherent new metadata and stops',passed:true});

    // A contending same-key timeout must not leave its transaction's rows.
    const lock=session('timeout_holder');lock.write(`begin;${auth(copier)}${copy(source.id,[stop(11)],id(103))}\n\\echo KEY_HELD`);
    await lock.marker('KEY_HELD');
    const waiter=session('timeout_waiter');waiter.write(auth(copier)+copy(source.id,[stop(11)],id(103)));waiter.end();
    await waitFor(waiter.app,"wait_event_type='Lock' and wait_event='advisory'");
    const timed=await waiter.done;assert.notEqual(timed.code,0);assert.match(timed.err,/40001/);
    lock.write('rollback;');lock.end();assert.equal((await lock.done).code,0);await absent(id(103));
    evidence.push({check:'bounded advisory-lock timeout reports 40001 and rollback leaves no copy/receipt/stops/media',passed:true});

    // Cancel only this known synthetic session after writes but before commit.
    const cancelled=session('cancel');cancelled.write(`begin;${auth(copier)}${copy(source.id,[stop(11)],id(104))}\n\\echo CANCEL_READY\nselect pg_sleep(30);commit;`);cancelled.end();
    await cancelled.marker('CANCEL_READY');await waitFor(cancelled.app,"wait_event='PgSleep'");
    const cancelPid=Number(await query(`select pid from pg_stat_activity where application_name='${cancelled.app}' and datname='${database}' and usename='${user}' and wait_event='PgSleep';`));
    assert.ok(Number.isInteger(cancelPid) && cancelPid>0);
    await bool(`select pg_cancel_backend(pid) from pg_stat_activity where pid=${cancelPid}
      and application_name='${cancelled.app}' and datname='${database}' and usename='${user}';`);
    const cancellation=await cancelled.done;assert.notEqual(cancellation.code,0);assert.match(cancellation.err,/57014/);await absent(id(104));
    evidence.push({check:'cancel known synthetic transaction after copy writes; 57014 and complete rollback',passed:true});

    // A source delete waits behind copy's source lock; copy survives the delete.
    const deletingSource=id(2);const copyBeforeDelete=session('copy_before_delete');
    copyBeforeDelete.write(`begin;${auth(copier)}${copy(deletingSource,[stop(21),stop(23)],id(102))}\n\\echo COPY_LOCKED`);
    await copyBeforeDelete.marker('COPY_LOCKED');
    const deleter=session('source_delete');deleter.write(auth(author)+`delete from public.journeys where id='${deletingSource}';`);deleter.end();
    await waitFor(deleter.app,"wait_event_type='Lock'");
    copyBeforeDelete.write('commit;');copyBeforeDelete.end();assert.equal((await copyBeforeDelete.done).code,0);assert.equal((await deleter.done).code,0);
    const survives=await snapshot(id(102));assert.equal(survives.journey.copied_from_journey_id,null);assert.equal(survives.stops.length,2);
    await fails(auth(copier)+copy(deletingSource,[stop(21),stop(23)],id(102)),'P0002');
    await query(auth(copier)+`delete from public.journeys where id='${id(101)}';`);
    await fails(auth(copier)+copy(source.id,[stop(11),stop(13)],id(101)),'P0002');
    await bool(`select not exists(select 1 from public.journeys where id='${id(101)}') and exists(select 1 from private.selected_copy_requests where draft_id='${id(101)}');`);
    evidence.push({check:'copy/source-delete lock race preserves independent copy; deleted source/copy replay cannot recreate',passed:true});
    await writeFile(join(root,'concurrency-results.json'),JSON.stringify({timestamp:new Date().toISOString(),evidence},null,2)+'\n');
    console.log(`PASS real PostgreSQL multi-session selected-copy: ${evidence.length} check groups. Synthetic database retained; server remains running on 127.0.0.1:55439.`);
  }
} finally { for(const child of sessions) child.kill(); }
