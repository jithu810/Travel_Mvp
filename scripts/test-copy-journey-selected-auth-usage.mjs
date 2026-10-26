// Local-only auth namespace regression. No hosted DSNs, environment files,
// global role changes, full migration reruns or edits to retained databases.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile,writeFile,realpath } from 'node:fs/promises';
import { join,normalize } from 'node:path';

const mode=process.argv[2];
if(process.argv.length!==3||!['--offline','--run-local-auth-usage','--inspect'].includes(mode)) {
  throw new Error('Usage: node scripts/test-copy-journey-selected-auth-usage.mjs --offline | --run-local-auth-usage | --inspect');
}
const patch=await readFile(new URL('../supabase/patches/customize_stops_auth_usage.sql',import.meta.url),'utf8');
assert.equal(patch.replace(/^--.*$/gm,'').trim(),'grant usage on schema auth to customize_stops_rpc;');
if(mode==='--offline') {
  let suite=await readFile(new URL('./test-copy-journey-selected-standalone.mjs',import.meta.url),'utf8');
  suite=suite.replace("from './lib/offline-db.mjs'",`from '${new URL('./lib/offline-db.mjs',import.meta.url).href}'`);
  suite=suite.replace("new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url)",
    `new URL('${new URL('../supabase/standalone-customize-stops-fixed/supabase/migrations/',import.meta.url).href}')`);
  const install='await db.exec(standaloneSql);';assert.ok(suite.includes(install));
  suite=suite.replace(install,`${install}
    const authUsageCounts=await counts();
    await db.exec('revoke usage on schema auth from customize_stops_rpc');
    assert.equal((await db.query("select has_function_privilege('customize_stops_rpc','auth.uid()','EXECUTE') as ok")).rows[0].ok,true);
    await as(db,'authenticated',copier);
    await assert.rejects(copy(id(1),[sid(11)],id(10)),e=>e.code==='42501'&&/permission denied for schema auth/.test(e.message));
    await admin();assert.deepEqual(await counts(),authUsageCounts);
    await db.exec(${JSON.stringify(patch)});
    assert.equal((await db.query("select has_schema_privilege('customize_stops_rpc','auth','USAGE') as ok")).rows[0].ok,true);
    console.log('PASS actual full RPC reproduces42501schemaauth with uidEXECUTE alreadytrue; exact USAGE-only patch restores namespace access without partial rows.');`);
  await import('data:text/javascript;base64,'+Buffer.from(suite).toString('base64'));
} else {
  const root='D:/Travel_Mvp/.local-tests/customize-stops-pg/permissions-fix';
  const psql='D:/Travel_Mvp/.local-tests/customize-stops-pg/pgsql/bin/psql.exe';
  const database='journey_auth_usage_test';
  const admin='permissions_cluster_admin',installer='permissions_migrator';
  const identity=JSON.parse(await readFile(join(root,'cluster-identity.json'),'utf8'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^PG/i.test(name)));
  async function run(sql,db=database,user=admin) {
    assert.ok([database,'postgres'].includes(db));assert.ok([admin,installer].includes(user));
    const child=spawn(psql,['-X','-w','-q','-A','-t','--echo-errors','-h','127.0.0.1','-p','55440','-U',user,'-d',db,'-v','ON_ERROR_STOP=1'],
      {stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...env,PGCONNECT_TIMEOUT:'3',PGPASSFILE:join(root,'no-password-file'),PGAPPNAME:'journey_auth_usage_regression'}});
    let out='',err='';child.stdout.on('data',b=>{out+=b;});child.stderr.on('data',b=>{err+=b;});child.stdin.on('error',()=>{});
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve({code,out:out.trim(),err}));});
    child.stdin.end("\\set VERBOSITY verbose\nset statement_timeout='20s';set lock_timeout='5s';\n"+sql+'\n');return done;
  }
  async function query(sql,db=database,user=admin) {
    const result=await run(sql,db,user);if(result.code!==0)throw new Error(result.err);return result.out;
  }
  const json=async(sql,db=database,user=admin)=>JSON.parse(await query(sql,db,user));
  const server=await json(`select jsonb_build_object('version',current_setting('server_version_num')::int,
    'data',current_setting('data_directory'),'cluster',current_setting('cluster_name'),'host',host(inet_server_addr()),
    'port',inet_server_port(),'systemIdentifier',(select system_identifier::text from pg_control_system()));`,'postgres');
  assert.ok(server.version>=170000&&server.version<180000);assert.equal(server.host,'127.0.0.1');assert.equal(server.port,55440);
  assert.equal(server.cluster,'journey_permissions_synthetic_only');assert.equal(server.systemIdentifier,identity.systemIdentifier);
  const expected=normalize(await realpath(join(root,'data'))).toLowerCase();assert.equal(normalize(await realpath(server.data)).toLowerCase(),expected);
  assert.equal(normalize(await realpath(identity.dataDirectory)).toLowerCase(),expected);
  const aclSql=`select jsonb_build_object('rpcUsage',has_schema_privilege('customize_stops_rpc','auth','USAGE'),
    'rpcCreate',has_schema_privilege('customize_stops_rpc','auth','CREATE'),
    'rpcUidExecute',has_function_privilege('customize_stops_rpc','auth.uid()','EXECUTE'),
    'rpcUsersSelect',has_table_privilege('customize_stops_rpc','auth.users','SELECT'),
    'installerUsage',has_schema_privilege('${installer}','auth','USAGE'),
    'installerGrantOption',has_schema_privilege('${installer}','auth','USAGE WITH GRANT OPTION'),
    'installerCanSetOwner',pg_has_role('${installer}','${admin}','SET'));`;
  if(mode==='--inspect') {
    console.log(JSON.stringify({server,acl:await json(aclSql),counts:await json(`begin transaction read only;
      select jsonb_build_object('drafts',(select count(*) from public.auth_usage_probe_drafts),
      'receipts',(select count(*) from private.auth_usage_probe_receipts));rollback;`)}));
  } else {
    assert.equal(await query(`select not exists(select 1 from pg_database where datname='${database}')
      and exists(select 1 from pg_roles where rolname='customize_stops_rpc' and not rolcanlogin and not rolsuper and not rolbypassrls)
      and exists(select 1 from pg_roles where rolname='${installer}' and not rolsuper and not rolbypassrls);`,'postgres'),'t');
    await query(`create database ${database} owner ${installer};`,'postgres');
    // Synthetic installed-state namespace/function probe, not a rerun of any
    // full migration. The actual complete RPC is exercised by --offline above.
    await query(`create schema auth authorization ${admin};create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to ${installer},anon,authenticated;
      create schema private authorization ${admin};grant usage on schema private to authenticated,customize_stops_rpc;
      create schema storage authorization ${admin};create table storage.objects(id uuid primary key);
      alter table storage.objects enable row level security;
      create policy auth_usage_fixture_storage on storage.objects for select to authenticated using(false);
      grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;
      create table public.auth_usage_probe_drafts(id uuid primary key,user_id uuid not null,source_id uuid not null);
      create table private.auth_usage_probe_receipts(draft_id uuid primary key,user_id uuid not null,source_id uuid not null);
      alter table public.auth_usage_probe_drafts enable row level security;
      alter table private.auth_usage_probe_receipts enable row level security;
      grant usage on schema public to customize_stops_rpc;
      grant select,insert on public.auth_usage_probe_drafts,private.auth_usage_probe_receipts to customize_stops_rpc;
      create policy draft_read on public.auth_usage_probe_drafts for select to customize_stops_rpc using(user_id=(select auth.uid()));
      create policy draft_insert on public.auth_usage_probe_drafts for insert to customize_stops_rpc with check(user_id=(select auth.uid()));
      create policy receipt_read on private.auth_usage_probe_receipts for select to customize_stops_rpc using(user_id=(select auth.uid()));
      create policy receipt_insert on private.auth_usage_probe_receipts for insert to customize_stops_rpc with check(user_id=(select auth.uid()));
      create function private.standalone_copy_journey_selected(source_id uuid,selected_stop_ids uuid[],draft_id uuid)
      returns uuid language plpgsql security definer set search_path='' as $$
      declare uid uuid:=(select auth.uid());begin
        if uid is null then raise exception 'Authentication required' using errcode='28000';end if;
        if exists(select 1 from private.auth_usage_probe_receipts r where r.draft_id=standalone_copy_journey_selected.draft_id and r.user_id=uid) then return draft_id;end if;
        insert into private.auth_usage_probe_receipts values(draft_id,uid,source_id);
        insert into public.auth_usage_probe_drafts values(draft_id,uid,source_id);return draft_id;end;$$;
      revoke all on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) from public,anon;
      grant execute on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) to authenticated;
      grant create on schema private to customize_stops_rpc;
      alter function private.standalone_copy_journey_selected(uuid,uuid[],uuid) owner to customize_stops_rpc;
      revoke create on schema private from customize_stops_rpc;
      create function public.copy_journey_selected(source_id uuid,selected_stop_ids uuid[],draft_id uuid)
      returns uuid language sql security invoker set search_path='' as $$select private.standalone_copy_journey_selected(source_id,selected_stop_ids,draft_id);$$;
      revoke all on function public.copy_journey_selected(uuid,uuid[],uuid) from public,anon;
      grant execute on function public.copy_journey_selected(uuid,uuid[],uuid) to authenticated;`);
    const beforeAcl=await json(aclSql);
    assert.deepEqual(beforeAcl,{rpcUsage:false,rpcCreate:false,rpcUidExecute:true,rpcUsersSelect:false,installerUsage:true,installerGrantOption:false,installerCanSetOwner:false});
    const skipped=await run(patch,database,installer);assert.equal(skipped.code,0);assert.match(skipped.err,/no privileges were granted for "auth"/i);
    assert.equal((await json(aclSql)).rpcUsage,false);
    await writeFile(join(root,'auth-usage-skipped-grant.log'),skipped.err);
    const uid='81000000-0000-0000-0000-000000000001',source='82000000-0000-0000-0000-000000000001',draft='82000000-0000-0000-0000-000000000002';
    const call=`set role authenticated;set request.jwt.claim.sub='${uid}';select public.copy_journey_selected('${source}',array['83000000-0000-0000-0000-000000000001'::uuid],'${draft}');`;
    const failed=await run(call);assert.notEqual(failed.code,0);assert.match(failed.err,/42501/);assert.match(failed.err,/permission denied for schema auth/);
    assert.equal(await query('select not exists(select 1 from public.auth_usage_probe_drafts) and not exists(select 1 from private.auth_usage_probe_receipts);'),'t');
    await writeFile(join(root,'auth-usage-runtime-failure.log'),failed.err);
    const catalogSql=`select jsonb_build_object('functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by p.oid) from pg_proc p
      where p.oid in ('auth.uid()'::regprocedure,'public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure,'private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure)),
      'storagePolicies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='storage'),
      'storageAcl',(select relacl::text from pg_class where oid='storage.objects'::regclass),
      'receiptAcl',(select relacl::text from pg_class where oid='private.auth_usage_probe_receipts'::regclass),
      'usersAcl',(select relacl::text from pg_class where oid='auth.users'::regclass));`;
    const catalog=await json(catalogSql);
    await query(patch); // Namespace owner is the authorized grantor in this model.
    assert.deepEqual(await json(aclSql),{...beforeAcl,rpcUsage:true});
    assert.deepEqual(await json(catalogSql),catalog);
    assert.equal(await query(call),draft);assert.equal(await query(call),draft);
    assert.equal(await query('select (select count(*)=1 from public.auth_usage_probe_drafts) and (select count(*)=1 from private.auth_usage_probe_receipts);'),'t');
    const anon=await run(`set role anon;select public.copy_journey_selected('${source}',array['83000000-0000-0000-0000-000000000001'::uuid],'${draft}');`);assert.notEqual(anon.code,0);assert.match(anon.err,/42501/);
    const receipt=await run("set role authenticated;select * from private.auth_usage_probe_receipts;");assert.notEqual(receipt.code,0);assert.match(receipt.err,/42501/);
    await writeFile(join(root,'auth-usage-results.json'),JSON.stringify({timestamp:new Date().toISOString(),server,database,beforeAcl,afterAcl:await json(aclSql),
      unprivilegedGrantSkipped:true,runtimeSqlstate:'42501',runtimeError:'permission denied for schema auth',authorizedOwnerPatchPassed:true,
      noPartialRows:true,sameUuidRetryAndReplay:true,unchangedFunctionStorageReceiptUsersAcl:true,anonymousAndReceiptDenied:true},null,2)+'\n');
    console.log('PASS real PostgreSQL managed-schema model: installer GRANT warns/skips, uidEXECUTE alreadytrue, runtime42501schemaauth beforewrites; authorized-owner USAGE-only patch fixes retry/replay with no extra ACL/policy changes.');
  }
}
