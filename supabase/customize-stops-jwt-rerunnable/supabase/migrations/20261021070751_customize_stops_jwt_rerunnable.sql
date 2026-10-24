-- Rerunnable corrective ONLY for the reviewed installed standalone Customize Stops RPC.
-- Accept known old/new components; fail closed on unknown drift. No object/data drops.
-- Final-state executions perform verification and return SUCCESS_NOOP without DDL/grants.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
set local search_path=pg_catalog,public;
do $correction$
declare
  old_policies jsonb := $known$[{"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"standalone_selected_copy_receipts","permissive":"PERMISSIVE","policyname":"standalone_copy_receipts_insert","schemaname":"private","with_check":"(user_id = ( SELECT auth.uid() AS uid))"},{"cmd":"SELECT","qual":"(user_id = ( SELECT auth.uid() AS uid))","roles":["customize_stops_rpc"],"tablename":"standalone_selected_copy_receipts","permissive":"PERMISSIVE","policyname":"standalone_copy_receipts_read","schemaname":"private","with_check":null},{"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"journey_stops","permissive":"PERMISSIVE","policyname":"standalone_copy_stops_insert","schemaname":"public","with_check":"(EXISTS ( SELECT 1\n   FROM journeys j\n  WHERE ((j.id = journey_stops.journey_id) AND (j.user_id = ( SELECT auth.uid() AS uid)) AND (j.status = 'draft'::text) AND (NOT j.is_demo))))"},{"cmd":"SELECT","qual":"(EXISTS ( SELECT 1\n   FROM journeys j\n  WHERE (j.id = journey_stops.journey_id)))","roles":["customize_stops_rpc"],"tablename":"journey_stops","permissive":"PERMISSIVE","policyname":"standalone_copy_stops_read","schemaname":"public","with_check":null},{"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_insert","schemaname":"public","with_check":"((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::text) AND (NOT is_demo))"},{"cmd":"UPDATE","qual":"((status = 'published'::text) OR (user_id = ( SELECT auth.uid() AS uid)))","roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_lock","schemaname":"public","with_check":"(user_id = ( SELECT auth.uid() AS uid))"},{"cmd":"SELECT","qual":"((status = 'published'::text) OR (user_id = ( SELECT auth.uid() AS uid)))","roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_read","schemaname":"public","with_check":null}]$known$::jsonb;
  expected jsonb; corrected jsonb; actual jsonb;
  p record; command text;
  old_hash constant text := '331fb5584fe36f806739cff5151fafdd';
  new_hash constant text := 'b9a95cb7700305d411fc587cfee49514';
  main_oid oid := to_regprocedure('private.standalone_copy_journey_selected(uuid,uuid[],uuid)');
  helper_oid oid := to_regprocedure('private.customize_stops_jwt_uid()');
  main_hash text; main_definition text; wrapper_definition text; main_acl aclitem[]; wrapper_acl aclitem[];
  original_memberships jsonb; expected_memberships jsonb; other_policies jsonb; storage_acl aclitem[];
  bootstrap_count integer; self_count integer;
  helper_present boolean; all_corrected boolean := true; changed boolean := false;
begin
  if current_user is distinct from 'postgres' or session_user is distinct from 'postgres'
    or not has_schema_privilege(current_user,'private','CREATE')
    or not has_schema_privilege(current_user,'auth','USAGE')
    or not has_function_privilege(current_user,'auth.uid()','EXECUTE') then
    raise exception 'Expected postgres installer with existing private CREATE and auth.uid access';
  end if;
  if md5(pg_get_functiondef('auth.uid()'::regprocedure)) is distinct from 'ea3b41bf29e2ad573067939329aa088e'
    or md5(replace(pg_get_functiondef('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure),chr(13),'')) is distinct from 'bb564a93eb33c7a7d4a616048fceaa15' then
    raise exception 'Canonical Auth/public wrapper drift';
  end if;
  main_definition:=pg_get_functiondef(main_oid);
  main_hash:=md5(replace(main_definition,chr(13),''));
  if main_hash is null or main_hash not in (old_hash,new_hash) then
    raise exception 'Unknown private RPC definition';
  end if;
  if not exists(select 1 from pg_proc where oid=main_oid and proowner='customize_stops_rpc'::regrole
      and prosecdef and proacl::text[]=array['customize_stops_rpc=X/customize_stops_rpc','authenticated=X/customize_stops_rpc'])
    or not exists(select 1 from pg_proc where oid='public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure
      and proowner=current_user::regrole and not prosecdef
      and proacl::text[]=array['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres']) then
    raise exception 'Unexpected selected-function owner or ACL';
  end if;
  if not exists(select 1 from pg_roles where rolname='customize_stops_rpc' and not rolcanlogin
      and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and not rolbypassrls)
    or exists(select 1 from pg_auth_members where member='customize_stops_rpc'::regrole)
    or has_schema_privilege('customize_stops_rpc','auth','USAGE')
    or has_schema_privilege('customize_stops_rpc','private','CREATE')
    or has_schema_privilege('customize_stops_rpc','storage','USAGE')
    or has_table_privilege('customize_stops_rpc','auth.users','SELECT') then
    raise exception 'Unexpected execution-role attributes/access/inheritance';
  end if;
  select count(*) filter(where member='postgres'::regrole and grantor='supabase_admin'::regrole
      and admin_option and not inherit_option and not set_option),
    count(*) filter(where member='postgres'::regrole and grantor='postgres'::regrole
      and not admin_option and inherit_option and not set_option)
    into bootstrap_count,self_count
    from pg_auth_members where roleid='customize_stops_rpc'::regrole;
  if bootstrap_count<>1 or self_count>1
    or (select count(*) from pg_auth_members where roleid='customize_stops_rpc'::regrole)<>bootstrap_count+self_count then
    raise exception 'Unknown execution-role membership; no cleanup attempted';
  end if;
  if exists(select 1 from pg_class where oid in ('public.journeys'::regclass,
      'public.journey_stops'::regclass,'private.standalone_selected_copy_receipts'::regclass)
      and (relowner<>current_user::regrole or not relrowsecurity or relforcerowsecurity)) then
    raise exception 'Unexpected table ownership/RLS';
  end if;
  if exists(select 1 from pg_policy where polrelid in ('public.journeys'::regclass,
      'public.journey_stops'::regclass,'private.standalone_selected_copy_receipts'::regclass)
      and 0=any(polroles))
    or (select count(*) from pg_policies where 'customize_stops_rpc'=any(roles))<>7 then
    raise exception 'Unexpected PUBLIC policy or execution-role policy inventory';
  end if;
  -- Exact per-policy old OR new form, including command, target roles and mode.
  for expected in select value from jsonb_array_elements(old_policies) loop
    select to_jsonb(q) into actual from pg_policies q
      where q.schemaname=expected->>'schemaname' and q.tablename=expected->>'tablename'
      and q.policyname=expected->>'policyname';
    corrected:=expected||jsonb_build_object(
      'qual',replace(expected->>'qual','auth.uid()','private.customize_stops_jwt_uid()'),
      'with_check',replace(expected->>'with_check','auth.uid()','private.customize_stops_jwt_uid()'));
    if actual is distinct from expected and actual is distinct from corrected then
      raise exception 'Unknown or missing execution-role policy: %',expected->>'policyname';
    end if;
    all_corrected:=all_corrected and actual=corrected;
  end loop;
  helper_present:=helper_oid is not null;
  if helper_present and not exists(select 1 from pg_proc where oid=helper_oid and proowner='postgres'::regrole
    and md5(replace(pg_get_functiondef(oid),chr(13),''))='74d7f773eb11814b26f5de32e3f075cd'
    and proacl::text[]=array['postgres=X/postgres','customize_stops_rpc=X/postgres']) then
    raise exception 'Unknown helper definition/owner/ACL; refusing to replace it';
  end if;
  if helper_present and main_hash=new_hash and all_corrected and self_count=0 then
    raise notice 'SUCCESS_NOOP: verified already-corrected Customize Stops JWT state';
    return;
  end if;

  -- Save catalogs only. On any error the enclosing transaction restores entry state.
  select proacl into main_acl from pg_proc where oid=main_oid;
  select pg_get_functiondef(oid),proacl into wrapper_definition,wrapper_acl
    from pg_proc where oid='public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure;
  select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) into original_memberships
    from pg_auth_members m where roleid='customize_stops_rpc'::regrole;
  select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) into expected_memberships
    from pg_auth_members m where roleid='customize_stops_rpc'::regrole and grantor='supabase_admin'::regrole;
  select jsonb_agg(to_jsonb(q) order by schemaname,tablename,policyname) into other_policies
    from pg_policies q where not ('customize_stops_rpc'=any(roles));
  select relacl into storage_acl from pg_class where oid='storage.objects'::regclass;

  if not helper_present then
    execute $create$CREATE OR REPLACE FUNCTION private.customize_stops_jwt_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid()
$function$
$create$;
    execute 'revoke all on function private.customize_stops_jwt_uid() from public';
    for p in select distinct r.rolname from pg_proc f cross join lateral aclexplode(f.proacl) a
      join pg_roles r on r.oid=a.grantee where f.oid='private.customize_stops_jwt_uid()'::regprocedure
      and a.grantee<>f.proowner
    loop
      execute format('revoke all on function private.customize_stops_jwt_uid() from %I',p.rolname);
    end loop;
    execute 'grant execute on function private.customize_stops_jwt_uid() to customize_stops_rpc';
    changed:=true;
  end if;
  if main_hash=old_hash then
    if self_count=0 then
      execute 'grant customize_stops_rpc to current_user with inherit true, set false granted by current_user';
    end if;
    execute replace(main_definition,'uid uuid := (select auth.uid());',
      'uid uuid := (select private.customize_stops_jwt_uid());');
    changed:=true;
  end if;
  for expected in select value from jsonb_array_elements(old_policies) loop
    select to_jsonb(q) into actual from pg_policies q where q.schemaname=expected->>'schemaname'
      and q.tablename=expected->>'tablename' and q.policyname=expected->>'policyname';
    corrected:=expected||jsonb_build_object(
      'qual',replace(expected->>'qual','auth.uid()','private.customize_stops_jwt_uid()'),
      'with_check',replace(expected->>'with_check','auth.uid()','private.customize_stops_jwt_uid()'));
    if actual is distinct from corrected then
      command:=format('alter policy %I on %I.%I',expected->>'policyname',expected->>'schemaname',expected->>'tablename');
      if corrected->>'qual' is not null then command:=command||' using ('||(corrected->>'qual')||')'; end if;
      if corrected->>'with_check' is not null then command:=command||' with check ('||(corrected->>'with_check')||')'; end if;
      execute command;
      changed:=true;
    end if;
  end loop;
  if main_hash=old_hash or self_count=1 then
    execute 'revoke customize_stops_rpc from current_user granted by current_user';
  end if;

  if md5(replace(pg_get_functiondef(main_oid),chr(13),'')) is distinct from new_hash
    or (select proacl from pg_proc where oid=main_oid) is distinct from main_acl
    or pg_get_functiondef('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) is distinct from wrapper_definition
    or (select proacl from pg_proc where oid='public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) is distinct from wrapper_acl
    or (select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m
      where roleid='customize_stops_rpc'::regrole) is distinct from expected_memberships
    or (select jsonb_agg(to_jsonb(q) order by schemaname,tablename,policyname) from pg_policies q
      where not ('customize_stops_rpc'=any(roles))) is distinct from other_policies
    or (select relacl from pg_class where oid='storage.objects'::regclass) is distinct from storage_acl
    or has_schema_privilege('customize_stops_rpc','auth','USAGE')
    or pg_has_role(current_user,'customize_stops_rpc','USAGE')
    or pg_has_role(current_user,'customize_stops_rpc','SET') then
    raise exception 'JWT convergence protected-catalog/role postcondition failed';
  end if;
  if not exists(select 1 from pg_proc where oid='private.customize_stops_jwt_uid()'::regprocedure
      and proowner='postgres'::regrole and md5(replace(pg_get_functiondef(oid),chr(13),''))='74d7f773eb11814b26f5de32e3f075cd'
      and proacl::text[]=array['postgres=X/postgres','customize_stops_rpc=X/postgres']) then
    raise exception 'JWT helper postcondition failed';
  end if;
  for expected in select value from jsonb_array_elements(old_policies) loop
    select to_jsonb(q) into actual from pg_policies q where q.schemaname=expected->>'schemaname'
      and q.tablename=expected->>'tablename' and q.policyname=expected->>'policyname';
    corrected:=expected||jsonb_build_object('qual',replace(expected->>'qual','auth.uid()','private.customize_stops_jwt_uid()'),
      'with_check',replace(expected->>'with_check','auth.uid()','private.customize_stops_jwt_uid()'));
    if actual is distinct from corrected then raise exception 'JWT policy convergence failed'; end if;
  end loop;
  raise notice 'SUCCESS_CONVERGED: verified Customize Stops JWT correction';
end
$correction$;
commit;
