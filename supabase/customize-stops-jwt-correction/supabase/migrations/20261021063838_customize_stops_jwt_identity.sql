-- Corrective ONLY: already-installed, media-free standalone selected-copy RPC.
-- Preflight 2026-10-21 06:32-06:34 UTC; Architect gate released.
-- No reinstall, identity input, auth/Storage grants, role attributes or client-policy changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
set local search_path=pg_catalog,public;

do $guard$
declare
  installer name := current_user;
  membership record;
begin
  if current_user is distinct from 'postgres' or session_user is distinct from 'postgres'
    or not has_schema_privilege(current_user,'private','CREATE')
    or not has_schema_privilege(current_user,'auth','USAGE')
    or not has_function_privilege(current_user,'auth.uid()','EXECUTE') then
    raise exception 'Expected postgres installer with existing private CREATE and auth.uid access';
  end if;
  if to_regprocedure('private.customize_stops_jwt_uid()') is not null then
    raise exception 'JWT helper already exists; inspect state instead of rerunning';
  end if;
  if md5(pg_get_functiondef('auth.uid()'::regprocedure)) is distinct from 'ea3b41bf29e2ad573067939329aa088e'
    or md5(pg_get_functiondef('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure)) is distinct from 'eef55909df25b49f149cdb26e664abb8'
    or md5(pg_get_functiondef('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure)) is distinct from '6dbd165907594c440c4f8448cd6faad6' then
    raise exception 'Function definition drift; fresh review required';
  end if;
  if not exists(select 1 from pg_roles where rolname='customize_stops_rpc'
    and not rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and not rolbypassrls)
    or exists(select 1 from pg_auth_members where member='customize_stops_rpc'::regrole)
    or (select count(*) from pg_auth_members where roleid='customize_stops_rpc'::regrole) is distinct from 1 then
    raise exception 'Unexpected execution-role attributes or membership';
  end if;
  select * into membership from pg_auth_members where roleid='customize_stops_rpc'::regrole;
  if membership.member is distinct from installer::regrole or membership.grantor is distinct from 'supabase_admin'::regrole
    or not membership.admin_option or membership.inherit_option or membership.set_option then
    raise exception 'Unexpected creator membership; refusing to modify it';
  end if;
  if has_schema_privilege('customize_stops_rpc','auth','USAGE')
    or has_schema_privilege('customize_stops_rpc','private','CREATE')
    or has_schema_privilege('customize_stops_rpc','storage','USAGE')
    or has_table_privilege('customize_stops_rpc','auth.users','SELECT') then
    raise exception 'Unexpected execution-role namespace/data access';
  end if;
  if not exists(select 1 from pg_proc where oid='private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure
    and proowner='customize_stops_rpc'::regrole and prosecdef
    and proacl::text[] = array['customize_stops_rpc=X/customize_stops_rpc','authenticated=X/customize_stops_rpc'])
    or not exists(select 1 from pg_proc where oid='public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure
      and proowner=installer::regrole and not prosecdef
      and proacl::text[]=array['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres']) then
    raise exception 'Unexpected selected-function ownership or ACL';
  end if;
  if exists(select 1 from pg_class where oid in ('public.journeys'::regclass,
    'public.journey_stops'::regclass,'private.standalone_selected_copy_receipts'::regclass)
    and (relowner is distinct from installer::regrole or not relrowsecurity or relforcerowsecurity)) then
    raise exception 'Unexpected table ownership/RLS';
  end if;
  if exists(select 1 from pg_policy p where p.polrelid in ('public.journeys'::regclass,
    'public.journey_stops'::regclass,'private.standalone_selected_copy_receipts'::regclass)
    and (0=any(p.polroles) or 'customize_stops_rpc'::regrole=any(p.polroles))
    and (p.polroles is distinct from array['customize_stops_rpc'::regrole::oid]
      or p.polname not in ('standalone_copy_read','standalone_copy_insert','standalone_copy_lock',
        'standalone_copy_stops_read','standalone_copy_stops_insert','standalone_copy_receipts_read','standalone_copy_receipts_insert'))) then
    raise exception 'Unexpected applicable PUBLIC/custom policy';
  end if;
  if (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
      from pg_policies p where 'customize_stops_rpc'=any(roles))  is distinct from
    (select jsonb_agg(value order by value->>'schemaname',value->>'tablename',value->>'policyname')
      from jsonb_array_elements($policies$[{"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"standalone_selected_copy_receipts","permissive":"PERMISSIVE","policyname":"standalone_copy_receipts_insert","schemaname":"private","with_check":"(user_id = ( SELECT auth.uid() AS uid))"},{"cmd":"SELECT","qual":"(user_id = ( SELECT auth.uid() AS uid))","roles":["customize_stops_rpc"],"tablename":"standalone_selected_copy_receipts","permissive":"PERMISSIVE","policyname":"standalone_copy_receipts_read","schemaname":"private","with_check":null},{"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"journey_stops","permissive":"PERMISSIVE","policyname":"standalone_copy_stops_insert","schemaname":"public","with_check":"(EXISTS ( SELECT 1\n   FROM journeys j\n  WHERE ((j.id = journey_stops.journey_id) AND (j.user_id = ( SELECT auth.uid() AS uid)) AND (j.status = 'draft'::text) AND (NOT j.is_demo))))"},{"cmd":"SELECT","qual":"(EXISTS ( SELECT 1\n   FROM journeys j\n  WHERE (j.id = journey_stops.journey_id)))","roles":["customize_stops_rpc"],"tablename":"journey_stops","permissive":"PERMISSIVE","policyname":"standalone_copy_stops_read","schemaname":"public","with_check":null},{"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_insert","schemaname":"public","with_check":"((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::text) AND (NOT is_demo))"},{"cmd":"UPDATE","qual":"((status = 'published'::text) OR (user_id = ( SELECT auth.uid() AS uid)))","roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_lock","schemaname":"public","with_check":"(user_id = ( SELECT auth.uid() AS uid))"},{"cmd":"SELECT","qual":"((status = 'published'::text) OR (user_id = ( SELECT auth.uid() AS uid)))","roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_read","schemaname":"public","with_check":null}]$policies$::jsonb)) then
    raise exception 'Execution-role policy drift';
  end if;
end
$guard$;

-- Snapshot only catalogs; never read personal application records.
create temporary table jwt_correction_baseline on commit drop as
select pg_get_functiondef('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) as rpc,
  (select proacl from pg_proc where oid='private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) as rpc_acl,
  pg_get_functiondef('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) as wrapper,
  (select proacl from pg_proc where oid='public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) as wrapper_acl,
  (select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m
    where roleid='customize_stops_rpc'::regrole or member='customize_stops_rpc'::regrole) as memberships,
  (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p
    where not ('customize_stops_rpc'=any(roles))) as other_policies;

-- Identity only. Canonical managed Auth parsing; no tables, dynamic SQL or input UID.
create function private.customize_stops_jwt_uid() returns uuid
language sql stable security definer set search_path='' as $identity$
  select auth.uid()
$identity$;
revoke all on function private.customize_stops_jwt_uid() from public;
-- Canonicalize only this NEW helper, including direct default-privilege grants.
do $acl$
declare grantee_name name;
begin
  for grantee_name in
    select r.rolname from pg_proc p cross join lateral aclexplode(p.proacl) a
      join pg_roles r on r.oid=a.grantee
    where p.oid='private.customize_stops_jwt_uid()'::regprocedure and a.grantee is distinct from p.proowner
  loop
    execute format('revoke all on function private.customize_stops_jwt_uid() from %I',grantee_name);
  end loop;
end
$acl$;
grant execute on function private.customize_stops_jwt_uid() to customize_stops_rpc;

-- ADMIN-only creator link is preserved. Temporary self grant gives ownership
-- checks via INHERIT while retaining postgres privileges and disallowing SET.
grant customize_stops_rpc to current_user with inherit true, set false granted by current_user;

do $rewrite$
declare old_definition text; p record; command text;
begin
  select rpc into old_definition from pg_temp.jwt_correction_baseline;
  execute replace(old_definition,'uid uuid := (select auth.uid());',
    'uid uuid := (select private.customize_stops_jwt_uid());');
  for p in select * from pg_policies where 'customize_stops_rpc'=any(roles)
    and (position('auth.uid()' in coalesce(qual,''))>0 or position('auth.uid()' in coalesce(with_check,''))>0)
  loop
    command:=format('alter policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
    if p.qual is not null then command:=command||' using ('||replace(p.qual,'auth.uid()','private.customize_stops_jwt_uid()')||')'; end if;
    if p.with_check is not null then command:=command||' with check ('||replace(p.with_check,'auth.uid()','private.customize_stops_jwt_uid()')||')'; end if;
    execute command;
  end loop;
end
$rewrite$;
revoke customize_stops_rpc from current_user granted by current_user;

do $verify$
declare b record;
begin
  select * into b from pg_temp.jwt_correction_baseline;
  if pg_get_functiondef('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure)
       is distinct from replace(b.rpc,'uid uuid := (select auth.uid());','uid uuid := (select private.customize_stops_jwt_uid());')
    or (select proacl from pg_proc where oid='private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) is distinct from b.rpc_acl
    or pg_get_functiondef('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) is distinct from b.wrapper
    or (select proacl from pg_proc where oid='public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure) is distinct from b.wrapper_acl
    or (select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m
      where roleid='customize_stops_rpc'::regrole or member='customize_stops_rpc'::regrole) is distinct from b.memberships
    or (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p
      where not ('customize_stops_rpc'=any(roles))) is distinct from b.other_policies then
    raise exception 'Correction changed protected definition/ACL/membership/policy metadata';
  end if;
  if exists(select 1 from pg_policies where 'customize_stops_rpc'=any(roles)
      and (position('auth.uid()' in coalesce(qual,''))>0 or position('auth.uid()' in coalesce(with_check,''))>0))
    or has_schema_privilege('customize_stops_rpc','auth','USAGE')
    or pg_has_role(current_user,'customize_stops_rpc','USAGE')
    or pg_has_role(current_user,'customize_stops_rpc','SET')
    or not exists(select 1 from pg_proc where oid='private.customize_stops_jwt_uid()'::regprocedure
      and proowner=current_user::regrole and prosecdef and provolatile='s' and proconfig=array['search_path=""'])
    or exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid='private.customize_stops_jwt_uid()'::regprocedure
        and (a.grantee not in (p.proowner,'customize_stops_rpc'::regrole) or a.is_grantable or a.privilege_type is distinct from 'EXECUTE'))
    or not has_function_privilege('customize_stops_rpc','private.customize_stops_jwt_uid()','EXECUTE') then
    raise exception 'JWT correction postconditions failed';
  end if;
end
$verify$;
commit;
