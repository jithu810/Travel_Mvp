-- LOCAL REVIEW PROPOSAL. Separate approval required before named-project live apply.
-- Depends on immutable profile_connections_v1 + profile_connections_execute_acl.
begin;
-- Fail closed on unexpected function logic or privileges before creating anything.
do $guard$
declare item record; body text; target oid; owner_name name; definer boolean;
begin
  for item in select * from (values
    ('private.connection_summary(uuid)','d4ec37e764775c95e64c927ee7d28c69'),
    ('private.connection_list(text,text,integer)','1bf1634f3cc93d6f38a5efaf5838b692'),
    ('private.connection_mutate(uuid,text,uuid,integer,boolean,uuid[])','36a5c8276f1c82d30186abc7e49c9b8c')
  ) expected(signature,checksum) loop
    target:=to_regprocedure(item.signature);
    if target is null then raise exception 'Expected connection function missing'; end if;
    select p.prosrc,pg_get_userbyid(p.proowner),p.prosecdef into body,owner_name,definer from pg_proc p where p.oid=target;
    if md5(regexp_replace(body,'\s','','g'))<>item.checksum or owner_name<>'connection_rpc' or not definer
      or (length(body)-length(replace(body,'auth.uid()','')))<>length('auth.uid()')
      or has_function_privilege('anon',target,'execute') or not has_function_privilege('authenticated',target,'execute')
      or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=target and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'Connection function differs from reviewed identity baseline: %',item.signature;
    end if;
  end loop;
end;
$guard$;

-- Owned by the installer, which has auth USAGE but need not have its grant option.
-- This function accepts no actor argument and reads no tables; JWT identity stays
-- exactly that of the managed auth.uid() function and original request context.
create function private.connection_uid() returns uuid language sql stable security definer set search_path='' as $$ select auth.uid() $$;
revoke all on function private.connection_uid() from public,anon,authenticated;
-- Supabase can attach additional default grants (e.g. service_role). Strip every
-- non-owner direct grantee, not only the known client roles.
do $acl$
declare grantee_name name;
begin
  for grantee_name in select distinct r.rolname from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    join pg_roles r on r.oid=a.grantee where p.oid='private.connection_uid()'::regprocedure and a.grantee<>p.proowner loop
    execute format('revoke all on function private.connection_uid() from %I',grantee_name);
  end loop;
end;
$acl$;
grant execute on function private.connection_uid() to connection_rpc;

-- Keep the narrow role's ownership and existing ACLs. Existing function replacement
-- needs installer CREATE on private, not any new CREATE grant to connection_rpc.
grant connection_rpc to current_user with inherit true,set true;
do $replace$
declare signature text; target oid; definition text;
begin
  foreach signature in array array['private.connection_summary(uuid)','private.connection_list(text,text,integer)','private.connection_mutate(uuid,text,uuid,integer,boolean,uuid[])'] loop
    target:=signature::regprocedure;
    definition:=pg_get_functiondef(target);
    execute replace(definition,'auth.uid()','private.connection_uid()');
  end loop;
end;
$replace$;
revoke connection_rpc from current_user;
commit;
