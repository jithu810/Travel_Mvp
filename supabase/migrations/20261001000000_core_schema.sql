begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  display_name text,
  avatar_path text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles (lower(username));

create table public.journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  cover_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journeys_publication_state check (
    (status = 'draft' and published_at is null) or
    (status = 'published' and published_at is not null)
  )
);
create index journeys_user_id_idx on public.journeys (user_id);
create index journeys_published_idx on public.journeys (published_at desc) where status = 'published';

create table public.journey_stops (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null check (length(trim(name)) between 1 and 200),
  description text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  mapbox_place_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, position),
  constraint journey_stops_coordinate_pair check ((latitude is null) = (longitude is null))
);

create table public.journey_likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, journey_id)
);
create index journey_likes_journey_id_idx on public.journey_likes (journey_id);

create table public.saved_journeys (
  user_id uuid not null references public.profiles(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, journey_id)
);
create index saved_journeys_journey_id_idx on public.saved_journeys (journey_id);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger journeys_updated_at before update on public.journeys for each row execute function public.set_updated_at();
create trigger journey_stops_updated_at before update on public.journey_stops for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Also support users who existed before this migration.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
revoke all on function public.handle_new_user() from public;
revoke all on function public.set_updated_at() from public;

alter table public.profiles enable row level security;
alter table public.journeys enable row level security;
alter table public.journey_stops enable row level security;
alter table public.journey_likes enable row level security;
alter table public.saved_journeys enable row level security;

create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy journeys_read on public.journeys for select to anon, authenticated
  using (status = 'published' or (select auth.uid()) = user_id);
create policy journeys_insert_own on public.journeys for insert to authenticated with check ((select auth.uid()) = user_id);
create policy journeys_update_own on public.journeys for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy journeys_delete_own on public.journeys for delete to authenticated using ((select auth.uid()) = user_id);

create policy journey_stops_read on public.journey_stops for select to anon, authenticated using (
  exists (select 1 from public.journeys j where j.id = journey_id and (j.status = 'published' or j.user_id = (select auth.uid())))
);
create policy journey_stops_insert_own on public.journey_stops for insert to authenticated with check (
  exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid()))
);
create policy journey_stops_update_own on public.journey_stops for update to authenticated using (
  exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid()))
);
create policy journey_stops_delete_own on public.journey_stops for delete to authenticated using (
  exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid()))
);

create policy journey_likes_read_own on public.journey_likes for select to authenticated using ((select auth.uid()) = user_id);
create policy journey_likes_insert_own on public.journey_likes for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.journeys j where j.id = journey_id and (j.status = 'published' or j.user_id = (select auth.uid())))
);
create policy journey_likes_delete_own on public.journey_likes for delete to authenticated using ((select auth.uid()) = user_id);

create policy saved_journeys_read_own on public.saved_journeys for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_journeys_insert_own on public.saved_journeys for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.journeys j where j.id = journey_id and (j.status = 'published' or j.user_id = (select auth.uid())))
);
create policy saved_journeys_delete_own on public.saved_journeys for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.journeys, public.journey_stops, public.journey_likes, public.saved_journeys from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.journeys, public.journey_stops to anon;
grant select, insert, update, delete on public.profiles, public.journeys, public.journey_stops to authenticated;
-- Likes and saves are immutable relationships; managing them means insert/delete.
grant select, insert, delete on public.journey_likes, public.saved_journeys to authenticated;

commit;
