begin;

alter table public.journey_stops rename column position to sequence;
alter table public.journey_stops rename constraint journey_stops_journey_id_position_key to journey_stops_journey_id_sequence_key;
alter table public.journey_stops
  add column photo_path text,
  add column rating numeric(2,1) check (rating between 0 and 5),
  add column day_number integer check (day_number > 0);
alter table public.journeys add column copied_from_journey_id uuid references public.journeys(id) on delete set null;
create index journeys_copied_from_idx on public.journeys (copied_from_journey_id) where copied_from_journey_id is not null;

-- Keep the existing discovery RPC contract compatible with its cards.
create or replace function private.public_journeys(destination_filter text, traveler_filter text, journey_filter uuid)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'description', j.description,
    'destination_slug', j.destination_slug, 'traveler_type', j.traveler_type,
    'duration_days', j.duration_days, 'cover_image_path', j.cover_image_path,
    'is_demo', j.is_demo,
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

create function private.journey_detail(target_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'description', j.description, 'destination_slug', j.destination_slug,
    'traveler_type', j.traveler_type, 'duration_days', j.duration_days, 'cover_image_path', j.cover_image_path,
    'is_demo', j.is_demo, 'status', j.status, 'copied_from_journey_id', j.copied_from_journey_id,
    'creator_id', j.user_id,
    'creator_name', case when j.is_demo then 'Journey demo studio' else coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Traveler') end,
    'creator_username', case when j.is_demo then null else p.username end,
    'creator_avatar', case when j.is_demo then null else p.avatar_path end,
    'likes_count', (select count(*) from public.journey_likes l where l.journey_id = j.id),
    'liked', exists(select 1 from public.journey_likes l where l.journey_id = j.id and l.user_id = (select auth.uid())),
    'saved', exists(select 1 from public.saved_journeys s where s.journey_id = j.id and s.user_id = (select auth.uid())),
    'stops', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'description', s.description, 'sequence', s.sequence,
      'latitude', s.latitude, 'longitude', s.longitude, 'photo_path', s.photo_path,
      'rating', s.rating, 'day_number', s.day_number
    ) order by s.sequence) from public.journey_stops s where s.journey_id = j.id), '[]'::jsonb)
  ) from public.journeys j join public.profiles p on p.id = j.user_id
  where j.id = target_id and (j.status = 'published' or j.user_id = (select auth.uid()));
$$;
revoke all on function private.journey_detail(uuid) from public;
grant execute on function private.journey_detail(uuid) to anon, authenticated;

create function public.get_journey_detail(target_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.journey_detail(target_id);
$$;
revoke all on function public.get_journey_detail(uuid) from public;
grant execute on function public.get_journey_detail(uuid) to anon, authenticated;

-- One transaction copies the visible source and its stored sequence. No route
-- calculation, ordering changes, social interactions, or publishing occurs.
create function public.copy_journey(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
  source jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  -- Capture the source and its stops in one RLS-protected read snapshot.
  select to_jsonb(j) || jsonb_build_object('stops', coalesce((
    select jsonb_agg(to_jsonb(s) order by s.sequence) from public.journey_stops s where s.journey_id = j.id
  ), '[]'::jsonb)) into source from public.journeys j where j.id = source_id;
  if not found then raise exception 'Journey not found' using errcode = 'P0002'; end if;
  insert into public.journeys (user_id, title, description, destination_slug, traveler_type, duration_days, cover_image_path, is_demo, copied_from_journey_id)
  values ((select auth.uid()), source->>'title', source->>'description', source->>'destination_slug', source->>'traveler_type', (source->>'duration_days')::integer, source->>'cover_image_path', false, source_id)
  returning id into new_id;
  insert into public.journey_stops (journey_id, sequence, name, description, latitude, longitude, mapbox_place_id, photo_path, rating, day_number)
  select new_id, sequence, name, description, latitude, longitude, mapbox_place_id, photo_path, rating, day_number
  from jsonb_to_recordset(source->'stops') as s(sequence integer, name text, description text, latitude double precision, longitude double precision, mapbox_place_id text, photo_path text, rating numeric, day_number integer)
  order by sequence;
  return new_id;
end;
$$;
revoke all on function public.copy_journey(uuid) from public, anon;
grant execute on function public.copy_journey(uuid) to authenticated;

commit;
