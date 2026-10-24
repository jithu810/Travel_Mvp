-- FULL REPLACEMENT: authenticated EXECUTE is granted while the migration role
-- still owns the private function, before ownership/membership are transferred.
-- Use this file instead of the failed standalone file, not as a follow-up patch.
-- ALTERNATIVE to the October-5 hardening + October-20 selected-copy proposal.
-- Requires the reviewed core schema through October 4, not those migrations.
-- Deliberately omitted from the repository's default migration directory.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';
do $$ begin
  if to_regprocedure('public.copy_journey_selected(uuid,uuid[],uuid)') is not null
    or to_regclass('private.journey_media_authorizations') is not null
    or to_regclass('private.standalone_selected_copy_receipts') is not null then
    raise exception 'Selected-copy/hardened objects already exist; choose one reviewed alternative';
  end if;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
    or exists(select 1 from pg_class c join pg_roles r on r.oid=c.relowner
      where c.oid in ('public.journeys'::regclass,'public.journey_stops'::regclass)
        and (not c.relrowsecurity or r.rolname in ('anon','authenticated'))) then
    raise exception 'Unexpected client RLS bypass or table ownership';
  end if;
end $$;

-- This new role is not inherited by clients and owns no application table.
-- An existing same-name role is a collision, never silently adopted.
create role customize_stops_rpc nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public, private, auth to customize_stops_rpc;
grant execute on function auth.uid() to customize_stops_rpc;
grant select on public.journeys, public.journey_stops to customize_stops_rpc;
grant insert (id,user_id,title,description,destination_slug,destination_name,destination_latitude,
  destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)
  on public.journeys to customize_stops_rpc;
grant insert (journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
  on public.journey_stops to customize_stops_rpc;
-- PostgreSQL locking SELECT needs an UPDATE grant and UPDATE-row visibility.
-- The RPC contains no UPDATE statement; foreign-owner UPDATE WITH CHECK fails.
grant update (title) on public.journeys to customize_stops_rpc;
create policy standalone_copy_read on public.journeys for select to customize_stops_rpc
  using (status='published' or user_id=(select auth.uid()));
create policy standalone_copy_insert on public.journeys for insert to customize_stops_rpc
  with check (user_id=(select auth.uid()) and status='draft' and not is_demo);
create policy standalone_copy_lock on public.journeys for update to customize_stops_rpc
  using (status='published' or user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy standalone_copy_stops_read on public.journey_stops for select to customize_stops_rpc
  using (exists(select 1 from public.journeys j where j.id=journey_id));
create policy standalone_copy_stops_insert on public.journey_stops for insert to customize_stops_rpc
  with check (exists(select 1 from public.journeys j where j.id=journey_id
    and j.user_id=(select auth.uid()) and j.status='draft' and not j.is_demo));

create table private.standalone_selected_copy_receipts (
  draft_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  selected_stop_ids uuid[] not null,
  created_at timestamptz not null default now(),
  check (cardinality(selected_stop_ids) between 1 and 50),
  check (array_ndims(selected_stop_ids)=1 and array_position(selected_stop_ids,null) is null)
);
create index standalone_copy_receipts_user_idx on private.standalone_selected_copy_receipts(user_id);
alter table private.standalone_selected_copy_receipts enable row level security;
revoke all on private.standalone_selected_copy_receipts from public,anon,authenticated;
grant select,insert on private.standalone_selected_copy_receipts to customize_stops_rpc;
create policy standalone_copy_receipts_read on private.standalone_selected_copy_receipts
  for select to customize_stops_rpc using (user_id=(select auth.uid()));
create policy standalone_copy_receipts_insert on private.standalone_selected_copy_receipts
  for insert to customize_stops_rpc with check (user_id=(select auth.uid()));

create function private.standalone_copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)
returns uuid language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  uid uuid := (select auth.uid());
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
$$;
revoke all on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function private.standalone_copy_journey_selected(uuid,uuid[],uuid) to authenticated;
grant customize_stops_rpc to current_user;
grant create on schema private to customize_stops_rpc;
alter function private.standalone_copy_journey_selected(uuid,uuid[],uuid) owner to customize_stops_rpc;
revoke create on schema private from customize_stops_rpc;
revoke customize_stops_rpc from current_user;
create function public.copy_journey_selected(source_id uuid,selected_stop_ids uuid[],draft_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.standalone_copy_journey_selected(source_id,selected_stop_ids,draft_id);
$$;
revoke all on function public.copy_journey_selected(uuid,uuid[],uuid) from public,anon;
grant execute on function public.copy_journey_selected(uuid,uuid[],uuid) to authenticated;
commit;
