begin;

-- Location history is deliberately separate from published journeys and copies.
create table public.travel_tracks (
  id uuid primary key,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  started_at timestamptz not null,
  ended_at timestamptz,
  distance_meters double precision not null default 0 check (distance_meters >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  points jsonb not null default '[]' check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) <= 20000),
  revision integer not null default 0 check (revision >= 0),
  last_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('COMPLETED','CANCELLED')) = (ended_at is not null)),
  check (ended_at is null or ended_at >= started_at)
);
create index travel_tracks_owner_journey_idx on public.travel_tracks(user_id, journey_id, started_at desc);
create index travel_tracks_journey_idx on public.travel_tracks(journey_id);
alter table public.travel_tracks enable row level security;
create policy travel_tracks_read_own on public.travel_tracks for select to authenticated using ((select auth.uid()) = user_id);
-- Mutations go exclusively through the validated, owner-checked atomic RPC below.
revoke all on public.travel_tracks from public, anon, authenticated;
grant select on public.travel_tracks to authenticated;

create function public.append_travel_track(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  traveler uuid := auth.uid();
  track public.travel_tracks;
  point jsonb;
  previous jsonb;
  incoming jsonb := payload->'points';
  target uuid := (payload->>'id')::uuid;
  journey uuid := (payload->>'journeyId')::uuid;
  expected integer := (payload->>'revision')::integer;
  started timestamptz := to_timestamp((payload->>'startedAt')::double precision / 1000);
  ended timestamptz := case when payload->>'endedAt' is null then null else to_timestamp((payload->>'endedAt')::double precision / 1000) end;
  state text := payload->>'status';
  total double precision;
  movement double precision;
  delta double precision;
  segment integer;
begin
  if traveler is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if target is null or journey is null or jsonb_typeof(incoming) is distinct from 'array' or jsonb_array_length(incoming) > 128 or octet_length(payload::text) > 32768 or expected is null or expected < 0
    or started <= '1970-01-01'::timestamptz or state is null or state not in ('ACTIVE','PAUSED','COMPLETED','CANCELLED') or started is null or started > now() + interval '5 seconds'
    or (state in ('COMPLETED','CANCELLED')) <> (ended is not null) or ended < started or ended > now() + interval '5 seconds' then
    raise exception 'Invalid track batch' using errcode='22023';
  end if;
  select * into track from public.travel_tracks where id=target for update;
  if not found then
    if expected <> 0 or not exists(select 1 from public.journeys where id=journey and (status='published' or user_id=traveler)) then
      raise exception 'Track unavailable' using errcode='42501';
    end if;
    insert into public.travel_tracks(id,journey_id,user_id,status,started_at) values(target,journey,traveler,'ACTIVE',started)
      on conflict(id) do nothing;
    select * into track from public.travel_tracks where id=target for update;
  end if;
  if track.user_id <> traveler or track.journey_id <> journey or track.started_at <> started then raise exception 'Track unavailable' using errcode='42501'; end if;
  -- An identical retry after a lost response acknowledges the same append once.
  if track.revision=expected+1 and track.last_payload=payload then
    return jsonb_build_object('revision',track.revision,'count',jsonb_array_length(track.points));
  end if;
  if track.revision<>expected then raise exception 'Track changed in another tab' using errcode='40001'; end if;
  if track.status in ('COMPLETED','CANCELLED') then raise exception 'Track already finished' using errcode='22023'; end if;
  if jsonb_array_length(track.points)+jsonb_array_length(incoming)>20000 then raise exception 'Track limit reached' using errcode='22023'; end if;
  previous := track.points->-1;
  total := track.distance_meters;
  for point in select value from jsonb_array_elements(incoming) loop
    if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<>5
      or exists(select 1 from jsonb_array_elements(point) v where jsonb_typeof(v) <> 'number') then raise exception 'Invalid track point' using errcode='22023'; end if;
    if (point->>4)::numeric not between 0 and 499 or (point->>4)::numeric<>trunc((point->>4)::numeric) then raise exception 'Invalid segment' using errcode='22023'; end if;
    segment := (point->>4)::integer;
    if abs((point->>0)::double precision)>180 or abs((point->>1)::double precision)>90
      or (point->>2)::double precision < extract(epoch from started)*1000 or (point->>2)::double precision > extract(epoch from now())*1000+5000
      or (ended is not null and (point->>2)::double precision>extract(epoch from ended)*1000)
      or (point->>3)::double precision not between 0 and 50 or segment not between 0 and 499 or (point->>4)::numeric<>segment then
      raise exception 'Invalid track point' using errcode='22023';
    end if;
    if previous is null then
      if segment<>0 then raise exception 'Invalid segment' using errcode='22023'; end if;
    else
      delta := ((point->>2)::double precision-(previous->>2)::double precision)/1000;
      if delta<=0 or segment<(previous->>4)::integer or segment>(previous->>4)::integer+1 then raise exception 'Invalid point order' using errcode='22023'; end if;
      if segment=(previous->>4)::integer then
        movement := 6371000*2*asin(sqrt(least(1.0,
          power(sin(radians((point->>1)::double precision-(previous->>1)::double precision)/2),2)
          +cos(radians((point->>1)::double precision))*cos(radians((previous->>1)::double precision))
          *power(sin(radians((point->>0)::double precision-(previous->>0)::double precision)/2),2))));
        if delta>15 or movement>delta*75+(point->>3)::double precision+(previous->>3)::double precision+20 or movement<5
          or (track.status='PAUSED' and point=incoming->0) then raise exception 'Invalid continuous segment' using errcode='22023'; end if;
        total := total+movement;
      end if;
    end if;
    previous := point;
  end loop;
  update public.travel_tracks set points=track.points||incoming, status=state, ended_at=ended, distance_meters=total,
    duration_seconds=greatest(0,floor(extract(epoch from coalesce(ended,now())-started)))::integer,
    revision=revision+1,last_payload=payload,updated_at=now() where id=target;
  return jsonb_build_object('revision',expected+1,'count',jsonb_array_length(track.points)+jsonb_array_length(incoming));
end;
$$;
revoke all on function public.append_travel_track(jsonb) from public, anon;
grant execute on function public.append_travel_track(jsonb) to authenticated;
commit;
