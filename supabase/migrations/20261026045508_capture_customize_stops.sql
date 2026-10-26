-- Capture of the live Customize Stops (selected-stop copy) objects.
-- Live state: the standalone-fixed installer plus the JWT identity correction,
-- applied outside the migration tool (no live history entry). This file records
-- that end state so fresh databases match production:
--   role customize_stops_rpc, private.standalone_selected_copy_receipts,
--   private.customize_stops_jwt_uid(), private.standalone_copy_journey_selected(),
--   public.copy_journey_selected() and the 7 customize_stops_rpc RLS policies.
-- Selected copies never copy the source author's media: cover_image_path and
-- every stop photo_path are stored as NULL.
--
-- Behaviour:
--   none of the objects exist  -> create the live end state, verify, SUCCESS_CREATED
--   all exist and match live   -> verify only, SUCCESS_NOOP (no DDL, grants or data)
--   partial state or any drift -> exception; nothing is altered, adopted or dropped
-- Verified definition hashes (md5 of pg_get_functiondef with CR removed) equal the
-- live catalog values recorded on 2026-10-26.
-- Do not run against a hosted project without explicit product-owner approval;
-- registering it in live history (migration repair) is also a live change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';
set local search_path = pg_catalog, public;

do $capture$
declare
  rpc constant regprocedure := to_regprocedure('private.standalone_copy_journey_selected(uuid,uuid[],uuid)');
  helper constant regprocedure := to_regprocedure('private.customize_stops_jwt_uid()');
  wrapper constant regprocedure := to_regprocedure('public.copy_journey_selected(uuid,uuid[],uuid)');
  receipts constant regclass := to_regclass('private.standalone_selected_copy_receipts');
  role_present constant boolean := exists(select 1 from pg_roles where rolname = 'customize_stops_rpc');
  present integer;
  created boolean := false;
  installer oid := (select relowner from pg_class where oid = 'public.journeys'::regclass);
  grantee_name name;
  expected_policies constant jsonb := $policies$[
    {"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"standalone_selected_copy_receipts","permissive":"PERMISSIVE","policyname":"standalone_copy_receipts_insert","schemaname":"private","with_check":"(user_id = ( SELECT private.customize_stops_jwt_uid() AS uid))"},
    {"cmd":"SELECT","qual":"(user_id = ( SELECT private.customize_stops_jwt_uid() AS uid))","roles":["customize_stops_rpc"],"tablename":"standalone_selected_copy_receipts","permissive":"PERMISSIVE","policyname":"standalone_copy_receipts_read","schemaname":"private","with_check":null},
    {"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"journey_stops","permissive":"PERMISSIVE","policyname":"standalone_copy_stops_insert","schemaname":"public","with_check":"(EXISTS ( SELECT 1\n   FROM journeys j\n  WHERE ((j.id = journey_stops.journey_id) AND (j.user_id = ( SELECT private.customize_stops_jwt_uid() AS uid)) AND (j.status = 'draft'::text) AND (NOT j.is_demo))))"},
    {"cmd":"SELECT","qual":"(EXISTS ( SELECT 1\n   FROM journeys j\n  WHERE (j.id = journey_stops.journey_id)))","roles":["customize_stops_rpc"],"tablename":"journey_stops","permissive":"PERMISSIVE","policyname":"standalone_copy_stops_read","schemaname":"public","with_check":null},
    {"cmd":"INSERT","qual":null,"roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_insert","schemaname":"public","with_check":"((user_id = ( SELECT private.customize_stops_jwt_uid() AS uid)) AND (status = 'draft'::text) AND (NOT is_demo))"},
    {"cmd":"UPDATE","qual":"((status = 'published'::text) OR (user_id = ( SELECT private.customize_stops_jwt_uid() AS uid)))","roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_lock","schemaname":"public","with_check":"(user_id = ( SELECT private.customize_stops_jwt_uid() AS uid))"},
    {"cmd":"SELECT","qual":"((status = 'published'::text) OR (user_id = ( SELECT private.customize_stops_jwt_uid() AS uid)))","roles":["customize_stops_rpc"],"tablename":"journeys","permissive":"PERMISSIVE","policyname":"standalone_copy_read","schemaname":"public","with_check":null}
  ]$policies$::jsonb;
  journey_insert_columns constant text[] := array['cover_image_path','copied_from_journey_id','description','destination_latitude',
    'destination_longitude','destination_name','destination_slug','duration_days','id','is_demo','title','traveler_type','user_id'];
  stop_insert_columns constant text[] := array['day_number','description','journey_id','latitude','longitude','mapbox_place_id',
    'name','photo_path','rating','sequence'];
begin
  present := role_present::int + (receipts is not null)::int + (rpc is not null)::int
    + (helper is not null)::int + (wrapper is not null)::int;
  if present = 0 then
    -- Fresh database: same preconditions as the reviewed standalone installer.
    if to_regprocedure('private.copy_journey_selected(uuid,uuid[],uuid)') is not null
      or to_regclass('private.selected_copy_requests') is not null
      or to_regclass('private.journey_media_authorizations') is not null then
      raise exception 'Hardened selected-copy/media objects already exist; customize-stops capture must run first';
    end if;
    if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
      or exists(select 1 from pg_class c join pg_roles r on r.oid = c.relowner
        where c.oid in ('public.journeys'::regclass,'public.journey_stops'::regclass)
          and (not c.relrowsecurity or r.rolname in ('anon','authenticated'))) then
      raise exception 'Unexpected client RLS bypass or table ownership';
    end if;

    -- Execution role: not inherited by clients, owns no application table, no
    -- auth/storage schema access (identity comes from the JWT helper below).
    execute 'create role customize_stops_rpc nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls';
    execute 'grant usage on schema public, private to customize_stops_rpc';
    execute 'grant select on public.journeys, public.journey_stops to customize_stops_rpc';
    execute 'grant insert (id,user_id,title,description,destination_slug,destination_name,destination_latitude,
      destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)
      on public.journeys to customize_stops_rpc';
    execute 'grant insert (journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
      on public.journey_stops to customize_stops_rpc';
    -- Locking SELECT ... FOR SHARE needs UPDATE privilege; the RPC never updates.
    execute 'grant update (title) on public.journeys to customize_stops_rpc';

    -- Identity helper, owned by the installer (auth.uid() access stays there).
    execute $helper$CREATE FUNCTION private.customize_stops_jwt_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid()
$function$
$helper$;
    execute 'revoke all on function private.customize_stops_jwt_uid() from public';
    for grantee_name in select distinct r.rolname from pg_proc f cross join lateral aclexplode(f.proacl) a
      join pg_roles r on r.oid = a.grantee
      where f.oid = 'private.customize_stops_jwt_uid()'::regprocedure and a.grantee <> f.proowner loop
      execute format('revoke all on function private.customize_stops_jwt_uid() from %I', grantee_name);
    end loop;
    execute 'grant execute on function private.customize_stops_jwt_uid() to customize_stops_rpc';

    execute $p$create policy standalone_copy_read on public.journeys for select to customize_stops_rpc
      using (status='published' or user_id=( SELECT private.customize_stops_jwt_uid() AS uid))$p$;
    execute $p$create policy standalone_copy_insert on public.journeys for insert to customize_stops_rpc
      with check (user_id=( SELECT private.customize_stops_jwt_uid() AS uid) and status='draft' and not is_demo)$p$;
    execute $p$create policy standalone_copy_lock on public.journeys for update to customize_stops_rpc
      using (status='published' or user_id=( SELECT private.customize_stops_jwt_uid() AS uid))
      with check (user_id=( SELECT private.customize_stops_jwt_uid() AS uid))$p$;
    execute $p$create policy standalone_copy_stops_read on public.journey_stops for select to customize_stops_rpc
      using (exists(select 1 from public.journeys j where j.id=journey_id))$p$;
    execute $p$create policy standalone_copy_stops_insert on public.journey_stops for insert to customize_stops_rpc
      with check (exists(select 1 from public.journeys j where j.id=journey_id
        and j.user_id=( SELECT private.customize_stops_jwt_uid() AS uid) and j.status='draft' and not j.is_demo))$p$;

    -- Idempotency receipts: no journey FK, so deleting a copy never re-enables a retry.
    execute $t$create table private.standalone_selected_copy_receipts (
      draft_id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      source_id uuid not null,
      selected_stop_ids uuid[] not null,
      created_at timestamptz not null default now(),
      check (cardinality(selected_stop_ids) between 1 and 50),
      check (array_ndims(selected_stop_ids)=1 and array_position(selected_stop_ids,null) is null)
    )$t$;
    execute 'create index standalone_copy_receipts_user_idx on private.standalone_selected_copy_receipts(user_id)';
    execute 'alter table private.standalone_selected_copy_receipts enable row level security';
    execute 'revoke all on private.standalone_selected_copy_receipts from public, anon, authenticated';
    for grantee_name in select distinct r.rolname from pg_class c cross join lateral aclexplode(c.relacl) a
      join pg_roles r on r.oid = a.grantee
      where c.oid = 'private.standalone_selected_copy_receipts'::regclass and a.grantee <> c.relowner loop
      execute format('revoke all on private.standalone_selected_copy_receipts from %I', grantee_name);
    end loop;
    execute 'grant select, insert on private.standalone_selected_copy_receipts to customize_stops_rpc';
    execute $p$create policy standalone_copy_receipts_read on private.standalone_selected_copy_receipts
      for select to customize_stops_rpc using (user_id=( SELECT private.customize_stops_jwt_uid() AS uid))$p$;
    execute $p$create policy standalone_copy_receipts_insert on private.standalone_selected_copy_receipts
      for insert to customize_stops_rpc with check (user_id=( SELECT private.customize_stops_jwt_uid() AS uid))$p$;

    -- The RPC body is the live definition verbatim (CR removed).
    execute $rpc$CREATE FUNCTION private.standalone_copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare
  uid uuid := (select private.customize_stops_jwt_uid());
  ids uuid[];
  receipt private.standalone_selected_copy_receipts%rowtype;
  source jsonb;
  stop_row jsonb;
  days integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if source_id is null or draft_id is null or source_id=draft_id or selected_stop_ids is null
    or cardinality(selected_stop_ids) not between 1 and 50 or array_ndims(selected_stop_ids)<>1 then
    raise exception 'Invalid selected stops' using errcode='22023';
  end if;
  if array_position(selected_stop_ids,null) is not null
    or (select count(distinct id) from unnest(selected_stop_ids) id)<>cardinality(selected_stop_ids) then
    raise exception 'Invalid selected stops' using errcode='22023';
  end if;
  select array_agg(id order by id) into ids from unnest(selected_stop_ids) id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('standalone-selected-copy:' || draft_id::text,0));
  select r.* into receipt from private.standalone_selected_copy_receipts r
    where r.draft_id=standalone_copy_journey_selected.draft_id;
  if found then
    if receipt.user_id<>uid or receipt.source_id<>source_id or receipt.selected_stop_ids<>ids then
      raise exception 'Copy request does not match its original selection' using errcode='22023';
    end if;
    if not exists(select 1 from public.journeys j where j.id=draft_id and j.user_id=uid
      and j.copied_from_journey_id=source_id) then
      raise exception 'Previous copy is no longer available; check your journeys' using errcode='P0002';
    end if;
    return draft_id;
  end if;

  -- Lock parent metadata/publication/deletion, then read parent + requested
  -- children in ONE statement snapshot. Baseline direct child writes need not
  -- lock the parent: concurrent changes after this snapshot cannot alter JSON.
  -- No table-wide lock or dependency on hardened save_journey is introduced.
  perform 1 from public.journeys j where j.id=source_id and j.status='published' and not j.is_demo for share;
  if not found then raise exception 'Published journey not found' using errcode='P0002'; end if;
  select to_jsonb(j) || jsonb_build_object('stops',coalesce((
    select jsonb_agg(to_jsonb(s) order by s.sequence,s.id) from public.journey_stops s
    where s.journey_id=j.id and s.id=any(ids)), '[]'::jsonb)) into source
  from public.journeys j where j.id=source_id and j.status='published' and not j.is_demo;
  if not found then raise exception 'Published journey not found' using errcode='P0002'; end if;
  if jsonb_array_length(source->'stops')<>cardinality(ids) then
    raise exception 'Selection contains unavailable stops' using errcode='22023';
  end if;
  days := (source->>'duration_days')::integer;
  if coalesce(length(trim(source->>'title')),0) not between 1 and 200
    or length(coalesce(source->>'description',''))>5000 or coalesce(days,0) not between 1 and 365
    or coalesce(source->>'traveler_type','') not in ('solo','couple','friends','family') then
    raise exception 'Source metadata needs repair before copying' using errcode='22023';
  end if;
  if source->>'destination_name' is not null then
    if length(trim(source->>'destination_name')) not between 1 and 200
      or (source->>'destination_latitude')::double precision is null
      or (source->>'destination_longitude')::double precision is null
      or (source->>'destination_latitude')::double precision not between -90 and 90
      or (source->>'destination_longitude')::double precision not between -180 and 180
      or coalesce(source->>'destination_slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or length(source->>'destination_slug')>200 then
      raise exception 'Source destination needs repair before copying' using errcode='22023';
    end if;
  elsif coalesce(source->>'destination_slug','') not in ('goa','varkala','munnar','kochi','thenkasi') then
    raise exception 'Source destination needs repair before copying' using errcode='22023';
  end if;
  for stop_row in select value from jsonb_array_elements(source->'stops') loop
    if coalesce(length(trim(stop_row->>'name')),0) not between 1 and 200
      or length(coalesce(stop_row->>'description',''))>1000 or length(stop_row->>'mapbox_place_id')>500
      or (stop_row->>'latitude')::double precision is null or (stop_row->>'longitude')::double precision is null
      or (stop_row->>'latitude')::double precision not between -90 and 90
      or (stop_row->>'longitude')::double precision not between -180 and 180
      or (stop_row->>'rating')::numeric not between 0 and 5
      or (stop_row->>'day_number')::integer not between 1 and days then
      raise exception 'Selected stop needs repair before copying' using errcode='22023';
    end if;
  end loop;

  insert into private.standalone_selected_copy_receipts(draft_id,user_id,source_id,selected_stop_ids)
    values(draft_id,uid,source_id,ids);
  -- Intentionally copy NO inherited media: no Storage grants/policy changes,
  -- legacy classification, existence helper or unverifiable reference trust.
  insert into public.journeys(id,user_id,title,description,destination_slug,destination_name,
    destination_latitude,destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)
  values(draft_id,uid,source->>'title',source->>'description',source->>'destination_slug',source->>'destination_name',
    (source->>'destination_latitude')::double precision,(source->>'destination_longitude')::double precision,
    source->>'traveler_type',days,null,false,source_id);
  insert into public.journey_stops(journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
  select draft_id,number::integer,value->>'name',value->>'description',(value->>'latitude')::double precision,
    (value->>'longitude')::double precision,value->>'mapbox_place_id',null,
    (value->>'rating')::numeric,(value->>'day_number')::integer
  from jsonb_array_elements(source->'stops') with ordinality as selected(value,number) order by number;
  return draft_id;
exception
  when deadlock_detected or lock_not_available then
    raise exception 'Journey busy; check drafts before retrying' using errcode='40001';
  when unique_violation then
    raise exception 'Copy request conflicts with an existing request' using errcode='22023';
  when check_violation or not_null_violation or numeric_value_out_of_range then
    raise exception 'Source needs repair before copying' using errcode='22023';
end;
$function$
$rpc$;
    -- EXECUTE is granted while the installer still owns the function.
    execute 'revoke all on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) from public, anon, authenticated';
    for grantee_name in select distinct r.rolname from pg_proc f cross join lateral aclexplode(f.proacl) a
      join pg_roles r on r.oid = a.grantee
      where f.oid = 'private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure and a.grantee <> f.proowner loop
      execute format('revoke all on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) from %I', grantee_name);
    end loop;
    execute 'grant execute on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) to authenticated';
    -- Temporary membership/CREATE only for the ownership transfer; removed before commit.
    execute 'grant customize_stops_rpc to current_user';
    execute 'grant create on schema private to customize_stops_rpc';
    execute 'alter function private.standalone_copy_journey_selected(uuid,uuid[],uuid) owner to customize_stops_rpc';
    execute 'revoke create on schema private from customize_stops_rpc';
    execute 'revoke customize_stops_rpc from current_user';

    execute $wrapper$CREATE FUNCTION public.copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.standalone_copy_journey_selected(source_id,selected_stop_ids,draft_id);
$function$
$wrapper$;
    execute 'revoke all on function public.copy_journey_selected(uuid,uuid[],uuid) from public, anon';
    execute 'grant execute on function public.copy_journey_selected(uuid,uuid[],uuid) to authenticated';
    created := true;
  elsif present < 5 then
    raise exception 'Partial customize-stops state (% of 5 core objects); inspect manually, nothing changed', present;
  end if;

  -- Verification of the live end state (both paths). Any mismatch aborts.
  if exists(select 1 from pg_roles where rolname = 'customize_stops_rpc' and (rolcanlogin or rolinherit or rolsuper
      or rolcreatedb or rolcreaterole or rolbypassrls or rolreplication))
    or exists(select 1 from pg_auth_members where member = 'customize_stops_rpc'::regrole)
    or exists(select 1 from pg_auth_members where roleid = 'customize_stops_rpc'::regrole
      and (inherit_option or set_option))
    or pg_has_role('anon','customize_stops_rpc','MEMBER') or pg_has_role('authenticated','customize_stops_rpc','MEMBER') then
    raise exception 'Customize-stops drift: execution role attributes or membership';
  end if;
  if not has_schema_privilege('customize_stops_rpc','public','USAGE')
    or not has_schema_privilege('customize_stops_rpc','private','USAGE')
    or has_schema_privilege('customize_stops_rpc','public','CREATE')
    or has_schema_privilege('customize_stops_rpc','private','CREATE')
    or has_schema_privilege('customize_stops_rpc','auth','USAGE')
    or has_schema_privilege('customize_stops_rpc','storage','USAGE') then
    raise exception 'Customize-stops drift: execution role schema privileges';
  end if;
  if not has_table_privilege('customize_stops_rpc','public.journeys','SELECT')
    or not has_table_privilege('customize_stops_rpc','public.journey_stops','SELECT')
    or has_table_privilege('customize_stops_rpc','public.journeys','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('customize_stops_rpc','public.journey_stops','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or (select coalesce(array_agg(attname::text order by attname),'{}') from pg_attribute where attrelid = 'public.journeys'::regclass
      and attnum > 0 and not attisdropped and has_column_privilege('customize_stops_rpc', attrelid, attnum, 'INSERT'))
      is distinct from (select array_agg(c order by c) from unnest(journey_insert_columns) c)
    or (select coalesce(array_agg(attname::text order by attname),'{}') from pg_attribute where attrelid = 'public.journeys'::regclass
      and attnum > 0 and not attisdropped and has_column_privilege('customize_stops_rpc', attrelid, attnum, 'UPDATE'))
      is distinct from array['title']
    or (select coalesce(array_agg(attname::text order by attname),'{}') from pg_attribute where attrelid = 'public.journey_stops'::regclass
      and attnum > 0 and not attisdropped and has_column_privilege('customize_stops_rpc', attrelid, attnum, 'INSERT'))
      is distinct from (select array_agg(c order by c) from unnest(stop_insert_columns) c)
    or exists(select 1 from pg_attribute where attrelid = 'public.journey_stops'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('customize_stops_rpc', attrelid, attnum, 'UPDATE')) then
    raise exception 'Customize-stops drift: execution role journey/stop privileges';
  end if;
  if (select relowner from pg_class where oid = 'private.standalone_selected_copy_receipts'::regclass) <> installer
    or not (select relrowsecurity and not relforcerowsecurity from pg_class
      where oid = 'private.standalone_selected_copy_receipts'::regclass)
    or (select coalesce(jsonb_agg(jsonb_build_array(r.rolname, a.privilege_type, a.is_grantable)
        order by r.rolname, a.privilege_type), '[]')
      from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      left join pg_roles r on r.oid = a.grantee
      where c.oid = 'private.standalone_selected_copy_receipts'::regclass and a.grantee <> c.relowner)
      is distinct from '[["customize_stops_rpc","INSERT",false],["customize_stops_rpc","SELECT",false]]'::jsonb
    or (select jsonb_agg(jsonb_build_array(attname, format_type(atttypid, atttypmod), attnotnull,
        pg_get_expr(d.adbin, d.adrelid)) order by attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'private.standalone_selected_copy_receipts'::regclass and attnum > 0 and not attisdropped)
      is distinct from '[["draft_id","uuid",true,null],["user_id","uuid",true,null],["source_id","uuid",true,null],
        ["selected_stop_ids","uuid[]",true,null],["created_at","timestamp with time zone",true,"now()"]]'::jsonb
    -- NOT NULL rows (contype 'n' on newer PostgreSQL) are covered by the column check above.
    or (select count(*) from pg_constraint where conrelid = 'private.standalone_selected_copy_receipts'::regclass
      and contype <> 'n') <> 4
    or not exists(select 1 from pg_constraint where conrelid = 'private.standalone_selected_copy_receipts'::regclass
      and contype = 'p' and conkey = array[1]::int2[])
    or not exists(select 1 from pg_constraint where conrelid = 'private.standalone_selected_copy_receipts'::regclass
      and contype = 'f' and conkey = array[2]::int2[] and confrelid = 'auth.users'::regclass and confdeltype = 'c')
    or (select count(*) from pg_constraint where conrelid = 'private.standalone_selected_copy_receipts'::regclass
      and contype = 'c' and (pg_get_constraintdef(oid) like '%cardinality(selected_stop_ids)%50%'
        or pg_get_constraintdef(oid) like '%array_ndims(selected_stop_ids) = 1%array_position(selected_stop_ids, NULL::uuid) IS NULL%')) <> 2
    or not exists(select 1 from pg_index i where i.indrelid = 'private.standalone_selected_copy_receipts'::regclass
      and i.indexrelid = to_regclass('private.standalone_copy_receipts_user_idx') and i.indkey::text = '2') then
    raise exception 'Customize-stops drift: receipts table';
  end if;
  if md5(replace(pg_get_functiondef('private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure), chr(13), ''))
      is distinct from 'b9a95cb7700305d411fc587cfee49514'
    or md5(replace(pg_get_functiondef('public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure), chr(13), ''))
      is distinct from 'bb564a93eb33c7a7d4a616048fceaa15'
    or md5(replace(pg_get_functiondef('private.customize_stops_jwt_uid()'::regprocedure), chr(13), ''))
      is distinct from '74d7f773eb11814b26f5de32e3f075cd' then
    raise exception 'Customize-stops drift: function definitions';
  end if;
  if not exists(select 1 from pg_proc where oid = 'private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure
      and proowner = 'customize_stops_rpc'::regrole and prosecdef)
    or not exists(select 1 from pg_proc where oid = 'private.customize_stops_jwt_uid()'::regprocedure
      and proowner = installer and prosecdef and provolatile = 's')
    or not exists(select 1 from pg_proc where oid = 'public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure
      and proowner = installer and not prosecdef)
    or (select coalesce(jsonb_agg(jsonb_build_array(coalesce(r.rolname, 'PUBLIC'), a.privilege_type, a.is_grantable)
        order by r.rolname), '[]')
      from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      left join pg_roles r on r.oid = a.grantee
      where f.oid = 'private.standalone_copy_journey_selected(uuid,uuid[],uuid)'::regprocedure and a.grantee <> f.proowner)
      is distinct from '[["authenticated","EXECUTE",false]]'::jsonb
    or (select coalesce(jsonb_agg(jsonb_build_array(coalesce(r.rolname, 'PUBLIC'), a.privilege_type, a.is_grantable)
        order by r.rolname), '[]')
      from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      left join pg_roles r on r.oid = a.grantee
      where f.oid = 'private.customize_stops_jwt_uid()'::regprocedure and a.grantee <> f.proowner)
      is distinct from '[["customize_stops_rpc","EXECUTE",false]]'::jsonb
    or exists(select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      left join pg_roles r on r.oid = a.grantee
      where f.oid = 'public.copy_journey_selected(uuid,uuid[],uuid)'::regprocedure and a.grantee <> f.proowner
        and (a.is_grantable or coalesce(r.rolname, 'PUBLIC') not in ('authenticated', 'service_role')))
    or not has_function_privilege('authenticated', 'public.copy_journey_selected(uuid,uuid[],uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.copy_journey_selected(uuid,uuid[],uuid)', 'EXECUTE') then
    raise exception 'Customize-stops drift: function ownership or ACL';
  end if;
  if (select jsonb_agg(to_jsonb(p) order by p.schemaname, p.tablename, p.policyname)
      from pg_policies p where 'customize_stops_rpc' = any(p.roles)
        or (p.schemaname = 'private' and p.tablename = 'standalone_selected_copy_receipts'))
    is distinct from (select jsonb_agg(value order by value->>'schemaname', value->>'tablename', value->>'policyname')
      from jsonb_array_elements(expected_policies)) then
    raise exception 'Customize-stops drift: execution-role policies';
  end if;

  if created then
    raise notice 'SUCCESS_CREATED: customize-stops objects created and verified';
  else
    raise notice 'SUCCESS_NOOP: verified existing customize-stops objects; nothing changed';
  end if;
end
$capture$;
commit;
