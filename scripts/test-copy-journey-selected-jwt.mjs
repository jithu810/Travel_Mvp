// LOCAL ONLY. Fixed loopback target; no DSNs, env files, hosted access or old DB writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';
import {join,normalize} from 'node:path';
import {fixtureSql,migrationDirectory} from './lib/offline-db.mjs';
const mode=process.argv[2];
assert.ok(process.argv.length===3&&['--offline','--run-local','--resume-local','--verify-installed','--inspect'].includes(mode),
  'Usage: node scripts/test-copy-journey-selected-jwt.mjs --offline | --run-local | --resume-local | --verify-installed | --inspect');
const directory=new URL('../supabase/customize-stops-jwt-correction/supabase/migrations/',import.meta.url);
const names=(await readdir(directory)).filter(n=>n.endsWith('.sql'));assert.equal(names.length,1);
const correction=await readFile(new URL(names[0],directory),'utf8');
const liveDefinitions={
  "auth.uid()": "CREATE OR REPLACE FUNCTION auth.uid()\n RETURNS uuid\n LANGUAGE sql\n STABLE\nAS $function$\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n$function$\n",
  "private.standalone_copy_journey_selected(uuid,uuid[],uuid)": "CREATE OR REPLACE FUNCTION private.standalone_copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\n SET lock_timeout TO '5s'\nAS $function$\r\ndeclare\r\n  uid uuid := (select auth.uid());\r\n  ids uuid[];\r\n  receipt private.standalone_selected_copy_receipts%rowtype;\r\n  source jsonb;\r\n  stop_row jsonb;\r\n  days integer;\r\nbegin\r\n  if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;\r\n  if source_id is null or draft_id is null or source_id=draft_id or selected_stop_ids is null\r\n    or cardinality(selected_stop_ids) not between 1 and 50 or array_ndims(selected_stop_ids)<>1 then\r\n    raise exception 'Invalid selected stops' using errcode='22023';\r\n  end if;\r\n  if array_position(selected_stop_ids,null) is not null\r\n    or (select count(distinct id) from unnest(selected_stop_ids) id)<>cardinality(selected_stop_ids) then\r\n    raise exception 'Invalid selected stops' using errcode='22023';\r\n  end if;\r\n  select array_agg(id order by id) into ids from unnest(selected_stop_ids) id;\r\n  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('standalone-selected-copy:' || draft_id::text,0));\r\n  select r.* into receipt from private.standalone_selected_copy_receipts r\r\n    where r.draft_id=standalone_copy_journey_selected.draft_id;\r\n  if found then\r\n    if receipt.user_id<>uid or receipt.source_id<>source_id or receipt.selected_stop_ids<>ids then\r\n      raise exception 'Copy request does not match its original selection' using errcode='22023';\r\n    end if;\r\n    if not exists(select 1 from public.journeys j where j.id=draft_id and j.user_id=uid\r\n      and j.copied_from_journey_id=source_id) then\r\n      raise exception 'Previous copy is no longer available; check your journeys' using errcode='P0002';\r\n    end if;\r\n    return draft_id;\r\n  end if;\r\n\r\n  -- Lock parent metadata/publication/deletion, then read parent + requested\r\n  -- children in ONE statement snapshot. Baseline direct child writes need not\r\n  -- lock the parent: concurrent changes after this snapshot cannot alter JSON.\r\n  -- No table-wide lock or dependency on hardened save_journey is introduced.\r\n  perform 1 from public.journeys j where j.id=source_id and j.status='published' and not j.is_demo for share;\r\n  if not found then raise exception 'Published journey not found' using errcode='P0002'; end if;\r\n  select to_jsonb(j) || jsonb_build_object('stops',coalesce((\r\n    select jsonb_agg(to_jsonb(s) order by s.sequence,s.id) from public.journey_stops s\r\n    where s.journey_id=j.id and s.id=any(ids)), '[]'::jsonb)) into source\r\n  from public.journeys j where j.id=source_id and j.status='published' and not j.is_demo;\r\n  if not found then raise exception 'Published journey not found' using errcode='P0002'; end if;\r\n  if jsonb_array_length(source->'stops')<>cardinality(ids) then\r\n    raise exception 'Selection contains unavailable stops' using errcode='22023';\r\n  end if;\r\n  days := (source->>'duration_days')::integer;\r\n  if coalesce(length(trim(source->>'title')),0) not between 1 and 200\r\n    or length(coalesce(source->>'description',''))>5000 or coalesce(days,0) not between 1 and 365\r\n    or coalesce(source->>'traveler_type','') not in ('solo','couple','friends','family') then\r\n    raise exception 'Source metadata needs repair before copying' using errcode='22023';\r\n  end if;\r\n  if source->>'destination_name' is not null then\r\n    if length(trim(source->>'destination_name')) not between 1 and 200\r\n      or (source->>'destination_latitude')::double precision is null\r\n      or (source->>'destination_longitude')::double precision is null\r\n      or (source->>'destination_latitude')::double precision not between -90 and 90\r\n      or (source->>'destination_longitude')::double precision not between -180 and 180\r\n      or coalesce(source->>'destination_slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'\r\n      or length(source->>'destination_slug')>200 then\r\n      raise exception 'Source destination needs repair before copying' using errcode='22023';\r\n    end if;\r\n  elsif coalesce(source->>'destination_slug','') not in ('goa','varkala','munnar','kochi','thenkasi') then\r\n    raise exception 'Source destination needs repair before copying' using errcode='22023';\r\n  end if;\r\n  for stop_row in select value from jsonb_array_elements(source->'stops') loop\r\n    if coalesce(length(trim(stop_row->>'name')),0) not between 1 and 200\r\n      or length(coalesce(stop_row->>'description',''))>1000 or length(stop_row->>'mapbox_place_id')>500\r\n      or (stop_row->>'latitude')::double precision is null or (stop_row->>'longitude')::double precision is null\r\n      or (stop_row->>'latitude')::double precision not between -90 and 90\r\n      or (stop_row->>'longitude')::double precision not between -180 and 180\r\n      or (stop_row->>'rating')::numeric not between 0 and 5\r\n      or (stop_row->>'day_number')::integer not between 1 and days then\r\n      raise exception 'Selected stop needs repair before copying' using errcode='22023';\r\n    end if;\r\n  end loop;\r\n\r\n  insert into private.standalone_selected_copy_receipts(draft_id,user_id,source_id,selected_stop_ids)\r\n    values(draft_id,uid,source_id,ids);\r\n  -- Intentionally copy NO inherited media: no Storage grants/policy changes,\r\n  -- legacy classification, existence helper or unverifiable reference trust.\r\n  insert into public.journeys(id,user_id,title,description,destination_slug,destination_name,\r\n    destination_latitude,destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)\r\n  values(draft_id,uid,source->>'title',source->>'description',source->>'destination_slug',source->>'destination_name',\r\n    (source->>'destination_latitude')::double precision,(source->>'destination_longitude')::double precision,\r\n    source->>'traveler_type',days,null,false,source_id);\r\n  insert into public.journey_stops(journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)\r\n  select draft_id,number::integer,value->>'name',value->>'description',(value->>'latitude')::double precision,\r\n    (value->>'longitude')::double precision,value->>'mapbox_place_id',null,\r\n    (value->>'rating')::numeric,(value->>'day_number')::integer\r\n  from jsonb_array_elements(source->'stops') with ordinality as selected(value,number) order by number;\r\n  return draft_id;\r\nexception\r\n  when deadlock_detected or lock_not_available then\r\n    raise exception 'Journey busy; check drafts before retrying' using errcode='40001';\r\n  when unique_violation then\r\n    raise exception 'Copy request conflicts with an existing request' using errcode='22023';\r\n  when check_violation or not_null_violation or numeric_value_out_of_range then\r\n    raise exception 'Source needs repair before copying' using errcode='22023';\r\nend;\r\n$function$\n",
  "public.copy_journey_selected(uuid,uuid[],uuid)": "CREATE OR REPLACE FUNCTION public.copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)\n RETURNS uuid\n LANGUAGE sql\n SET search_path TO ''\nAS $function$\r\n  select private.standalone_copy_journey_selected(source_id,selected_stop_ids,draft_id);\r\n$function$\n"
};
const helper=correction.slice(correction.indexOf('create function private.customize_stops_jwt_uid()'),
  correction.indexOf('-- ADMIN-only'));
const rewrite=correction.slice(correction.indexOf('do $rewrite$'),correction.indexOf('revoke customize_stops_rpc from current_user granted'));
const author='81000000-0000-0000-0000-000000000001',copier='81000000-0000-0000-0000-000000000002';
const source='82000000-0000-0000-0000-000000000001',stop='83000000-0000-0000-0000-000000000001';
const uuid=n=>'84000000-0000-0000-0000-'+String(n).padStart(12,'0');
const call=n=>`select public.copy_journey_selected('${source}',array['${stop}'::uuid],'${uuid(n)}');`;
if(mode==='--offline') {
  // PGlite superuser cannot model the installer's ADMIN-only membership. Run the
  // unchanged 70-contract suite with exact helper and rewrite blocks; real PG
  // below runs the entire guarded migration as a direct non-superuser login.
  let suite=await readFile(new URL('./test-copy-journey-selected-standalone.mjs',import.meta.url),'utf8');
  suite=suite.replace("from './lib/offline-db.mjs'",`from '${new URL('./lib/offline-db.mjs',import.meta.url).href}'`);
  suite=suite.replace("new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url)",`new URL('${new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url).href}')`);
  const inject=`
    await db.exec(${JSON.stringify(liveDefinitions['auth.uid()'])});
    await db.exec('revoke usage on schema auth from customize_stops_rpc');
    await db.exec(${JSON.stringify(helper)});
    await db.exec("create temporary table jwt_correction_baseline as select pg_get_functiondef('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) as rpc");
    await db.exec(${JSON.stringify(rewrite)});
    await db.exec('drop table jwt_correction_baseline');
  `;
  suite=suite.replace('await db.exec(standaloneSql);','await db.exec(standaloneSql);'+inject);
  await import('data:text/javascript;base64,'+Buffer.from(suite).toString('base64'));
  console.log('PASS JWT-corrected full RLS/RPC 70-contract suite; installer guards tested separately on real PostgreSQL.');
} else {
  const root='D:/Travel_Mvp/.local-tests/customize-stops-pg/jwt-correction';
  const psql='D:/Travel_Mvp/.local-tests/customize-stops-pg/pgsql/bin/psql.exe';
  const database='journey_jwt_correction_test',admin='supabase_admin',installer='postgres';
  const identity=JSON.parse(await readFile(join(root,'cluster-identity.json'),'utf8'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG/i.test(key)));
  async function run(sql,db=database,user=installer) {
    assert.ok([database,'postgres'].includes(db));assert.ok([admin,installer].includes(user));
    const child=spawn(psql,['-X','-w','-q','-A','-t','--echo-errors','-h','127.0.0.1','-p','55441','-U',user,'-d',db,'-v','ON_ERROR_STOP=1'],
      {windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...env,PGCONNECT_TIMEOUT:'3',PGPASSFILE:join(root,'no-password-file'),PGAPPNAME:'journey_jwt_correction_regression'}});
    let out='',err='';child.stdout.on('data',x=>{out+=x;});child.stderr.on('data',x=>{err+=x;});child.stdin.on('error',()=>{});
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve({code,out:out.trim().replaceAll('\r\n','\n'),err}));});
    child.stdin.end("\\set VERBOSITY verbose\nset statement_timeout='30s';set lock_timeout='5s';\n"+sql+'\n');return done;
  }
  async function query(sql,db=database,user=installer) {const r=await run(sql,db,user);if(r.code!==0)throw new Error(r.err);return r.out;}
  const json=async(sql,db=database,user=installer)=>JSON.parse(await query(sql,db,user));
  const server=await json(`select jsonb_build_object('version',current_setting('server_version_num')::int,
    'data',current_setting('data_directory'),'cluster',current_setting('cluster_name'),'host',host(inet_server_addr()),
    'port',inet_server_port(),'systemIdentifier',(select system_identifier::text from pg_control_system()));`,'postgres',admin);
  assert.ok(server.version>=170000&&server.version<180000);assert.equal(server.host,'127.0.0.1');assert.equal(server.port,55441);
  assert.equal(server.cluster,'journey_jwt_synthetic_only');assert.equal(server.systemIdentifier,identity.systemIdentifier);
  assert.equal(normalize(await realpath(server.data)).toLowerCase(),normalize(await realpath(join(root,'data'))).toLowerCase());
  assert.equal(normalize(await realpath(identity.dataDirectory)).toLowerCase(),normalize(await realpath(join(root,'data'))).toLowerCase());
  const roleQuery=`select jsonb_build_object('currentUser',current_user,'sessionUser',session_user,
    'superuser',(select rolsuper from pg_roles where rolname=current_user),
    'bypass',(select rolbypassrls from pg_roles where rolname=current_user),
    'createRole',(select rolcreaterole from pg_roles where rolname=current_user));`;
  const snapshotSql=`select jsonb_build_object(
    'rpc',pg_get_functiondef('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure),
    'rpcAcl',(select proacl from pg_proc where oid='private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure),
    'wrapper',pg_get_functiondef('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure),
    'wrapperAcl',(select proacl from pg_proc where oid='public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure),
    'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
    'memberships',(select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m where roleid='customize_stops_rpc'::regrole or member='customize_stops_rpc'::regrole),
    'storageAcl',(select relacl from pg_class where oid='storage.objects'::regclass),
    'helper',to_regprocedure('private.customize_stops_jwt_uid()')::text);`;
  const stateSql=`select jsonb_build_object('authUsage',has_schema_privilege('customize_stops_rpc','auth','USAGE'),
    'authUsers',has_table_privilege('customize_stops_rpc','auth.users','SELECT'),
    'storage',has_schema_privilege('customize_stops_rpc','storage','USAGE'),
    'installerInherit',pg_has_role(current_user,'customize_stops_rpc','USAGE'),
    'installerSet',pg_has_role(current_user,'customize_stops_rpc','SET'),
    'helperOwner',(select proowner::regrole::text from pg_proc where oid='private.customize_stops_jwt_uid()'::regprocedure),
    'roleBypass',(select rolbypassrls from pg_roles where rolname='customize_stops_rpc'));`;
  if(mode==='--inspect') {console.log(JSON.stringify({server,installer:await json(roleQuery),state:await json(stateSql)}));}
  else if(mode==='--verify-installed') {
    assert.deepEqual(await json(roleQuery),{currentUser:installer,sessionUser:installer,superuser:false,bypass:false,createRole:true});
    assert.deepEqual(await json(stateSql),{authUsage:false,authUsers:false,storage:false,installerInherit:false,installerSet:false,helperOwner:installer,roleBypass:false});
    const prepared=await query(`set role customize_stops_rpc;prepare identity_request as select private.customize_stops_jwt_uid();
      set request.jwt.claim.sub='${author}';execute identity_request;
      set request.jwt.claim.sub='${copier}';execute identity_request;
      set request.jwt.claim.sub='';set request.jwt.claims='{"sub":"${author}"}';execute identity_request;`,database,admin);
    assert.equal(prepared,[author,copier,author].join('\n'));
    assert.equal(await query(`select count(*)=3 and bool_and(user_id='${copier}' and status='draft' and copied_from_journey_id='${source}' and cover_image_path is null)
      from public.journeys where copied_from_journey_id='${source}';`),'t');
    assert.equal(await query(`select bool_and(photo_path is null) from public.journey_stops where journey_id<>'${source}';`),'t');
    assert.equal(await query("select pg_get_function_identity_arguments('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure);"),'source_id uuid, selected_stop_ids uuid[], draft_id uuid');
    assert.equal(await query("select count(*)=1 and bool_and(member='postgres'::regrole and grantor='supabase_admin'::regrole and admin_option and not inherit_option and not set_option) from pg_auth_members where roleid='customize_stops_rpc'::regrole;",'postgres',admin),'t');
    const rerun=await run(correction);assert.notEqual(rerun.code,0);assert.match(rerun.err,/JWT helper already exists/);
    const report={timestamp:new Date().toISOString(),server,installer:await json(roleQuery),state:await json(stateSql),
      priorInstallationRun:'Completed all SQL installation/rollback/guard/JWT/ACL/catalog checks, then stopped at JS CRLF comparison of correct prepared-session output.',
      resumedVerification:'Prepared A/B/fallback, three attributed null-media drafts, exact signature, original ADMIN-only membership, repeat-install rejection passed without reinstall.',
      exactCandidateSql:true,noHostedWrites:true};
    await writeFile(join(root,'jwt-correction-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log('PASS retained exact-SQL installation: prepared A/B/fallback, copies/attribution/null-media, exact signature, ADMIN-only cleanup and repeat-install rejection. No migration replay.');
  }
  else {
    if(mode==='--run-local') {
    assert.equal(await query(`select not exists(select 1 from pg_database where datname='${database}');`,'postgres',admin),'t');
    assert.equal(await query("select not exists(select 1 from pg_roles where rolname in ('postgres','customize_stops_rpc','anon','authenticated','service_role'));",'postgres',admin),'t');
    await query(`create role postgres login noinherit nosuperuser nobypassrls createrole createdb;
      create role anon nologin;create role authenticated nologin;create role service_role nologin;`,'postgres',admin);
    await query(`create database ${database} owner ${installer};`,'postgres',admin);
    assert.deepEqual(await json(roleQuery),{currentUser:installer,sessionUser:installer,superuser:false,bypass:false,createRole:true});
    let setup=fixtureSql.replace('create role anon nologin; create role authenticated nologin;','');
    for(const name of (await readdir(migrationDirectory)).filter(n=>n.endsWith('.sql')&&n<'20261005').sort()) setup+='\n'+await readFile(new URL(name,migrationDirectory),'utf8');
    await query(setup);
    const fixedDirectory=new URL('../supabase/standalone-customize-stops-fixed/supabase/migrations/',import.meta.url);
    const fixedNames=(await readdir(fixedDirectory)).filter(n=>n.endsWith('.sql'));assert.equal(fixedNames.length,1);
    const installed=await readFile(new URL(fixedNames[0],fixedDirectory),'utf8');
    await query(installed);
    } else {
      assert.equal(await query("select to_regprocedure('private.customize_stops_jwt_uid()') is null and count(*)=2 from auth.users;"),'t');
      assert.equal(await query(`select count(*)=1 and bool_and(id='${source}') from public.journeys;`),'t');
    }
    const rolesBefore=await json(`select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m where roleid='customize_stops_rpc'::regrole or member='customize_stops_rpc'::regrole;`,'postgres',admin);
    // Reproduce the exact already-installed live function definitions/ACLs.
    const exactDefinition=sql=>`do $fixture$ begin execute convert_from(decode('${Buffer.from(sql).toString('hex')}','hex'),'UTF8'); end $fixture$;`;
    await query(exactDefinition(liveDefinitions['private.standalone_copy_journey_selected(uuid,uuid[],uuid)']),database,admin);
    await query(exactDefinition(liveDefinitions['public.copy_journey_selected(uuid,uuid[],uuid)'])+`;grant execute on function public.copy_journey_selected(uuid,uuid[],uuid) to service_role;`);
    await query(liveDefinitions['auth.uid()']+`;alter schema auth owner to ${admin};
      revoke usage on schema auth from customize_stops_rpc;
      grant usage on schema auth to ${installer};`,database,admin);
    const before=await json(snapshotSql);
    const counts=`select jsonb_build_object('journeys',(select count(*) from public.journeys),
      'stops',(select count(*) from public.journey_stops),'receipts',(select count(*) from private.standalone_selected_copy_receipts));`;
    if(mode==='--run-local') await query(`insert into auth.users values('${author}'),('${copier}');
      insert into public.journeys(id,user_id,title,status,published_at,destination_slug,traveler_type,duration_days)
      values('${source}','${author}','JWT synthetic route','published',now(),'goa','solo',1);
      insert into public.journey_stops(id,journey_id,sequence,name,latitude,longitude)
      values('${stop}','${source}',0,'JWT synthetic stop',10,20);`);
    const initialCounts=await json(counts);
    const failed=await run(`set role authenticated;set request.jwt.claim.sub='${copier}';`+call(1),database,admin);
    assert.notEqual(failed.code,0);assert.match(failed.err,/42501/);assert.match(failed.err,/permission denied for schema auth/);
    assert.deepEqual(await json(counts),initialCounts);
    // Execute the exact candidate, with no SQL/role-name/hash substitutions.
    const model=correction;
    const marker='    execute command;';
    assert.ok(model.includes(marker));
    const injected=model.replace(marker,marker+"\n    raise exception 'Injected mid-policy failure';");
    const rollback=await run(injected);assert.notEqual(rollback.code,0);assert.match(rollback.err,/Injected mid-policy failure/);
    assert.deepEqual(await json(snapshotSql),before);
    // Unrecognized applicable PUBLIC policy must fail before creating helper.
    await query('create policy unexpected_public_jwt_probe on public.journeys for select to public using(false);');
    const drift=await run(model);assert.notEqual(drift.code,0);assert.match(drift.err,/Unexpected applicable PUBLIC/);
    await query('drop policy unexpected_public_jwt_probe on public.journeys;');
    assert.deepEqual(await json(snapshotSql),before);
    const dropPolicies=before.policies.filter(p=>p.roles.includes('customize_stops_rpc'))
      .map(p=>`drop policy ${p.policyname} on ${p.schemaname}.${p.tablename};`).join('\n');
    const missing=await run('begin;'+dropPolicies+model);
    assert.notEqual(missing.code,0);assert.match(missing.err,/Execution-role policy drift/);
    assert.deepEqual(await json(snapshotSql),before);
    // Simulate broad direct function default grants. Helper must remove them.
    await query(`alter default privileges in schema private grant execute on functions to authenticated,${admin};`);
    await query(model);
    await query(`alter default privileges in schema private revoke execute on functions from authenticated,${admin};`);
    assert.deepEqual(await json(stateSql),{authUsage:false,authUsers:false,storage:false,installerInherit:false,installerSet:false,helperOwner:installer,roleBypass:false});
    const after=await json(snapshotSql);
    assert.equal(after.rpc,before.rpc.replace('uid uuid := (select auth.uid());','uid uuid := (select private.customize_stops_jwt_uid());'));
    assert.deepEqual(after.rpcAcl,before.rpcAcl);assert.equal(after.wrapper,before.wrapper);assert.deepEqual(after.wrapperAcl,before.wrapperAcl);
    assert.deepEqual(after.storageAcl,before.storageAcl);assert.deepEqual(after.memberships,before.memberships);
    assert.deepEqual(after.policies.filter(p=>!p.roles.includes('customize_stops_rpc')),before.policies.filter(p=>!p.roles.includes('customize_stops_rpc')));
    const expectedPolicies=before.policies.filter(p=>p.roles.includes('customize_stops_rpc')).map(p=>({...p,
      qual:p.qual?.replaceAll('auth.uid()','private.customize_stops_jwt_uid()')??null,
      with_check:p.with_check?.replaceAll('auth.uid()','private.customize_stops_jwt_uid()')??null}));
    assert.deepEqual(after.policies.filter(p=>p.roles.includes('customize_stops_rpc')),expectedPolicies);
    assert.equal(await query(`select count(*)=2 and bool_and(a.grantee in (p.proowner,'customize_stops_rpc'::regrole) and not a.is_grantable)
      from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='private.customize_stops_jwt_uid()'::regprocedure;`),'t');
    const rejected=async(sql,pattern)=>{const r=await run(sql,database,admin);assert.notEqual(r.code,0);assert.match(r.err,pattern);};
    for(const role of ['anon','authenticated']) await rejected(`set role ${role};select private.customize_stops_jwt_uid();`,/42501/);
    await rejected('set role anon;'+call(2),/42501/);
    await rejected('set role authenticated;select * from private.standalone_selected_copy_receipts;',/42501/);
    for(const claims of ["set request.jwt.claim.sub='';set request.jwt.claims='';",
      "set request.jwt.claim.sub='';set request.jwt.claims='{}';",
      "set request.jwt.claim.sub='';set request.jwt.claims='{\"user_id\":\""+copier+"\",\"user_metadata\":{\"sub\":\""+copier+"\"}}';"])
      await rejected('set role authenticated;'+claims+call(2),/28000/);
    await rejected("set role authenticated;set request.jwt.claim.sub='bad';"+call(2),/22P02/);
    await rejected("set role authenticated;set request.jwt.claim.sub='';set request.jwt.claims='invalid';"+call(2),/22P02/);
    assert.deepEqual(await json(counts),initialCounts);
    const auth=`set role authenticated;set request.jwt.claim.sub='${copier}';`;
    assert.equal(await query(auth+call(1),database,admin),uuid(1));assert.equal(await query(auth+call(1),database,admin),uuid(1));
    assert.equal(await query(`set role authenticated;set request.jwt.claim.sub='';set request.jwt.claims='{"sub":"${copier}"}';`+call(2),database,admin),uuid(2));
    assert.equal(await query(`set role authenticated;set request.jwt.claim.sub='${copier}';set request.jwt.claims='{"sub":"${author}"}';`+call(3),database,admin),uuid(3));
    await rejected(`set role authenticated;set request.jwt.claim.sub='${author}';`+call(1),/22023/);
    const prepared=await query(`set role customize_stops_rpc;prepare identity_request as select private.customize_stops_jwt_uid();
      set request.jwt.claim.sub='${author}';execute identity_request;
      set request.jwt.claim.sub='${copier}';execute identity_request;
      set request.jwt.claim.sub='';set request.jwt.claims='{"sub":"${author}"}';execute identity_request;`,database,admin);
    assert.equal(prepared,[author,copier,author].join('\n'));
    assert.equal(await query(`select count(*)=3 and bool_and(user_id='${copier}' and status='draft' and copied_from_journey_id='${source}' and cover_image_path is null)
      from public.journeys where copied_from_journey_id='${source}';`),'t');
    assert.equal(await query(`select bool_and(photo_path is null) from public.journey_stops where journey_id<>'${source}';`),'t');
    assert.equal(await query(`select pg_get_function_identity_arguments('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure);`),'source_id uuid, selected_stop_ids uuid[], draft_id uuid');
    assert.deepEqual(await json(`select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m where roleid='customize_stops_rpc'::regrole or member='customize_stops_rpc'::regrole;`,'postgres',admin),rolesBefore);
    const rerun=await run(model);assert.notEqual(rerun.code,0);assert.match(rerun.err,/JWT helper already exists/);
    const report={timestamp:new Date().toISOString(),server,installer:await json(roleQuery),state:await json(stateSql),
      original42501Reproduced:true,fullCorrectionAsNonSuperuser:true,localRoleNamesSubstituted:false,
      rollbackExact:true,unexpectedPublicPolicyRejected:true,canonicalHelperAcl:true,jwtAndPreparedSession:true,
      copiesReplayAndRls:true,protectedCatalogsUnchanged:true,globalMembershipsRestored:true,noHostedWrites:true};
    await writeFile(join(root,'jwt-correction-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log('PASS real PostgreSQL JWT correction: 42501 reproduced; full non-superuser correction, injected rollback, stale-policy guard, exact ACL/membership cleanup, JWT formats/prepared A/B, full RLS/copy/replay and protected catalogs.');
  }
}
