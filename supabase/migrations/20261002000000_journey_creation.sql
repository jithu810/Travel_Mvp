begin;
alter table public.journeys add column destination_name text,
  add column destination_latitude double precision check (destination_latitude between -90 and 90),
  add column destination_longitude double precision check (destination_longitude between -180 and 180);
update public.journeys set destination_name = case destination_slug when 'goa' then 'Goa' when 'varkala' then 'Varkala' when 'munnar' then 'Munnar' when 'kochi' then 'Kochi' when 'thenkasi' then 'Thenkasi' end,
  destination_latitude = case destination_slug when 'goa' then 15.49 when 'varkala' then 8.74 when 'munnar' then 10.09 when 'kochi' then 9.97 when 'thenkasi' then 8.96 end,
  destination_longitude = case destination_slug when 'goa' then 73.83 when 'varkala' then 76.72 when 'munnar' then 77.06 when 'kochi' then 76.28 when 'thenkasi' then 77.31 end;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('journey-media','journey-media',false,4194304,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false,file_size_limit = excluded.file_size_limit,allowed_mime_types = excluded.allowed_mime_types;
create policy journey_media_read on storage.objects for select to anon,authenticated using (
  bucket_id = 'journey-media' and (
    split_part(name,'/',1) = (select auth.uid())::text
    or exists(select 1 from public.journeys j where j.cover_image_path = 'journey-media/' || objects.name and (j.status = 'published' or j.user_id = (select auth.uid())))
    or exists(select 1 from public.journey_stops s join public.journeys j on j.id = s.journey_id where s.photo_path = 'journey-media/' || objects.name and (j.status = 'published' or j.user_id = (select auth.uid())))
  )
);
create policy journey_media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'journey-media' and split_part(name,'/',1) = (select auth.uid())::text
  and exists(select 1 from public.journeys j where j.id::text = split_part(name,'/',2) and j.user_id = (select auth.uid()) and j.status = 'draft')
);
-- Objects are immutable. Replacement uploads use a new name; copies retain media.
create function public.save_journey(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  jid uuid := (payload->>'id')::uuid;
  uid uuid := (select auth.uid());
  current_row public.journeys%rowtype;
  item jsonb;
  media text;
  old_photos text[];
  desired_status text := payload->>'status';
  saved_at timestamptz;
  dest_name text;
  dest_lat double precision;
  dest_lng double precision;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jid is null or coalesce(desired_status,'') not in ('draft','published') or coalesce(length(trim(payload->>'title')),0) not between 1 and 200
    or coalesce(payload->>'traveler_type','') not in ('solo','couple','friends','family')
    or coalesce((payload->>'duration_days')::integer,0) not between 1 and 365 or length(coalesce(payload->>'description','')) > 5000
    or jsonb_typeof(payload->'stops') is distinct from 'array' then raise exception 'Invalid journey' using errcode = '22023'; end if;
  select name,lat,lng into dest_name,dest_lat,dest_lng from (values
    ('goa','Goa',15.49,73.83),('varkala','Varkala',8.74,76.72),('munnar','Munnar',10.09,77.06),('kochi','Kochi',9.97,76.28),('thenkasi','Thenkasi',8.96,77.31)
  ) as d(slug,name,lat,lng) where slug = payload->>'destination_slug';
  if not found then raise exception 'Invalid destination' using errcode = '22023'; end if;
  if jsonb_array_length(payload->'stops') > 50 or (desired_status = 'published' and jsonb_array_length(payload->'stops') = 0) then raise exception 'Invalid stop count' using errcode = '22023'; end if;
  if (select count(distinct s->>'id') from jsonb_array_elements(payload->'stops') s) <> jsonb_array_length(payload->'stops') then raise exception 'Duplicate stops' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(payload->'stops') loop
    if coalesce(length(trim(item->>'name')),0) not between 1 and 200 or (item->>'id')::uuid is null or length(coalesce(item->>'description','')) > 1000
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
    if current_row.status <> 'draft' then raise exception 'Only drafts can be edited' using errcode = '42501'; end if;
    if (payload->>'updated_at')::timestamptz is distinct from current_row.updated_at then raise exception 'Draft changed; reload before saving' using errcode = '40001'; end if;
    select array_agg(photo_path) into old_photos from public.journey_stops where journey_id = jid;
  else
    insert into public.journeys(id,user_id,title) values(jid,uid,trim(payload->>'title'));
  end if;
  for media in select payload->>'cover_image_path' union all select value->>'photo_path' from jsonb_array_elements(payload->'stops') loop
    if media is not null and media is distinct from current_row.cover_image_path and not coalesce(media = any(old_photos),false) then
      if not starts_with(media,'journey-media/' || uid::text || '/' || jid::text || '/')
        or not exists(select 1 from storage.objects where bucket_id = 'journey-media' and name = substr(media,15)) then raise exception 'Invalid image reference' using errcode = '22023'; end if;
    end if;
  end loop;
  update public.journeys set title = trim(payload->>'title'),description = payload->>'description',
    destination_slug = payload->>'destination_slug',destination_name = dest_name,destination_latitude = dest_lat,destination_longitude = dest_lng,
    traveler_type = payload->>'traveler_type',duration_days = (payload->>'duration_days')::integer,cover_image_path = payload->>'cover_image_path',status = desired_status,
    published_at = case when desired_status = 'published' then now() else null end
    where id = jid and user_id = uid returning updated_at into saved_at;
  delete from public.journey_stops where journey_id = jid;
  insert into public.journey_stops(id,journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
    select id,jid,sequence,trim(name),description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number
    from jsonb_to_recordset(payload->'stops') as s(id uuid,sequence integer,name text,description text,latitude double precision,longitude double precision,mapbox_place_id text,photo_path text,rating numeric,day_number integer);
  return jsonb_build_object('id',jid,'status',desired_status,'updated_at',saved_at);
end;
$$;
revoke all on function public.save_journey(jsonb) from public,anon;
grant execute on function public.save_journey(jsonb) to authenticated;

-- Keep the existing copy workflow compatible with new destination metadata.
create or replace function public.copy_journey(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid; source jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select to_jsonb(j) || jsonb_build_object('stops',coalesce((select jsonb_agg(to_jsonb(s) order by s.sequence) from public.journey_stops s where s.journey_id = j.id),'[]'::jsonb))
    into source from public.journeys j where j.id = source_id;
  if not found then raise exception 'Journey not found' using errcode = 'P0002'; end if;
  insert into public.journeys(user_id,title,description,destination_slug,destination_name,destination_latitude,destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)
    values((select auth.uid()),source->>'title',source->>'description',source->>'destination_slug',source->>'destination_name',(source->>'destination_latitude')::double precision,(source->>'destination_longitude')::double precision,source->>'traveler_type',(source->>'duration_days')::integer,source->>'cover_image_path',false,source_id)
    returning id into new_id;
  insert into public.journey_stops(journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
    select new_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number
    from jsonb_to_recordset(source->'stops') as s(sequence integer,name text,description text,latitude double precision,longitude double precision,mapbox_place_id text,photo_path text,rating numeric,day_number integer) order by sequence;
  return new_id;
end;
$$;
commit;
