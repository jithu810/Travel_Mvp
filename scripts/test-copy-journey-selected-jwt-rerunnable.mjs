// LOCAL ONLY: exact reviewed SQL, fixed synthetic PostgreSQL17 loopback cluster.
// No hosted DSNs, credentials, environment files, old database writes or role-attribute changes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';
import {join,normalize} from 'node:path';
import {fixtureSql,migrationDirectory} from './lib/offline-db.mjs';
const mode=process.argv[2];
assert.ok(process.argv.length===3&&['--offline','--run-local','--resume-clean','--inspect'].includes(mode),
  'Usage: node scripts/test-copy-journey-selected-jwt-rerunnable.mjs --offline | --run-local | --resume-clean | --inspect');
const directory=new URL('../supabase/customize-stops-jwt-rerunnable/supabase/migrations/',import.meta.url);
const names=(await readdir(directory)).filter(n=>n.endsWith('.sql'));assert.equal(names.length,1);
const candidate=await readFile(new URL(names[0],directory),'utf8');
const definitions={"auth.uid()":"CREATE OR REPLACE FUNCTION auth.uid()\n RETURNS uuid\n LANGUAGE sql\n STABLE\nAS $function$\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n$function$\n","private.standalone_copy_journey_selected(uuid,uuid[],uuid)":"CREATE OR REPLACE FUNCTION private.standalone_copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\n SET lock_timeout TO '5s'\nAS $function$\r\ndeclare\r\n  uid uuid := (select auth.uid());\r\n  ids uuid[];\r\n  receipt private.standalone_selected_copy_receipts%rowtype;\r\n  source jsonb;\r\n  stop_row jsonb;\r\n  days integer;\r\nbegin\r\n  if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;\r\n  if source_id is null or draft_id is null or source_id=draft_id or selected_stop_ids is null\r\n    or cardinality(selected_stop_ids) not between 1 and 50 or array_ndims(selected_stop_ids)<>1 then\r\n    raise exception 'Invalid selected stops' using errcode='22023';\r\n  end if;\r\n  if array_position(selected_stop_ids,null) is not null\r\n    or (select count(distinct id) from unnest(selected_stop_ids) id)<>cardinality(selected_stop_ids) then\r\n    raise exception 'Invalid selected stops' using errcode='22023';\r\n  end if;\r\n  select array_agg(id order by id) into ids from unnest(selected_stop_ids) id;\r\n  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('standalone-selected-copy:' || draft_id::text,0));\r\n  select r.* into receipt from private.standalone_selected_copy_receipts r\r\n    where r.draft_id=standalone_copy_journey_selected.draft_id;\r\n  if found then\r\n    if receipt.user_id<>uid or receipt.source_id<>source_id or receipt.selected_stop_ids<>ids then\r\n      raise exception 'Copy request does not match its original selection' using errcode='22023';\r\n    end if;\r\n    if not exists(select 1 from public.journeys j where j.id=draft_id and j.user_id=uid\r\n      and j.copied_from_journey_id=source_id) then\r\n      raise exception 'Previous copy is no longer available; check your journeys' using errcode='P0002';\r\n    end if;\r\n    return draft_id;\r\n  end if;\r\n\r\n  -- Lock parent metadata/publication/deletion, then read parent + requested\r\n  -- children in ONE statement snapshot. Baseline direct child writes need not\r\n  -- lock the parent: concurrent changes after this snapshot cannot alter JSON.\r\n  -- No table-wide lock or dependency on hardened save_journey is introduced.\r\n  perform 1 from public.journeys j where j.id=source_id and j.status='published' and not j.is_demo for share;\r\n  if not found then raise exception 'Published journey not found' using errcode='P0002'; end if;\r\n  select to_jsonb(j) || jsonb_build_object('stops',coalesce((\r\n    select jsonb_agg(to_jsonb(s) order by s.sequence,s.id) from public.journey_stops s\r\n    where s.journey_id=j.id and s.id=any(ids)), '[]'::jsonb)) into source\r\n  from public.journeys j where j.id=source_id and j.status='published' and not j.is_demo;\r\n  if not found then raise exception 'Published journey not found' using errcode='P0002'; end if;\r\n  if jsonb_array_length(source->'stops')<>cardinality(ids) then\r\n    raise exception 'Selection contains unavailable stops' using errcode='22023';\r\n  end if;\r\n  days := (source->>'duration_days')::integer;\r\n  if coalesce(length(trim(source->>'title')),0) not between 1 and 200\r\n    or length(coalesce(source->>'description',''))>5000 or coalesce(days,0) not between 1 and 365\r\n    or coalesce(source->>'traveler_type','') not in ('solo','couple','friends','family') then\r\n    raise exception 'Source metadata needs repair before copying' using errcode='22023';\r\n  end if;\r\n  if source->>'destination_name' is not null then\r\n    if length(trim(source->>'destination_name')) not between 1 and 200\r\n      or (source->>'destination_latitude')::double precision is null\r\n      or (source->>'destination_longitude')::double precision is null\r\n      or (source->>'destination_latitude')::double precision not between -90 and 90\r\n      or (source->>'destination_longitude')::double precision not between -180 and 180\r\n      or coalesce(source->>'destination_slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'\r\n      or length(source->>'destination_slug')>200 then\r\n      raise exception 'Source destination needs repair before copying' using errcode='22023';\r\n    end if;\r\n  elsif coalesce(source->>'destination_slug','') not in ('goa','varkala','munnar','kochi','thenkasi') then\r\n    raise exception 'Source destination needs repair before copying' using errcode='22023';\r\n  end if;\r\n  for stop_row in select value from jsonb_array_elements(source->'stops') loop\r\n    if coalesce(length(trim(stop_row->>'name')),0) not between 1 and 200\r\n      or length(coalesce(stop_row->>'description',''))>1000 or length(stop_row->>'mapbox_place_id')>500\r\n      or (stop_row->>'latitude')::double precision is null or (stop_row->>'longitude')::double precision is null\r\n      or (stop_row->>'latitude')::double precision not between -90 and 90\r\n      or (stop_row->>'longitude')::double precision not between -180 and 180\r\n      or (stop_row->>'rating')::numeric not between 0 and 5\r\n      or (stop_row->>'day_number')::integer not between 1 and days then\r\n      raise exception 'Selected stop needs repair before copying' using errcode='22023';\r\n    end if;\r\n  end loop;\r\n\r\n  insert into private.standalone_selected_copy_receipts(draft_id,user_id,source_id,selected_stop_ids)\r\n    values(draft_id,uid,source_id,ids);\r\n  -- Intentionally copy NO inherited media: no Storage grants/policy changes,\r\n  -- legacy classification, existence helper or unverifiable reference trust.\r\n  insert into public.journeys(id,user_id,title,description,destination_slug,destination_name,\r\n    destination_latitude,destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)\r\n  values(draft_id,uid,source->>'title',source->>'description',source->>'destination_slug',source->>'destination_name',\r\n    (source->>'destination_latitude')::double precision,(source->>'destination_longitude')::double precision,\r\n    source->>'traveler_type',days,null,false,source_id);\r\n  insert into public.journey_stops(journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)\r\n  select draft_id,number::integer,value->>'name',value->>'description',(value->>'latitude')::double precision,\r\n    (value->>'longitude')::double precision,value->>'mapbox_place_id',null,\r\n    (value->>'rating')::numeric,(value->>'day_number')::integer\r\n  from jsonb_array_elements(source->'stops') with ordinality as selected(value,number) order by number;\r\n  return draft_id;\r\nexception\r\n  when deadlock_detected or lock_not_available then\r\n    raise exception 'Journey busy; check drafts before retrying' using errcode='40001';\r\n  when unique_violation then\r\n    raise exception 'Copy request conflicts with an existing request' using errcode='22023';\r\n  when check_violation or not_null_violation or numeric_value_out_of_range then\r\n    raise exception 'Source needs repair before copying' using errcode='22023';\r\nend;\r\n$function$\n","public.copy_journey_selected(uuid,uuid[],uuid)":"CREATE OR REPLACE FUNCTION public.copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)\n RETURNS uuid\n LANGUAGE sql\n SET search_path TO ''\nAS $function$\r\n  select private.standalone_copy_journey_selected(source_id,selected_stop_ids,draft_id);\r\n$function$\n"};
const observedHelper="CREATE OR REPLACE FUNCTION private.customize_stops_jwt_uid()\n RETURNS uuid\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO ''\nAS $function$\r\n  select auth.uid()\r\n$function$\n";
const oldPolicies=JSON.parse(candidate.match(/\$known\$([\s\S]*?)\$known\$/)[1]);
const helperBody=candidate.match(/execute \$create\$([\s\S]*?)\$create\$/)[1];
const knownId=n=>'91000000-0000-0000-0000-'+String(n).padStart(12,'0');
const author=knownId(1),copier=knownId(2),source=knownId(3),stop=knownId(4);
const target=n=>'92000000-0000-0000-0000-'+String(n).padStart(12,'0');
const call=n=>`select public.copy_journey_selected('${source}',array['${stop}'::uuid],'${target(n)}');`;
const policySql=(p,corrected=true)=>{
  const qual=corrected?p.qual?.replaceAll('auth.uid()','private.customize_stops_jwt_uid()'):p.qual;
  const check=corrected?p.with_check?.replaceAll('auth.uid()','private.customize_stops_jwt_uid()'):p.with_check;
  return `alter policy ${p.policyname} on ${p.schemaname}.${p.tablename}`+
    (qual?' using ('+qual+')':'')+(check?' with check ('+check+')':'')+';';
};
if(mode==='--offline') {
  // Full contract regression of the convergence result. PGlite is superuser;
  // the entire installer/guards and three entry states run on real PG below.
  let suite=await readFile(new URL('./test-copy-journey-selected-standalone.mjs',import.meta.url),'utf8');
  suite=suite.replace("from './lib/offline-db.mjs'",`from '${new URL('./lib/offline-db.mjs',import.meta.url).href}'`);
  suite=suite.replace("new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url)",`new URL('${new URL('../supabase/standalone-customize-stops/supabase/migrations/',import.meta.url).href}')`);
  const correctedDefinition=definitions['private.standalone_copy_journey_selected(uuid,uuid[],uuid)']
    .replace('uid uuid := (select auth.uid());','uid uuid := (select private.customize_stops_jwt_uid());');
  const endState=definitions['auth.uid()']+';revoke usage on schema auth from customize_stops_rpc;'+helperBody+
    ';revoke all on function private.customize_stops_jwt_uid() from public;grant execute on function private.customize_stops_jwt_uid() to customize_stops_rpc;'+
    correctedDefinition+';'+oldPolicies.map(p=>policySql(p)).join('\n');
  suite=suite.replace('await db.exec(standaloneSql);',()=> 'await db.exec(standaloneSql);await db.exec('+JSON.stringify(endState)+');');
  await import('data:text/javascript;base64,'+Buffer.from(suite).toString('base64'));
  console.log('PASS rerunnable convergence-result full70 RLS/RPC contract regression; guarded installer covered on real PG.');
} else {
  const root='D:/Travel_Mvp/.local-tests/customize-stops-pg/jwt-correction';
  const psql='D:/Travel_Mvp/.local-tests/customize-stops-pg/pgsql/bin/psql.exe';
  const databases=['journey_jwt_rerun_clean','journey_jwt_rerun_mixed','journey_jwt_rerun_observed'];
  const admin='supabase_admin',installer='postgres';
  const identity=JSON.parse(await readFile(join(root,'cluster-identity.json'),'utf8'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG/i.test(key)));
  async function run(sql,db='postgres',user=admin) {
    assert.ok(['postgres',...databases].includes(db));assert.ok([admin,installer].includes(user));
    const child=spawn(psql,['-X','-w','-q','-A','-t','--echo-errors','-h','127.0.0.1','-p','55441','-U',user,'-d',db,'-v','ON_ERROR_STOP=1'],
      {windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...env,PGCONNECT_TIMEOUT:'3',PGPASSFILE:join(root,'no-password-file'),PGAPPNAME:'journey_jwt_rerunnable_regression'}});
    let out='',err='';child.stdout.on('data',x=>{out+=x;});child.stderr.on('data',x=>{err+=x;});child.stdin.on('error',()=>{});
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve({code,out:out.trim().replaceAll('\r\n','\n'),err}));});
    child.stdin.end("\\set VERBOSITY verbose\nset statement_timeout='30s';set lock_timeout='5s';\n"+sql+'\n');return done;
  }
  async function query(sql,db='postgres',user=admin) {const r=await run(sql,db,user);if(r.code!==0)throw new Error(r.err);return r.out;}
  const json=async(sql,db='postgres',user=admin)=>JSON.parse(await query(sql,db,user));
  const server=await json(`select jsonb_build_object('version',current_setting('server_version_num')::int,
    'data',current_setting('data_directory'),'cluster',current_setting('cluster_name'),'host',host(inet_server_addr()),'port',inet_server_port(),
    'systemIdentifier',(select system_identifier::text from pg_control_system()));`);
  assert.ok(server.version>=170000&&server.version<180000);assert.equal(server.host,'127.0.0.1');assert.equal(server.port,55441);
  assert.equal(server.cluster,'journey_jwt_synthetic_only');assert.equal(server.systemIdentifier,'7699008439210805272');
  assert.equal(server.systemIdentifier,identity.systemIdentifier);
  assert.equal(normalize(await realpath(server.data)).toLowerCase(),normalize(await realpath(join(root,'data'))).toLowerCase());
  assert.equal(normalize(await realpath(identity.dataDirectory)).toLowerCase(),normalize(await realpath(join(root,'data'))).toLowerCase());
  const memberships=`select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m
    where roleid='customize_stops_rpc'::regrole or member='customize_stops_rpc'::regrole;`;
  const snapshot=`select jsonb_build_object(
    'functions',(select jsonb_agg(to_jsonb(p)||jsonb_build_object('definition',pg_get_functiondef(p.oid),'xmin',p.xmin::text,'ctid',p.ctid::text) order by p.oid)
      from pg_proc p where p.oid in (to_regprocedure('auth.uid()'),to_regprocedure('private.customize_stops_jwt_uid()'),
      to_regprocedure('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'),to_regprocedure('public.copy_journey_selected(uuid,uuid[],uuid)'))),
    'policies',(select jsonb_agg(to_jsonb(q) order by schemaname,tablename,policyname) from pg_policies q),
    'policyTuples',(select jsonb_agg(jsonb_build_object('oid',oid,'xmin',xmin::text,'ctid',ctid::text) order by oid) from pg_policy),
    'members',(select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m where roleid='customize_stops_rpc'::regrole or member='customize_stops_rpc'::regrole),
    'tables',(select jsonb_agg(jsonb_build_object('name',oid::regclass::text,'acl',relacl,'owner',relowner,'rls',relrowsecurity) order by oid) from pg_class where oid in
      ('storage.objects'::regclass,'public.journeys'::regclass,'public.journey_stops'::regclass,'private.standalone_selected_copy_receipts'::regclass)),
    'schemas',(select jsonb_agg(to_jsonb(n) order by oid) from pg_namespace n where nspname in ('auth','private','public','storage')));`;
  const state=`select jsonb_build_object('authUsage',has_schema_privilege('customize_stops_rpc','auth','USAGE'),
    'authUsers',has_table_privilege('customize_stops_rpc','auth.users','SELECT'),
    'storage',has_schema_privilege('customize_stops_rpc','storage','USAGE'),
    'installerInherit',pg_has_role('postgres','customize_stops_rpc','USAGE'),
    'installerSet',pg_has_role('postgres','customize_stops_rpc','SET'),
    'bypass',(select rolbypassrls from pg_roles where rolname='customize_stops_rpc'),
    'mainHash',md5(replace(pg_get_functiondef('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure),chr(13),'')));`;
  if(mode==='--inspect') {
    console.log(JSON.stringify({server,members:await json(memberships),databases:await Promise.all(databases.map(async db=>({database:db,state:await json(state,db)})))}));
  } else {
    if(mode==='--run-local') assert.equal(await query(`select count(*)=0 from pg_database where datname in ('${databases.join("','")}');`),'t','Dedicated targets must all be new; never reset existing DBs.');
    else {
      assert.equal(await query(`select count(*)=1 and bool_and(datname='${databases[0]}') from pg_database where datname in ('${databases.join("','")}');`),'t');
      assert.equal(await query("select to_regprocedure('private.customize_stops_jwt_uid()') is null and count(*)=0 from public.journeys;",databases[0],installer),'t');
    }
    assert.equal(await query(`select not rolsuper and not rolbypassrls and rolcreaterole from pg_roles where rolname='postgres';`),'t');
    const baselineMembers=await json(memberships);
    let setup=fixtureSql.replace('create role anon nologin; create role authenticated nologin;','');
    for(const name of (await readdir(migrationDirectory)).filter(n=>n.endsWith('.sql')&&n<'20261005').sort())
      setup+='\n'+await readFile(new URL(name,migrationDirectory),'utf8');
    const fixedDir=new URL('../supabase/standalone-customize-stops-fixed/supabase/migrations/',import.meta.url);
    const fixedNames=(await readdir(fixedDir)).filter(n=>n.endsWith('.sql'));assert.equal(fixedNames.length,1);
    const installed=(await readFile(new URL(fixedNames[0],fixedDir),'utf8')).replace(
      'create role customize_stops_rpc nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;','-- Existing isolated role; attributes retained.');
    const exact=sql=>`do $fixture$ begin execute convert_from(decode('${Buffer.from(sql).toString('hex')}','hex'),'UTF8');end $fixture$;`;
    const results=[];
    for(const [index,db] of databases.entries()) {
      if(!(mode==='--resume-clean'&&index===0)) {
      await query(`create database ${db} owner postgres;`);
      await query(setup,db,installer);await query(installed,db,installer);
      await query(exact(definitions['auth.uid()'])+`alter schema auth owner to supabase_admin;revoke usage on schema auth from customize_stops_rpc;
        grant usage on schema auth to postgres;`,db);
      await query(exact(definitions['public.copy_journey_selected(uuid,uuid[],uuid)'])+'grant execute on function public.copy_journey_selected(uuid,uuid[],uuid) to service_role;',db,installer);
      await query(exact(definitions['private.standalone_copy_journey_selected(uuid,uuid[],uuid)']),db);
      if(index>0) {
        await query(exact(observedHelper)+'revoke all on function private.customize_stops_jwt_uid() from public;grant execute on function private.customize_stops_jwt_uid() to customize_stops_rpc;',db,installer);
        for(const [i,p] of oldPolicies.entries()) if(index===2||i%2===0) await query(policySql(p),db,installer);
        if(index===2) await query(exact(definitions['private.standalone_copy_journey_selected(uuid,uuid[],uuid)'].replace(
          'uid uuid := (select auth.uid());','uid uuid := (select private.customize_stops_jwt_uid());')),db);
        else await query('grant customize_stops_rpc to current_user with inherit true, set false granted by current_user;',db,installer);
      }
      }
      const before=await json(snapshot,db);
      const fail=async(sql,pattern)=>{const r=await run(sql,db,installer);assert.notEqual(r.code,0);assert.match(r.err,pattern);};
      if(index<2) {
        const injected=candidate.replace('      execute command;',"      execute command;\n      raise exception 'Injected mid-policy failure';");
        assert.notEqual(injected,candidate);
        await fail(injected,/Injected mid-policy failure/);
        assert.deepEqual(await json(snapshot,db),before);
      }
      const tests=[
        [`create policy unsafe_public_jwt_probe on public.journeys for select to public using(false);`,/Unexpected PUBLIC/],
        ['alter policy standalone_copy_read on public.journeys using(true);',/Unknown or missing execution-role policy/],
        ['grant customize_stops_rpc to current_user with inherit true, set false granted by current_user;alter function private.standalone_copy_journey_selected(uuid,uuid[],uuid) security invoker;',/Unknown private RPC/]
      ];
      // Existing safe helper must not be adopted if definition or ACL is unknown.
      if(index>0) {
        tests.push(["alter function private.customize_stops_jwt_uid() immutable;",/Unknown helper/]);
        tests.push(["grant execute on function private.customize_stops_jwt_uid() to authenticated;",/Unknown helper/]);
      }
      for(const [change,error] of tests) {
        await fail('begin;'+change+candidate,error);
        assert.deepEqual(await json(snapshot,db),before);
      }
      const installedResult=await run(candidate,db,installer);assert.equal(installedResult.code,0,installedResult.err);
      assert.match(installedResult.err,index===2?/SUCCESS_NOOP/:/SUCCESS_CONVERGED/);
      if(index===2) assert.deepEqual(await json(snapshot,db),before,'Fully corrected state must not rewrite catalog tuples.');
      assert.deepEqual(await json(memberships),baselineMembers);
      const after=await json(snapshot,db);
      for(let repeat=0;repeat<2;repeat++) {
        const noop=await run(candidate,db,installer);assert.equal(noop.code,0,noop.err);assert.match(noop.err,/SUCCESS_NOOP/);
        assert.deepEqual(await json(snapshot,db),after);
      }
      assert.deepEqual(await json(state,db),{authUsage:false,authUsers:false,storage:false,installerInherit:false,installerSet:false,bypass:false,mainHash:'b9a95cb7700305d411fc587cfee49514'});
      const beforeOther=before.policies.filter(p=>!p.roles.includes('customize_stops_rpc'));
      assert.deepEqual(after.policies.filter(p=>!p.roles.includes('customize_stops_rpc')),beforeOther);
      assert.deepEqual(after.tables,before.tables);assert.deepEqual(after.schemas,before.schemas);
      const functionByName=(s,name)=>s.functions.find(f=>f.proname===name);
      for(const name of ['uid','copy_journey_selected']) assert.deepEqual(functionByName(after,name),functionByName(before,name));
      const mainBefore=functionByName(before,'standalone_copy_journey_selected'),mainAfter=functionByName(after,'standalone_copy_journey_selected');
      assert.equal(mainAfter.definition,mainBefore.definition.replace('uid uuid := (select auth.uid());','uid uuid := (select private.customize_stops_jwt_uid());'));
      assert.deepEqual(mainAfter.proacl,mainBefore.proacl);
      await query(`insert into auth.users values('${author}'),('${copier}');
        insert into public.journeys(id,user_id,title,status,published_at,destination_slug,traveler_type,duration_days)
        values('${source}','${author}','Rerunnable synthetic route','published',now(),'goa','solo',1);
        insert into public.journey_stops(id,journey_id,sequence,name,latitude,longitude) values('${stop}','${source}',0,'Synthetic stop',10,20);`,db,installer);
      const reject=async(sql,pattern)=>{const r=await run(sql,db,admin);assert.notEqual(r.code,0);assert.match(r.err,pattern);};
      for(const role of ['anon','authenticated']) await reject(`set role ${role};select private.customize_stops_jwt_uid();`,/42501/);
      await reject('set role anon;'+call(1),/42501/);
      await reject('set role authenticated;'+call(1),/28000/);
      await reject("set role authenticated;set request.jwt.claim.sub='';set request.jwt.claims='{}';"+call(1),/28000/);
      await reject(`set role authenticated;set request.jwt.claim.sub='';set request.jwt.claims='{"user_id":"${copier}","user_metadata":{"sub":"${copier}"}}';`+call(1),/28000/);
      await reject("set role authenticated;set request.jwt.claim.sub='malformed';"+call(1),/22P02/);
      await reject("set role authenticated;set request.jwt.claim.sub='';set request.jwt.claims='invalid';"+call(1),/22P02/);
      assert.equal(await query('select count(*)=0 from private.standalone_selected_copy_receipts;',db,installer),'t');
      const auth=`set role authenticated;set request.jwt.claim.sub='${copier}';`;
      assert.equal(await query(auth+call(1),db),target(1));assert.equal(await query(auth+call(1),db),target(1));
      assert.equal(await query(`set role authenticated;set request.jwt.claim.sub='';set request.jwt.claims='{"sub":"${copier}"}';`+call(2),db),target(2));
      assert.equal(await query(`set role authenticated;set request.jwt.claim.sub='${copier}';set request.jwt.claims='{"sub":"${author}"}';`+call(3),db),target(3));
      await reject(`set role authenticated;set request.jwt.claim.sub='${author}';`+call(1),/22023/);
      await reject(auth+'select * from private.standalone_selected_copy_receipts;',/42501/);
      const prepared=await query(`set role customize_stops_rpc;prepare jwt_identity as select private.customize_stops_jwt_uid();
        set request.jwt.claim.sub='${author}';execute jwt_identity;
        set request.jwt.claim.sub='${copier}';execute jwt_identity;
        set request.jwt.claim.sub='';set request.jwt.claims='{"sub":"${author}"}';execute jwt_identity;`,db);
      assert.equal(prepared,[author,copier,author].join('\n'));
      assert.equal(await query(`select count(*)=3 and bool_and(user_id='${copier}' and status='draft' and copied_from_journey_id='${source}' and cover_image_path is null)
        from public.journeys where copied_from_journey_id='${source}';`,db,installer),'t');
      assert.equal(await query(`select bool_and(photo_path is null) from public.journey_stops where journey_id<>'${source}';`,db,installer),'t');
      results.push({database:db,entry:['clean-pre-correction','synthetic-known-mixed-with-selfgrant','observed-fully-corrected'][index],
        initialResult:index===2?'SUCCESS_NOOP':'SUCCESS_CONVERGED',repeatNoops:2,exactSql:true,rollbackAndDriftGuards:true,jwtRlsAndDenials:true});
      console.log('PASS '+db+': exact SQL, state convergence/no-op, rollback/drift, JWT/RLS/ACL/replay, prepared A/B.');
    }
    await writeFile(join(root,'jwt-rerunnable-results.json'),JSON.stringify({timestamp:new Date().toISOString(),server,results,globalMembershipsRestored:true,noHostedWrites:true},null,2)+'\n');
  }
}
