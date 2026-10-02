begin;
-- Existing profile fields, journey relationships and social tables are reused.
update public.profiles set username = 'traveler_' || right(replace(id::text,'-',''),21) where username is null or lower(username)='edit';
alter table public.profiles add constraint profiles_username_reserved check (lower(username) <> 'edit');
alter table public.profiles add constraint profiles_display_name_length check (length(coalesce(display_name,'')) <= 80),
  add constraint profiles_bio_length check (length(coalesce(bio,'')) <= 500);
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,username) values(new.id,'traveler_' || right(replace(new.id::text,'-',''),21)) on conflict(id) do nothing;
  return new;
end; $$;
-- Likes and saves belong only to published journeys, including for their owner.
drop policy journey_likes_insert_own on public.journey_likes;
create policy journey_likes_insert_own on public.journey_likes for insert to authenticated with check (
  user_id = (select auth.uid()) and exists(select 1 from public.journeys j where j.id = journey_id and j.status = 'published')
);
drop policy saved_journeys_insert_own on public.saved_journeys;
create policy saved_journeys_insert_own on public.saved_journeys for insert to authenticated with check (
  user_id = (select auth.uid()) and exists(select 1 from public.journeys j where j.id = journey_id and j.status = 'published')
);
-- Published owners can replace images in the same editor. Objects stay immutable.
drop policy journey_media_insert on storage.objects;
create policy journey_media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'journey-media' and split_part(name,'/',1) = (select auth.uid())::text
  and exists(select 1 from public.journeys j where j.id::text = split_part(name,'/',2) and j.user_id = (select auth.uid()))
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy profile_avatars_read on storage.objects for select to anon,authenticated using (
  bucket_id = 'profile-avatars' and (split_part(name,'/',1) = (select auth.uid())::text
    or exists(select 1 from public.profiles p where p.avatar_path = 'profile-avatars/' || objects.name))
);
-- The public avatar projection uses a definer function; do not expose profile rows.
create function private.avatar_referenced(object_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.avatar_path = 'profile-avatars/' || object_name);
$$;
revoke all on function private.avatar_referenced(text) from public;
grant execute on function private.avatar_referenced(text) to anon,authenticated;
drop policy profile_avatars_read on storage.objects;
create policy profile_avatars_read on storage.objects for select to anon,authenticated using (
  bucket_id = 'profile-avatars' and (split_part(name,'/',1) = (select auth.uid())::text or private.avatar_referenced(name))
);
create policy profile_avatars_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'profile-avatars' and split_part(name,'/',1) = (select auth.uid())::text
);
alter table public.profiles add constraint profiles_avatar_owner check (avatar_path is null or starts_with(avatar_path,'profile-avatars/' || id::text || '/') or avatar_path ~ '^https://');
create function public.get_public_profile(handle text) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'bio',p.bio,'avatar_path',p.avatar_path,
    'published_count',(select count(*) from public.journeys j where j.user_id=p.id and j.status='published'))
  from public.profiles p where lower(p.username)=lower(handle);
$$;
revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon,authenticated;
create function public.get_account_journeys(owner_id uuid default null, collection text default 'published')
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',j.id,'title',j.title,'description',j.description,'destination_slug',j.destination_slug,
    'traveler_type',j.traveler_type,'duration_days',j.duration_days,'cover_image_path',j.cover_image_path,'is_demo',j.is_demo,
    'creator_name',coalesce(nullif(p.display_name,''),p.username,'Traveler'),'creator_avatar',p.avatar_path,
    'creator_id',p.id,'creator_username',p.username,'status',j.status,
    'likes_count',(select count(*) from public.journey_likes l where l.journey_id=j.id),
    'saved',exists(select 1 from public.saved_journeys s where s.journey_id=j.id and s.user_id=(select auth.uid())),
    'stops',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'position',s.sequence) order by s.sequence) from public.journey_stops s where s.journey_id=j.id),'[]'::jsonb))
  from public.journeys j join public.profiles p on p.id=j.user_id
  where (collection='published' and j.user_id=owner_id and j.status='published')
    or (collection='drafts' and owner_id=(select auth.uid()) and j.user_id=owner_id and j.status='draft')
    or (collection='saved' and (select auth.uid()) is not null and j.status='published'
      and exists(select 1 from public.saved_journeys s where s.journey_id=j.id and s.user_id=(select auth.uid())))
  order by j.updated_at desc,j.id;
$$;
revoke all on function public.get_account_journeys(uuid,text) from public;
grant execute on function public.get_account_journeys(uuid,text) to anon,authenticated;
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

-- Retain durable, RLS-readable references; optional missing/temporary media is omitted.
create function private.copy_media_path(media text) returns text language sql stable security invoker set search_path = '' as $$
  select case
    when starts_with(media,'journey-media/') then case when exists(select 1 from storage.objects where bucket_id='journey-media' and name=substr(media,15)) then media else null end
    when starts_with(media,'/images/') then media
    when media ~ '^https://' and media !~ '/object/sign/' and media !~ '[?&]token=' then media
    else null end;
$$;
revoke all on function private.copy_media_path(text) from public,anon;
grant execute on function private.copy_media_path(text) to authenticated;
create or replace function public.copy_journey(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid; source jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select to_jsonb(j) || jsonb_build_object('stops',coalesce((select jsonb_agg(to_jsonb(s) order by s.sequence) from public.journey_stops s where s.journey_id = j.id),'[]'::jsonb))
    into source from public.journeys j where j.id = source_id and j.status = 'published';
  if not found then raise exception 'Journey not found' using errcode = 'P0002'; end if;
  insert into public.journeys(user_id,title,description,destination_slug,destination_name,destination_latitude,destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)
    values((select auth.uid()),source->>'title',source->>'description',source->>'destination_slug',source->>'destination_name',(source->>'destination_latitude')::double precision,(source->>'destination_longitude')::double precision,source->>'traveler_type',(source->>'duration_days')::integer,private.copy_media_path(source->>'cover_image_path'),false,source_id)
    returning id into new_id;
  insert into public.journey_stops(journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
    select new_id,sequence,name,description,latitude,longitude,mapbox_place_id,private.copy_media_path(photo_path),rating,day_number
    from jsonb_to_recordset(source->'stops') as s(sequence integer,name text,description text,latitude double precision,longitude double precision,mapbox_place_id text,photo_path text,rating numeric,day_number integer) order by sequence;
  return new_id;
end;
$$;

create or replace function private.public_journeys(destination_filter text, traveler_filter text, journey_filter uuid)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'description', j.description,
    'destination_slug', j.destination_slug, 'traveler_type', j.traveler_type,
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
