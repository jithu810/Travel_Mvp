begin;
-- Reuse destination metadata and replace the five-place slug allowlist.
-- No new tables/location model or RLS changes. Preserve owner/version/media checks.
alter table public.journeys drop constraint journeys_destination_slug_check;
alter table public.journeys add constraint journeys_destination_slug_check check (
  destination_slug is null or (length(destination_slug) <= 200 and destination_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and (destination_slug in ('goa','varkala','munnar','kochi','thenkasi') or
      (length(trim(destination_name)) between 1 and 200 and destination_name is not null
        and destination_latitude is not null and destination_longitude is not null)))
);
create or replace function public.save_journey(payload jsonb)
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
    published_at = case when desired_status = 'published' then coalesce(current_row.published_at,now()) else null end
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

create or replace function private.public_journeys(destination_filter text, traveler_filter text, journey_filter uuid)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'description', j.description,
    'destination_slug', j.destination_slug, 'destination_name', j.destination_name, 'traveler_type', j.traveler_type,
    'duration_days', j.duration_days, 'cover_image_path', j.cover_image_path,
    'is_demo', j.is_demo, 'creator_id',p.id,'creator_username',p.username,
    'creator_name', case when j.is_demo then 'Journey demo studio' else coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Traveler') end,
    'creator_avatar', case when j.is_demo then null else p.avatar_path end,
    'likes_count', (select count(*) from public.journey_likes l where l.journey_id = j.id),
    'stops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'position', s.sequence) order by s.sequence) from public.journey_stops s where s.journey_id = j.id), '[]'::jsonb)
  ) from public.journeys j join public.profiles p on p.id = j.user_id
  where j.status = 'published' and j.destination_slug is not null and j.traveler_type is not null
    and (destination_filter is null or j.destination_slug = destination_filter)
    and (traveler_filter is null or j.traveler_type = traveler_filter)
    and (journey_filter is null or j.id = journey_filter)
  order by j.published_at desc, j.id limit 100;
$$;


commit;
