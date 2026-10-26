// Opt-in REAL PostgreSQL test. Never reads .env or accepts a hosted DSN.
// Requires psql and an empty disposable database on a dedicated local cluster.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fixtureSql, migrationDirectory } from './lib/offline-db.mjs';

const [database, port] = process.argv.slice(2);
if (!/^journey_integrity_test_[a-z0-9_]+$/.test(database ?? '') || !/^\d+$/.test(port ?? '')
  || Number(port) < 1024 || Number(port) > 65535 || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/test-integrity-concurrency.mjs journey_integrity_test_NAME LOCAL_PORT');
}
const args = ['--no-psqlrc','--no-password','-h','127.0.0.1','-p',port,'-d',database,
  '-v','ON_ERROR_STOP=1','-A','-t'];
const sessions = new Set();
function session(name) {
  const child = spawn('psql',args,{ stdio:['pipe','pipe','pipe'],env:{ ...process.env,PGAPPNAME:name,PGCONNECT_TIMEOUT:'3' } });
  sessions.add(child);
  let out='', err='';
  child.stdout.on('data', b=>{ out+=b; }); child.stderr.on('data', b=>{ err+=b; });
  const done=new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('exit',code=>{ sessions.delete(child); resolve({ code,out,err }); });
  });
  // Avoid an unhandled rejection while waiting for a startup marker.
  done.catch(()=>{});
  child.stdin.write("\\set VERBOSITY sqlstate\nset statement_timeout='10s'; set lock_timeout='8s';\n");
  return { child,done,write:sql=>child.stdin.write(sql+'\n'),end:()=>child.stdin.end(),
    async marker(marker) {
      const deadline=Date.now()+10000;
      while(!out.includes(marker)) {
        if(child.exitCode!==null) throw new Error(`Local psql ended before ${marker}: ${err}`);
        if(Date.now()>deadline) throw new Error(`Timed out waiting for ${marker}`);
        await new Promise(resolve=>setTimeout(resolve,30));
      }
    } };
}
async function query(sql) {
  const s=session('journey_integrity_control'); s.write(sql); s.end();
  const result=await s.done;
  if(result.code!==0) throw new Error(`Local test SQL failed: ${result.err}`);
  return result.out;
}
async function blocked(name) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline) {
    if((await query(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event_type='Lock');`)).includes('t')) return;
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  throw new Error('Second session did not block on the parent lock');
}
const owner='10000000-0000-0000-0000-000000000001';
const other='10000000-0000-0000-0000-000000000002';
const id='20000000-0000-0000-0000-000000000001';
const payload={ id,title:'Concurrent route',description:'',destination_slug:'varkala',traveler_type:'solo',
  duration_days:1,status:'published',updated_at:null,cover_image_path:null,
  stops:[{ id:'30000000-0000-0000-0000-000000000001',sequence:1,name:'Cliff',latitude:8.7,longitude:76.7 }] };
const identity=user=>`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`;
const save=p=>`select public.save_journey('${JSON.stringify(p).replaceAll("'","''")}'::jsonb);`;
try {
  // Fail before setup unless this database is empty. Existing roles also cause
  // setup to fail: use a dedicated test cluster rather than a shared dev backend.
  const empty=await query(`select case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not like 'pg_%' and n.nspname<>'information_schema')
    then 'NOT_EMPTY' else 'EMPTY_DATABASE' end;`);
  assert.ok(empty.includes('EMPTY_DATABASE') && !empty.includes('NOT_EMPTY'));
  let setup=fixtureSql;
  for(const name of (await readdir(migrationDirectory)).filter(n=>n.endsWith('.sql')).sort()) setup+='\n'+await readFile(new URL(name,migrationDirectory),'utf8');
  await query(setup+`\ninsert into auth.users(id) values('${owner}'),('${other}');\n`+identity(owner)+'\n'+save(payload));
  const versionOutput=await query(`select updated_at::text from public.journeys where id='${id}';`);
  payload.updated_at=versionOutput.split(/\r?\n/).find(line=>/^\d{4}-/.test(line));
  assert.ok(payload.updated_at);

  const first=session('journey_integrity_first');
  first.write('begin;\n'+identity(owner)+'\n'+save(payload)+'\n\\echo FIRST_LOCKED');
  await first.marker('FIRST_LOCKED');
  const second=session('journey_integrity_second'); second.write(identity(owner)+'\n'+save(payload)); second.end();
  await blocked('journey_integrity_second');
  first.write('commit;'); first.end(); assert.equal((await first.done).code,0);
  const loser=await second.done; assert.notEqual(loser.code,0); assert.match(loser.err,/40001/);

  // Copy holds a source share lock: source deletion waits, then only lineage is
  // cleared. The independent target survives with a consistent complete snapshot.
  const copier=session('journey_integrity_copy');
  copier.write(`begin;\n${identity(other)}\nselect public.copy_journey('${id}');\n\\echo COPY_LOCKED`);
  await copier.marker('COPY_LOCKED');
  const deleter=session('journey_integrity_delete');
  deleter.write(`${identity(owner)}\ndelete from public.journeys where id='${id}';`); deleter.end();
  await blocked('journey_integrity_delete');
  copier.write('commit;'); copier.end(); assert.equal((await copier.done).code,0);
  assert.equal((await deleter.done).code,0);
  assert.ok((await query(`select count(*)=1 and bool_and(copied_from_journey_id is null) from public.journeys where user_id='${other}';`)).includes('t'));
  assert.ok((await query('select count(*)=1 from public.journey_stops;')).includes('t'));
  console.log('PASS: real two-session stale save and copy/delete lock races. Disposable database retained for inspection.');
} finally {
  for(const child of sessions) child.kill();
}
