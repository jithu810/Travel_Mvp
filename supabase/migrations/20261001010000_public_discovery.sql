begin;

alter table public.journeys
  add column destination_slug text check (destination_slug in ('goa', 'varkala', 'munnar', 'kochi', 'thenkasi')),
  add column traveler_type text check (traveler_type in ('solo', 'couple', 'friends', 'family')),
  add column duration_days integer not null default 1 check (duration_days between 1 and 365),
  add column is_demo boolean not null default false;

create index journeys_discovery_idx on public.journeys (destination_slug, traveler_type, published_at desc) where status = 'published';

-- The private implementation exposes only an explicit published projection.
-- It can aggregate likes and creator display details without granting direct
-- access to private profiles or the identities of users who liked a journey.
create schema if not exists private;
create function private.public_journeys(destination_filter text, traveler_filter text, journey_filter uuid)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'description', j.description,
    'destination_slug', j.destination_slug, 'traveler_type', j.traveler_type,
    'duration_days', j.duration_days, 'cover_image_path', j.cover_image_path,
    'is_demo', j.is_demo,
    'creator_name', case when j.is_demo then 'Journey demo studio' else coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Traveler') end,
    'creator_avatar', case when j.is_demo then null else p.avatar_path end,
    'likes_count', (select count(*) from public.journey_likes l where l.journey_id = j.id),
    'stops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'position', s.position) order by s.position) from public.journey_stops s where s.journey_id = j.id), '[]'::jsonb)
  )
  from public.journeys j join public.profiles p on p.id = j.user_id
  where j.status = 'published' and j.destination_slug is not null and j.traveler_type is not null
    and (destination_filter is null or j.destination_slug = destination_filter)
    and (traveler_filter is null or j.traveler_type = traveler_filter)
    and (journey_filter is null or j.id = journey_filter)
  order by j.published_at desc, j.id
  limit 100;
$$;
revoke all on function private.public_journeys(text, text, uuid) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.public_journeys(text, text, uuid) to anon, authenticated;

create function public.get_public_journeys(destination_filter text default null, traveler_filter text default null, journey_filter uuid default null)
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  select * from private.public_journeys(destination_filter, traveler_filter, journey_filter);
$$;
revoke all on function public.get_public_journeys(text, text, uuid) from public;
grant execute on function public.get_public_journeys(text, text, uuid) to anon, authenticated;

commit;
