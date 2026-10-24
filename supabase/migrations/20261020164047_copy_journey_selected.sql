begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Depends on 20261005010000_rpc_integrity_hardening.sql. Never restore client
-- table writes or the retired copy_media_path helper to support this RPC.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'journey_rpc'
    and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole)
    or to_regprocedure('private.copy_authorized_media(uuid,text)') is null then
    raise exception 'RPC integrity hardening must be installed before selected copying';
  end if;
  if pg_has_role('authenticated','journey_rpc','MEMBER') or pg_has_role('anon','journey_rpc','MEMBER')
    or exists (select 1 from pg_class where oid in ('public.journeys'::regclass,
      'public.journey_stops'::regclass) and (not relrowsecurity or relowner = 'journey_rpc'::regrole)) then
    raise exception 'Unexpected RPC role or RLS configuration';
  end if;
end $$;

-- Receipts deliberately have no journey/source FK: deletion must not turn a
-- lost response into a second copy. Only user deletion removes these records.
create table private.selected_copy_requests (
  draft_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null,
  selected_stop_ids uuid[] not null,
  created_at timestamptz not null default now(),
  check (cardinality(selected_stop_ids) between 1 and 50),
  check (array_ndims(selected_stop_ids) = 1 and array_position(selected_stop_ids, null) is null)
);
create index selected_copy_requests_user_idx on private.selected_copy_requests(user_id);
alter table private.selected_copy_requests enable row level security;
revoke all on private.selected_copy_requests from public, anon, authenticated;
grant select, insert on private.selected_copy_requests to journey_rpc;
create policy selected_copy_requests_rpc_read on private.selected_copy_requests
  for select to journey_rpc using (user_id = (select auth.uid()));
create policy selected_copy_requests_rpc_insert on private.selected_copy_requests
  for insert to journey_rpc with check (user_id = (select auth.uid()));

-- The implementation lives outside the exposed schema. Its owner is the
-- existing NOLOGIN/NOBYPASSRLS role, not a table owner or privileged admin.
-- Client roles cannot fabricate receipts, media capabilities or journey rows.
create function private.copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)
returns uuid language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  uid uuid := (select auth.uid());
  request_ids uuid[];
  receipt private.selected_copy_requests%rowtype;
  source jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if source_id is null or draft_id is null or draft_id = source_id
    or selected_stop_ids is null or cardinality(selected_stop_ids) not between 1 and 50
    or array_ndims(selected_stop_ids) <> 1 or array_position(selected_stop_ids, null) is not null
    or (select count(distinct id) from unnest(selected_stop_ids) id) <> cardinality(selected_stop_ids)
    then raise exception 'Invalid selected stops' using errcode = '22023'; end if;
  select array_agg(id order by id) into request_ids from unnest(selected_stop_ids) id;

  -- A bounded transaction lock serializes simultaneous requests for this UUID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(draft_id::text, 0));
  select r.* into receipt from private.selected_copy_requests r
    where r.draft_id = copy_journey_selected.draft_id;
  if found then
    if receipt.user_id <> uid or receipt.source_id <> source_id or receipt.selected_stop_ids <> request_ids then
      raise exception 'Copy request does not match its original selection' using errcode = '22023';
    end if;
    -- Return edited/published copies without writing. If either side was
    -- deleted (source deletion clears attribution), never recreate the copy.
    if not exists (select 1 from public.journeys j where j.id = draft_id and j.user_id = uid
      and j.copied_from_journey_id = source_id) then
      raise exception 'Previous copy is no longer available; check your journeys' using errcode = 'P0002';
    end if;
    return draft_id;
  end if;

  -- Save locks the same parent before replacing children. Take that lock before
  -- snapshotting metadata/stops/media so an edit cannot produce a mixed copy.
  perform 1 from public.journeys j where j.id = source_id and j.status = 'published' and not j.is_demo for share;
  if not found then raise exception 'Published journey not found' using errcode = 'P0002'; end if;
  select to_jsonb(j) || jsonb_build_object('stops', coalesce((
    select jsonb_agg(to_jsonb(s) order by s.sequence, s.id) from public.journey_stops s
    where s.journey_id = j.id and s.id = any(request_ids)), '[]'::jsonb)) into source
  from public.journeys j where j.id = source_id and j.status = 'published' and not j.is_demo;
  if not found then raise exception 'Published journey not found' using errcode = 'P0002'; end if;
  if jsonb_array_length(source->'stops') <> cardinality(request_ids) then
    raise exception 'Selection contains unavailable stops' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(source->'stops') as s(latitude double precision, longitude double precision)
    where latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180) then
    raise exception 'Selected stops require valid coordinates' using errcode = '22023';
  end if;

  -- Invisible foreign receipt/journey UUID collisions fail atomically too.
  insert into private.selected_copy_requests(draft_id, user_id, source_id, selected_stop_ids)
    values(draft_id, uid, source_id, request_ids);
  insert into public.journeys(id,user_id,title,description,destination_slug,destination_name,
    destination_latitude,destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)
  values(draft_id,uid,source->>'title',source->>'description',source->>'destination_slug',source->>'destination_name',
    (source->>'destination_latitude')::double precision,(source->>'destination_longitude')::double precision,
    source->>'traveler_type',(source->>'duration_days')::integer,
    private.copy_authorized_media(source_id,source->>'cover_image_path'),false,source_id);
  insert into public.journey_stops(journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
  select draft_id,number::integer,value->>'name',value->>'description',(value->>'latitude')::double precision,
    (value->>'longitude')::double precision,value->>'mapbox_place_id',
    private.copy_authorized_media(source_id,value->>'photo_path'),(value->>'rating')::numeric,(value->>'day_number')::integer
  from jsonb_array_elements(source->'stops') with ordinality as selected(value,number) order by number;
  insert into private.journey_media_authorizations(journey_id,media_path)
    select draft_id, cover_image_path from public.journeys where id = draft_id and cover_image_path is not null
    union select draft_id, photo_path from public.journey_stops where journey_id = draft_id and photo_path is not null;
  -- Share the hardened editor's complete validation and media retention rules.
  perform public.save_journey(to_jsonb(j) || jsonb_build_object('stops', coalesce((
    select jsonb_agg(to_jsonb(s) order by s.sequence) from public.journey_stops s where s.journey_id = draft_id), '[]'::jsonb)))
    from public.journeys j where j.id = draft_id;
  return draft_id;
exception
  when deadlock_detected or lock_not_available then
    raise exception 'Journey busy; check drafts before retrying' using errcode = '40001';
  when unique_violation then
    raise exception 'Copy request conflicts with an existing request' using errcode = '22023';
  when check_violation or not_null_violation or numeric_value_out_of_range then
    raise exception 'Source journey needs repair before copying' using errcode = '22023';
end;
$$;
revoke all on function private.copy_journey_selected(uuid,uuid[],uuid) from public, anon, authenticated;
grant journey_rpc to current_user;
grant create on schema private to journey_rpc;
alter function private.copy_journey_selected(uuid,uuid[],uuid) owner to journey_rpc;
revoke create on schema private from journey_rpc;
revoke journey_rpc from current_user;
-- Direct private invocation has the exact same bounded authorization contract.
grant execute on function private.copy_journey_selected(uuid,uuid[],uuid) to authenticated;

create function public.copy_journey_selected(source_id uuid, selected_stop_ids uuid[], draft_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.copy_journey_selected(source_id,selected_stop_ids,draft_id);
$$;
revoke all on function public.copy_journey_selected(uuid,uuid[],uuid) from public, anon;
grant execute on function public.copy_journey_selected(uuid,uuid[],uuid) to authenticated;
commit;
