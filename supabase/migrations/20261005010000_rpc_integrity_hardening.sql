begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';
-- Freeze client writes before inventory verification and capability seeding.
lock table public.journeys, public.journey_stops in share row exclusive mode;

-- Abort without modifying data if historical references cannot be authenticated.
do $$ begin
  if exists (select 1 from private.legacy_journey_media_inventory i
    where not i.owned_existing_upload and not exists (
      select 1 from private.legacy_journey_media_approvals a
      where a.journey_id = i.journey_id and a.media_path = i.media_path)) then
    raise exception 'Legacy media review required: inspect private.legacy_journey_media_inventory';
  end if;
  if exists (select 1 from private.legacy_journey_media_inventory where
    length(media_path) > 2000 or not (
      starts_with(media_path, 'journey-media/') or media_path ~ '^/images/[^?#]+$'
      or (media_path ~ '^https://' and media_path !~* '/storage/|/object/|[?#]|@'))) then
    raise exception 'Unsupported legacy media: review and repair before activation';
  end if;
  -- Match save's destination fallback exactly, including legacy named places.
  -- Reject rather than silently repairing historical user metadata.
  if exists (select 1 from public.journeys j where
    coalesce(j.traveler_type,'') not in ('solo','couple','friends','family')
    or case when j.destination_name is not null then
      length(trim(j.destination_name)) not between 1 and 200
      or j.destination_latitude is null or j.destination_longitude is null
      or j.destination_latitude not between -90 and 90
      or j.destination_longitude not between -180 and 180
      or coalesce(j.destination_slug,'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or length(j.destination_slug) > 200
    else coalesce(j.destination_slug,'') not in ('goa','varkala','munnar','kochi','thenkasi') end) then
    raise exception 'Legacy journey metadata review required: destination/traveler must satisfy save and copy';
  end if;
  if exists (select 1 from public.journeys j where not isfinite(j.updated_at)
    or (select count(*) from public.journey_stops s where s.journey_id=j.id) > 50
    or (j.status='published' and not exists(select 1 from public.journey_stops s where s.journey_id=j.id))
    or exists (select 1 from (select s.*, row_number() over(order by sequence) as expected
      from public.journey_stops s where s.journey_id=j.id) s
      where s.sequence <> s.expected or s.day_number > j.duration_days
        or (j.status='published' and (s.latitude is null or s.longitude is null)))) then
    raise exception 'Legacy journey integrity review required: run supabase/audits/backend_integrity.sql';
  end if;
end $$;

-- This role is not a table owner and cannot bypass RLS or be assumed by clients.
create role journey_rpc nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
-- Permit ownership transfer by a CREATEROLE migration administrator that is not
-- superuser. This temporary membership is removed before commit.
grant journey_rpc to current_user;
grant usage on schema public, private, auth, storage to journey_rpc;
grant execute on function auth.uid() to journey_rpc;
grant select on public.journeys, public.journey_stops to journey_rpc;
grant insert (id,user_id,title,description,destination_slug,destination_name,destination_latitude,
  destination_longitude,traveler_type,duration_days,cover_image_path,status,published_at,is_demo,copied_from_journey_id)
  on public.journeys to journey_rpc;
grant update (title,description,destination_slug,destination_name,destination_latitude,destination_longitude,
  traveler_type,duration_days,cover_image_path,status,published_at) on public.journeys to journey_rpc;
grant insert (id,journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
  on public.journey_stops to journey_rpc;
grant delete on public.journey_stops to journey_rpc;
grant select (bucket_id,name) on storage.objects to journey_rpc;

create policy journeys_rpc_read on public.journeys for select to journey_rpc
  using (user_id = (select auth.uid()) or status = 'published');
create policy journeys_rpc_insert on public.journeys for insert to journey_rpc
  with check (user_id = (select auth.uid()) and not is_demo);
create policy journeys_rpc_update on public.journeys for update to journey_rpc
  -- SELECT FOR SHARE also needs UPDATE visibility. WITH CHECK prevents writes to
  -- another owner's published row; user_id has no UPDATE grant.
  using (user_id = (select auth.uid()) or status = 'published')
  with check (user_id = (select auth.uid()));
create policy stops_rpc_read on public.journey_stops for select to journey_rpc using (
  exists (select 1 from public.journeys j where j.id = journey_id));
create policy stops_rpc_insert on public.journey_stops for insert to journey_rpc with check (
  exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid())));
create policy stops_rpc_delete on public.journey_stops for delete to journey_rpc using (
  exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid())));

-- Authorized paths are capabilities scoped to a journey, never arbitrary object IDs.
create table private.journey_media_authorizations (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  media_path text not null check (length(media_path) <= 2000),
  primary key (journey_id, media_path)
);
revoke all on private.journey_media_authorizations from public, anon, authenticated;
alter table private.journey_media_authorizations enable row level security;
grant select, insert, delete on private.journey_media_authorizations to journey_rpc;
create policy media_rpc_read on private.journey_media_authorizations for select to journey_rpc using (
  exists (select 1 from public.journeys j where j.id = journey_id));
create policy media_rpc_insert on private.journey_media_authorizations for insert to journey_rpc with check (
  exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid())));
create policy media_rpc_delete on private.journey_media_authorizations for delete to journey_rpc using (
  exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid())));
insert into private.journey_media_authorizations select journey_id, media_path
  from private.legacy_journey_media_inventory;

-- Boolean projection for Storage RLS; executes as the RLS-bound RPC role.
create function private.journey_media_readable(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.journey_media_authorizations a join public.journeys j on j.id = a.journey_id
    where a.media_path = 'journey-media/' || object_name
      and (j.status = 'published' or j.user_id = (select auth.uid()))
      and (j.cover_image_path = a.media_path or exists (
        select 1 from public.journey_stops s where s.journey_id = j.id and s.photo_path = a.media_path)));
$$;
-- Ownership is transferred to the non-owner execution role before commit.
revoke all on function private.journey_media_readable(text) from public;
grant execute on function private.journey_media_readable(text) to anon, authenticated, journey_rpc;
drop policy journey_media_read on storage.objects;
create policy journey_media_read on storage.objects for select to anon, authenticated, journey_rpc using (
  bucket_id = 'journey-media' and (split_part(name,'/',1) = (select auth.uid())::text
    or private.journey_media_readable(name)));

-- Add then validate ordinary row-local constraints. Invalid legacy rows abort
-- activation without repairs or data loss; the separate audit identifies them.
alter table public.journeys add constraint journeys_description_length
  check (length(coalesce(description,'')) <= 5000) not valid,
  add constraint journeys_cover_length check (length(cover_image_path) <= 2000) not valid,
  add constraint journeys_version_finite check (isfinite(updated_at)) not valid,
  add constraint journeys_destination_name_length check (length(destination_name) <= 200) not valid,
  add constraint journeys_destination_pair check ((destination_latitude is null) = (destination_longitude is null)) not valid;
alter table public.journey_stops add constraint stops_description_length
  check (length(coalesce(description,'')) <= 1000) not valid,
  add constraint stops_place_length check (length(mapbox_place_id) <= 500) not valid,
  add constraint stops_photo_length check (length(photo_path) <= 2000) not valid,
  add constraint stops_sequence_positive check (sequence >= 1) not valid;
alter table public.journeys validate constraint journeys_description_length,
  validate constraint journeys_cover_length, validate constraint journeys_version_finite,
  validate constraint journeys_destination_name_length, validate constraint journeys_destination_pair;
alter table public.journey_stops validate constraint stops_description_length,
  validate constraint stops_place_length, validate constraint stops_photo_length,
  validate constraint stops_sequence_positive;

-- Version remains a full-precision timestamptz for old Web/Mobile clients.
create function private.advance_journey_version() returns trigger
language plpgsql set search_path = '' as $$ begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;
revoke all on function private.advance_journey_version() from public, anon, authenticated;
drop trigger journeys_updated_at on public.journeys;
create trigger journeys_updated_at before update on public.journeys
  for each row execute function private.advance_journey_version();

-- Remove all client mutation policies, retaining owner-authorized parent DELETE.
drop policy journeys_insert_own on public.journeys;
drop policy journeys_update_own on public.journeys;
drop policy journey_stops_insert_own on public.journey_stops;
drop policy journey_stops_update_own on public.journey_stops;
drop policy journey_stops_delete_own on public.journey_stops;
revoke insert, update, delete, truncate, references, trigger on public.journeys, public.journey_stops
  from public, anon, authenticated;
grant delete on public.journeys to authenticated;

-- Names are not security evidence. Recreate every retained client policy with
-- approved command, roles, permissiveness and expressions in this transaction.
-- Unknown additional policies are still rejected by the final activation gate.
drop policy if exists journeys_read on public.journeys;
create policy journeys_read on public.journeys for select to anon, authenticated
  using (status = 'published' or user_id = (select auth.uid()));
drop policy if exists journeys_delete_own on public.journeys;
create policy journeys_delete_own on public.journeys for delete to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists journey_stops_read on public.journey_stops;
create policy journey_stops_read on public.journey_stops for select to anon, authenticated using (
  exists (select 1 from public.journeys j where j.id = journey_id
    and (j.status = 'published' or j.user_id = (select auth.uid()))));
drop policy if exists journey_media_insert on storage.objects;
create policy journey_media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'journey-media' and split_part(name,'/',1) = (select auth.uid())::text
  and exists(select 1 from public.journeys j where j.id::text = split_part(name,'/',2)
    and j.user_id = (select auth.uid())));
drop policy if exists profile_avatars_read on storage.objects;
create policy profile_avatars_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'profile-avatars' and (split_part(name,'/',1) = (select auth.uid())::text
    or private.avatar_referenced(name)));
drop policy if exists profile_avatars_insert on storage.objects;
create policy profile_avatars_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'profile-avatars' and split_part(name,'/',1) = (select auth.uid())::text);

-- Also revoke column grants (table REVOKE does not revoke these).
do $$ declare t text; c text; begin
  foreach t in array array['journeys','journey_stops'] loop
    select string_agg(quote_ident(attname), ',') into c from pg_attribute
      where attrelid = ('public.' || t)::regclass and attnum > 0 and not attisdropped;
    execute format('revoke insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',c,c,c,t);
  end loop;
end $$;

create or replace function public.save_journey(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  jid uuid;
  uid uuid := (select auth.uid());
  current_row public.journeys%rowtype;
  item jsonb;
  media text;
  old_photos text[];
  desired_status text;
  saved_at timestamptz;
  dest_name text;
  dest_lat double precision;
  dest_lng double precision;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid journey' using errcode = '22023'; end if;
  jid := (payload->>'id')::uuid;
  desired_status := payload->>'status';
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(payload->'title') is distinct from 'string'
    or jsonb_typeof(payload->'duration_days') is distinct from 'number'
    or (payload->>'description' is not null and jsonb_typeof(payload->'description') <> 'string')
    or (payload->>'cover_image_path' is not null and jsonb_typeof(payload->'cover_image_path') <> 'string')
    or (payload->>'destination_name' is not null and jsonb_typeof(payload->'destination_name') <> 'string')
    then raise exception 'Invalid journey' using errcode = '22023'; end if;
  if jid is null or coalesce(desired_status,'') not in ('draft','published') or coalesce(length(trim(payload->>'title')),0) not between 1 and 200
    or coalesce(payload->>'traveler_type','') not in ('solo','couple','friends','family')
    or coalesce((payload->>'duration_days')::integer,0) not between 1 and 365 or length(coalesce(payload->>'description','')) > 5000
    or jsonb_typeof(payload->'stops') is distinct from 'array' then raise exception 'Invalid journey' using errcode = '22023'; end if;
  select name,lat,lng into dest_name,dest_lat,dest_lng from (values
    ('goa','Goa',15.49,73.83),('varkala','Varkala',8.74,76.72),('munnar','Munnar',10.09,77.06),('kochi','Kochi',9.97,76.28),('thenkasi','Thenkasi',8.96,77.31)
  ) as d(slug,name,lat,lng) where slug = payload->>'destination_slug';
  -- Reuse the existing destination columns for worldwide search results.
  if payload->>'destination_name' is not null then
    dest_name := trim(payload->>'destination_name');
    dest_lat := (payload->>'destination_latitude')::double precision;
    dest_lng := (payload->>'destination_longitude')::double precision;
    if length(dest_name) not between 1 and 200 or dest_lat is null or dest_lng is null
      or dest_lat not between -90 and 90 or dest_lng not between -180 and 180
      or coalesce(payload->>'destination_slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or length(payload->>'destination_slug') > 200 then
      raise exception 'Invalid destination' using errcode = '22023';
    end if;
  elsif dest_name is null then raise exception 'Invalid destination' using errcode = '22023'; end if;
  if jsonb_array_length(payload->'stops') > 50 or (desired_status = 'published' and jsonb_array_length(payload->'stops') = 0) then raise exception 'Invalid stop count' using errcode = '22023'; end if;
  if (select count(distinct s->>'id') from jsonb_array_elements(payload->'stops') s) <> jsonb_array_length(payload->'stops') then raise exception 'Duplicate stops' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(payload->'stops') loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'sequence') is distinct from 'number'
      or (item->>'photo_path' is not null and jsonb_typeof(item->'photo_path') <> 'string')
      or (item->>'description' is not null and jsonb_typeof(item->'description') <> 'string') or length(coalesce(item->>'mapbox_place_id','')) > 500 or coalesce(length(trim(item->>'name')),0) not between 1 and 200 or (item->>'id')::uuid is null or length(coalesce(item->>'description','')) > 1000
      or (item->>'sequence')::integer is null or coalesce((item->>'latitude')::double precision,0) not between -90 and 90
      or coalesce((item->>'longitude')::double precision,0) not between -180 and 180
      or ((item->>'latitude') is null) <> ((item->>'longitude') is null) or (desired_status = 'published' and (item->>'latitude') is null)
      or ((item->>'rating') is not null and (item->>'rating')::numeric not between 0 and 5)
      or ((item->>'day_number') is not null and (item->>'day_number')::integer not between 1 and (payload->>'duration_days')::integer)
      then raise exception 'Invalid stop' using errcode = '22023'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(payload->'stops') with ordinality as s(value,number) where (value->>'sequence')::integer <> number) then raise exception 'Invalid sequence' using errcode = '22023'; end if;
  select * into current_row from public.journeys where id = jid and user_id = uid for update;
  if found then
    if (payload->>'updated_at')::timestamptz is distinct from current_row.updated_at then raise exception 'Draft changed; reload before saving' using errcode = '40001'; end if;
    select array_agg(photo_path) into old_photos from public.journey_stops where journey_id = jid;
  else
    if payload->>'updated_at' is not null then
      raise exception 'Draft changed; reload before saving' using errcode = '40001';
    end if;
    insert into public.journeys(id,user_id,title,description,destination_slug,destination_name,
      destination_latitude,destination_longitude,traveler_type,duration_days)
    values(jid,uid,trim(payload->>'title'),payload->>'description',payload->>'destination_slug',
      dest_name,dest_lat,dest_lng,payload->>'traveler_type',(payload->>'duration_days')::integer);
  end if;
  for media in select payload->>'cover_image_path' union all select value->>'photo_path' from jsonb_array_elements(payload->'stops') loop
    if media is not null then
      if length(media) > 2000 then raise exception 'Invalid image reference' using errcode = '22023'; end if;
      if not exists(select 1 from private.journey_media_authorizations a where a.journey_id = jid and a.media_path = media)
        or (media is distinct from current_row.cover_image_path and not coalesce(media = any(old_photos),false)) then
        if not starts_with(media,'journey-media/' || uid::text || '/' || jid::text || '/')
          or not exists(select 1 from storage.objects where bucket_id = 'journey-media' and name = substr(media,15)) then
          raise exception 'Invalid image reference' using errcode = '22023';
        end if;
      end if;
      insert into private.journey_media_authorizations(journey_id,media_path) values(jid,media) on conflict do nothing;
    end if;
  end loop;
  update public.journeys set title = trim(payload->>'title'),description = payload->>'description',
    destination_slug = payload->>'destination_slug',destination_name = dest_name,destination_latitude = dest_lat,destination_longitude = dest_lng,
    traveler_type = payload->>'traveler_type',duration_days = (payload->>'duration_days')::integer,cover_image_path = payload->>'cover_image_path',status = desired_status,
    published_at = case when desired_status = 'published' then coalesce(current_row.published_at,now()) else null end
    where id = jid and user_id = uid returning updated_at into saved_at;
  delete from public.journey_stops where journey_id = jid;
  insert into public.journey_stops(id,journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
    select id,jid,sequence,trim(name),description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number
    from jsonb_to_recordset(payload->'stops') as s(id uuid,sequence integer,name text,description text,latitude double precision,longitude double precision,mapbox_place_id text,photo_path text,rating numeric,day_number integer);
  delete from private.journey_media_authorizations a where a.journey_id = jid
    and a.media_path is distinct from (payload->>'cover_image_path')
    and not exists(select 1 from jsonb_array_elements(payload->'stops') s where s->>'photo_path' = a.media_path);
  return jsonb_build_object('id',jid,'status',desired_status,'updated_at',saved_at);
exception
  when deadlock_detected or lock_not_available then
    raise exception 'Journey busy; reload before saving' using errcode = '40001';
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow
    or invalid_datetime_format or check_violation or not_null_violation then
    raise exception 'Invalid journey data' using errcode = '22023';
end;
$$;
revoke all on function public.save_journey(jsonb) from public,anon;
grant execute on function public.save_journey(jsonb) to authenticated;


create function private.copy_authorized_media(source_id uuid, media text) returns text
language sql stable security invoker set search_path = '' as $$
  select case when media is not null and exists (
    select 1 from private.journey_media_authorizations a join public.journeys j on j.id = a.journey_id
    where a.journey_id = source_id and a.media_path = media and j.status = 'published'
      and (j.cover_image_path = media or exists(select 1 from public.journey_stops s
        where s.journey_id = source_id and s.photo_path = media))) then
    case when starts_with(media,'journey-media/') then
      case when exists(select 1 from storage.objects where bucket_id = 'journey-media' and name = substr(media,15)) then media end
    when media ~ '^/images/[^?#]+$' then media
    when media ~ '^https://' and media !~* '/storage/|/object/|[?#]|@' then media end
  end;
$$;
revoke all on function private.copy_authorized_media(uuid,text) from public, anon, authenticated;
grant execute on function private.copy_authorized_media(uuid,text) to journey_rpc;
-- Retire the formerly client-callable existence helper.
revoke all on function private.copy_media_path(text) from public, anon, authenticated;
create or replace function public.copy_journey(source_id uuid)
returns uuid language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare new_id uuid; source jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  -- Lock before snapshotting parent + children. Save takes the same parent lock.
  perform 1 from public.journeys where id = source_id and status = 'published' for share;
  if not found then raise exception 'Journey not found' using errcode = 'P0002'; end if;
  select to_jsonb(j) || jsonb_build_object('stops',coalesce((select jsonb_agg(to_jsonb(s) order by s.sequence) from public.journey_stops s where s.journey_id = j.id),'[]'::jsonb))
    into source from public.journeys j where j.id = source_id and j.status = 'published';
  if not found then raise exception 'Journey not found' using errcode = 'P0002'; end if;
  insert into public.journeys(user_id,title,description,destination_slug,destination_name,destination_latitude,destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)
    values((select auth.uid()),source->>'title',source->>'description',source->>'destination_slug',source->>'destination_name',(source->>'destination_latitude')::double precision,(source->>'destination_longitude')::double precision,source->>'traveler_type',(source->>'duration_days')::integer,private.copy_authorized_media(source_id,source->>'cover_image_path'),false,source_id)
    returning id into new_id;
  insert into public.journey_stops(journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
    select new_id,sequence,name,description,latitude,longitude,mapbox_place_id,private.copy_authorized_media(source_id,photo_path),rating,day_number
    from jsonb_to_recordset(source->'stops') as s(sequence integer,name text,description text,latitude double precision,longitude double precision,mapbox_place_id text,photo_path text,rating numeric,day_number integer) order by sequence;
  insert into private.journey_media_authorizations(journey_id,media_path)
    select new_id, cover_image_path from public.journeys where id = new_id and cover_image_path is not null
    union select new_id, photo_path from public.journey_stops where journey_id = new_id and photo_path is not null;
  -- Apply the same complete validation as save, including legacy source bounds.
  perform public.save_journey(to_jsonb(j) || jsonb_build_object('stops', coalesce((
    select jsonb_agg(to_jsonb(s) order by s.sequence) from public.journey_stops s where s.journey_id = new_id), '[]'::jsonb)))
    from public.journeys j where j.id = new_id;
  return new_id;
exception
  when deadlock_detected or lock_not_available then
    raise exception 'Journey busy; check drafts before retrying' using errcode = '40001';
  when check_violation or not_null_violation or numeric_value_out_of_range then
    raise exception 'Source journey needs repair before copying' using errcode = '22023';
end;
$$;


-- Ownership transfer requires temporary CREATE, removed before commit.
grant create on schema public, private to journey_rpc;
alter function public.save_journey(jsonb) owner to journey_rpc;
alter function public.copy_journey(uuid) owner to journey_rpc;
alter function private.copy_authorized_media(uuid,text) owner to journey_rpc;
alter function private.journey_media_readable(text) owner to journey_rpc;
revoke create on schema public, private from journey_rpc;
revoke all on function public.save_journey(jsonb), public.copy_journey(uuid) from public, anon;
grant execute on function public.save_journey(jsonb), public.copy_journey(uuid) to authenticated;

-- Fail rather than silently accepting privileges inherited from unexpected roles.
do $$ begin
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
    or exists(select 1 from pg_class where oid in ('public.journeys'::regclass,
      'public.journey_stops'::regclass,'storage.objects'::regclass) and not relrowsecurity)
    or exists(select 1 from pg_class c join pg_roles r on r.oid=c.relowner
      where c.oid in ('public.journeys'::regclass,'public.journey_stops'::regclass,'storage.objects'::regclass)
        and r.rolname in ('anon','authenticated','journey_rpc')) then
    raise exception 'Unexpected RLS bypass or table ownership: audit backend roles';
  end if;
  if exists(select 1 from pg_policies where
    (schemaname='public' and tablename='journeys' and policyname not in
      ('journeys_read','journeys_delete_own','journeys_rpc_read','journeys_rpc_insert','journeys_rpc_update'))
    or (schemaname='public' and tablename='journey_stops' and policyname not in
      ('journey_stops_read','stops_rpc_read','stops_rpc_insert','stops_rpc_delete'))
    or (schemaname='storage' and tablename='objects' and policyname not in
      ('journey_media_read','journey_media_insert','profile_avatars_read','profile_avatars_insert'))) then
    raise exception 'Unexpected policies: independent policy review required before activation';
  end if;
  if has_table_privilege('anon','public.journeys','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    or has_table_privilege('authenticated','public.journeys','INSERT,UPDATE,TRUNCATE,TRIGGER,REFERENCES')
    or has_table_privilege('anon','public.journey_stops','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    or has_table_privilege('authenticated','public.journey_stops','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    or has_any_column_privilege('authenticated','public.journeys','INSERT,UPDATE')
    or has_any_column_privilege('authenticated','public.journey_stops','INSERT,UPDATE')
    or has_any_column_privilege('anon','public.journeys','INSERT,UPDATE')
    or has_any_column_privilege('anon','public.journey_stops','INSERT,UPDATE')
    or pg_has_role('authenticated','journey_rpc','MEMBER') or pg_has_role('anon','journey_rpc','MEMBER') then
    raise exception 'Unexpected inherited client mutation privileges: audit role memberships';
  end if;
end $$;
revoke journey_rpc from current_user;
commit;
