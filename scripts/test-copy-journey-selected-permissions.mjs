// Local-only permissions regression. Never accepts hosted DSNs or environment
// files. The real test uses its own approved cluster, database and installer.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile,writeFile,readdir,realpath } from 'node:fs/promises';
import { join,normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureSql,migrationDirectory } from './lib/offline-db.mjs';

const mode=process.argv[2];
if(process.argv.length!==3||!['--offline','--run-local-permissions','--verify-installed','--inspect'].includes(mode)) {
  throw new Error('Usage: node scripts/test-copy-journey-selected-permissions.mjs --offline | --run-local-permissions | --verify-installed | --inspect');
}
const originalDir=new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url);
const fixedDir=new URL('../supabase/standalone-customize-stops-fixed/supabase/migrations/',import.meta.url);
const oneSql=async dir=>{
  const names=(await readdir(dir)).filter(n=>n.endsWith('.sql'));assert.equal(names.length,1);
  return {path:fileURLToPath(new URL(names[0],dir)),sql:await readFile(new URL(names[0],dir),'utf8')};
};
const original=await oneSql(originalDir),fixed=await oneSql(fixedDir);
const grant='grant execute on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) to authenticated;\n';
const header='-- FULL REPLACEMENT: authenticated EXECUTE is granted while the migration role\n-- still owns the private function, before ownership/membership are transferred.\n-- Use this file instead of the failed standalone file, not as a follow-up patch.\n';
assert.equal(fixed.sql,header+original.sql.replace(grant,'').replace('grant customize_stops_rpc to current_user;',grant+'grant customize_stops_rpc to current_user;'));

if(mode==='--offline') {
  // Execute the existing 70-assertion suite unchanged except its migration URL,
  // using a data module so no original file or temporary source needs editing.
  let suite=await readFile(new URL('./test-copy-journey-selected-standalone.mjs',import.meta.url),'utf8');
  const oldImport="from './lib/offline-db.mjs'";
  assert.ok(suite.includes(oldImport));
  suite=suite.replace(oldImport,`from '${new URL('./lib/offline-db.mjs',import.meta.url).href}'`);
  const oldDirectory="new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url)";
  assert.ok(suite.includes(oldDirectory));suite=suite.replace(oldDirectory,`new URL('${fixedDir.href}')`);
  await import('data:text/javascript;base64,'+Buffer.from(suite).toString('base64'));
  console.log('PASS replacement exact-body/ACL-order equivalence and existing 70-assertion suite against the replacement SQL.');
} else {
  const root='D:/Travel_Mvp/.local-tests/customize-stops-pg/permissions-fix';
  const psql='D:/Travel_Mvp/.local-tests/customize-stops-pg/pgsql/bin/psql.exe';
  const database='journey_permissions_test';
  const installer='permissions_migrator';
  const clusterAdmin='permissions_cluster_admin';
  const identity=JSON.parse(await readFile(join(root,'cluster-identity.json'),'utf8'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG/i.test(key)));
  async function run(sql,db=database,user=installer) {
    assert.ok([database,'postgres'].includes(db));assert.ok([installer,clusterAdmin].includes(user));
    const args=['-X','-w','-q','-A','-t','--echo-errors','-h','127.0.0.1','-p','55440','-U',user,'-d',db,'-v','ON_ERROR_STOP=1'];
    const child=spawn(psql,args,{stdio:['pipe','pipe','pipe'],windowsHide:true,
      env:{...env,PGCONNECT_TIMEOUT:'3',PGPASSFILE:join(root,'no-password-file'),PGAPPNAME:'journey_permissions_regression'}});
    let out='',err='';child.stdout.on('data',b=>{out+=b;});child.stderr.on('data',b=>{err+=b;});child.stdin.on('error',()=>{});
    const result=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve({code,out:out.trim(),err}));});
    child.stdin.end("\\set VERBOSITY verbose\nset statement_timeout='30s';set lock_timeout='5s';\n"+sql+'\n');
    return result;
  }
  async function query(sql,db=database,user=installer) {
    const result=await run(sql,db,user);if(result.code!==0)throw new Error(result.err);return result.out;
  }
  const json=async(sql,db=database,user=installer)=>JSON.parse(await query(sql,db,user));
  const server=await json(`select jsonb_build_object('version',current_setting('server_version_num')::int,
    'data',current_setting('data_directory'),'cluster',current_setting('cluster_name'),'host',host(inet_server_addr()),
    'port',inet_server_port(),'systemIdentifier',(select system_identifier::text from pg_control_system()));`,'postgres',clusterAdmin);
  assert.ok(server.version>=170000&&server.version<180000);assert.equal(server.host,'127.0.0.1');assert.equal(server.port,55440);
  assert.equal(server.cluster,'journey_permissions_synthetic_only');assert.equal(server.systemIdentifier,identity.systemIdentifier);
  const expected=normalize(await realpath(join(root,'data'))).toLowerCase();
  assert.equal(normalize(await realpath(server.data)).toLowerCase(),expected);
  assert.equal(normalize(await realpath(identity.dataDirectory)).toLowerCase(),expected);
  const roleSql=`select jsonb_build_object('currentUser',current_user,'sessionUser',session_user,
    'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb)
    from pg_roles where rolname=current_user;`;
  const finalSql=`select jsonb_build_object('owner',(select r.rolname from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure),
    'memberships',(select count(*) from pg_auth_members where roleid='customize_stops_rpc'::regrole),
    'clientMembers',(select count(*) from pg_auth_members where roleid='customize_stops_rpc'::regrole
      and member in ('anon'::regrole,'authenticated'::regrole)),
    'installerCanSet',pg_has_role('${installer}','customize_stops_rpc','SET'),
    'installerInherits',pg_has_role('${installer}','customize_stops_rpc','USAGE'),
    'authExecute',has_function_privilege('authenticated','private.standalone_copy_journey_selected(uuid,uuid[],uuid)','EXECUTE'),
    'anonExecute',has_function_privilege('anon','private.standalone_copy_journey_selected(uuid,uuid[],uuid)','EXECUTE'),
    'clientReceiptAccess',has_table_privilege('authenticated','private.standalone_selected_copy_receipts','SELECT,INSERT,UPDATE,DELETE'),
    'rpcSchemaCreate',has_schema_privilege('customize_stops_rpc','private','CREATE'),
    'rpcStorageAccess',has_table_privilege('customize_stops_rpc','storage.objects','SELECT'));`;
  if(mode==='--inspect') {
    console.log(JSON.stringify({server,installer:await json(roleSql),final:await json(finalSql)}));
  } else {
    if(mode==='--run-local-permissions') {
      assert.equal(await query(`select not exists(select 1 from pg_database where datname='${database}')
      and not exists(select 1 from pg_roles where rolname in ('${installer}','customize_stops_rpc','anon','authenticated'));`,'postgres',clusterAdmin),'t');
    await query(`create role ${installer} login noinherit nosuperuser nobypassrls createrole createdb;
      create database ${database} owner ${installer};`,'postgres',clusterAdmin);
    assert.deepEqual(await json(roleSql),{currentUser:installer,sessionUser:installer,superuser:false,bypassRls:false,createRole:true,createDb:true});
    let setup=fixtureSql;
    for(const name of (await readdir(migrationDirectory)).filter(n=>n.endsWith('.sql')&&n<'20261005').sort()) {
      setup+='\n'+await readFile(new URL(name,migrationDirectory),'utf8');
    }
    await query(setup);
    const baselineSql=`select jsonb_build_object('policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
      'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by p.oid) from pg_proc p
        where p.oid in ('public.save_journey(jsonb)'::regprocedure,'public.copy_journey(uuid)'::regprocedure)));`;
    const baseline=await json(baselineSql);
    const failed=await run(original.sql);
    assert.notEqual(failed.code,0);assert.match(failed.err,/42501/);
    assert.match(failed.err,/permission denied for function standalone_copy_journey_selected/);
    assert.match(failed.err,/STATEMENT:\s*grant execute on function private\.standalone_copy_journey_selected\(uuid,uuid\[\],uuid\) to authenticated;/i);
    await writeFile(join(root,'original-failure.log'),failed.err);
    assert.equal(await query(`select not exists(select 1 from pg_roles where rolname='customize_stops_rpc')
      and to_regclass('private.standalone_selected_copy_receipts') is null
      and to_regprocedure('private.standalone_copy_journey_selected(uuid,uuid[],uuid)') is null
      and to_regprocedure('public.copy_journey_selected(uuid,uuid[],uuid)') is null;`),'t');
    assert.deepEqual(await json(baselineSql),baseline);
      await query(fixed.sql);
    } else {
      // Continue only the already-installed, empty synthetic fixture database;
      // do not replay the migration or modify previous test targets/roles.
      assert.deepEqual(await json(roleSql),{currentUser:installer,sessionUser:installer,superuser:false,bypassRls:false,createRole:true,createDb:true});
      assert.equal(await query(`select not exists(select 1 from auth.users) and not exists(select 1 from public.journeys);`),'t');
      const recordedFailure=await readFile(join(root,'original-failure.log'),'utf8');
      assert.match(recordedFailure,/42501/);
      assert.match(recordedFailure,/STATEMENT:\s*grant execute on function private\.standalone_copy_journey_selected\(uuid,uuid\[\],uuid\) to authenticated;/i);
    }
    const final=await json(finalSql);
    assert.deepEqual(final,{owner:'customize_stops_rpc',memberships:1,clientMembers:0,installerCanSet:false,installerInherits:false,authExecute:true,anonExecute:false,
      clientReceiptAccess:false,rpcSchemaCreate:false,rpcStorageAccess:false});
    const creatorMembership=await json(`select jsonb_build_object('member',m.member::regrole::text,'grantor',m.grantor::regrole::text,
      'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
      from pg_auth_members m where roleid='customize_stops_rpc'::regrole;`);
    assert.deepEqual(creatorMembership,{member:installer,grantor:clusterAdmin,admin:true,inherit:false,set:false});
    assert.equal(await query(`select not rolsuper and not rolbypassrls and not rolcanlogin and not rolcreaterole from pg_roles where rolname='customize_stops_rpc';`),'t');
    const author='71000000-0000-0000-0000-000000000001',copier='71000000-0000-0000-0000-000000000002';
    const source='72000000-0000-0000-0000-000000000001',target='72000000-0000-0000-0000-000000000002';
    const stop1='73000000-0000-0000-0000-000000000001',stop2='73000000-0000-0000-0000-000000000002';
    await query(`insert into auth.users values('${author}'),('${copier}');
      insert into public.journeys(id,user_id,title,status,published_at,destination_slug,destination_name,destination_latitude,destination_longitude,traveler_type,duration_days)
      values('${source}','${author}','Permission fixture','published',now(),'fixture-city','Fixture City',10,20,'solo',1);
      insert into public.journey_stops(id,journey_id,sequence,name,latitude,longitude,photo_path)
      values('${stop1}','${source}',0,'First',10,20,'unverified'),('${stop2}','${source}',1,'Second',11,21,'unverified');`);
    const auth=`set role authenticated;set request.jwt.claim.sub='${copier}';`;
    const copy=`select public.copy_journey_selected('${source}',array['${stop2}'::uuid,'${stop1}'::uuid],'${target}');`;
    assert.equal(await query(auth+copy,database,clusterAdmin),target);
    assert.equal(await query(auth+copy,database,clusterAdmin),target);
    assert.equal(await query(`select count(*)=1 from private.standalone_selected_copy_receipts where draft_id='${target}';`),'t');
    assert.equal(await query(`select j.user_id='${copier}' and j.status='draft' and j.copied_from_journey_id='${source}' and j.cover_image_path is null
      and (select array_agg(s.name order by sequence)=array['First','Second'] and bool_and(s.photo_path is null) from public.journey_stops s where journey_id=j.id)
      from public.journeys j where j.id='${target}';`),'t');
    const denied=await run(`set role anon;${copy}`,database,clusterAdmin);assert.notEqual(denied.code,0);assert.match(denied.err,/42501/);
    const receiptDenied=await run(auth+'select * from private.standalone_selected_copy_receipts;',database,clusterAdmin);assert.notEqual(receiptDenied.code,0);assert.match(receiptDenied.err,/42501/);
    const report={timestamp:new Date().toISOString(),server,installer:await json(roleSql),
      originalFailedSqlstate:'42501',originalFailedStatement:grant.trim(),rollbackVerified:true,replacementApplied:true,
      final,creatorMembership,authenticatedCopyAndReplay:true,anonAndReceiptDenied:true};
    await writeFile(join(root,'permissions-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log('PASS real PostgreSQL non-superuser CREATEROLE installer: original exact GRANT fails42501 and fully rolls back; full replacement applies; owner/membership/grant cleanup and authenticated copy/replay/denials pass.');
  }
}
