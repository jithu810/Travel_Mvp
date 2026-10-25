-- Remix without inherited media.
-- copy_journey keeps the published-only source check, lineage, text, metadata and
-- stop structure, but never copies the source's cover_image_path or stop photo_path:
-- the remix starts with no images and its owner adds their own under <uid>/<journeyId>/.
-- Existing remix rows (including any inherited paths) are intentionally not modified.
-- private.copy_media_path is retained (unused here) for compatibility and rollback.
--
-- WARNING: the unmerged hardening migration 20261005010000_rpc_integrity_hardening
-- (on origin branches) redefines copy_journey and reintroduces media copying. It
-- must be reconciled with this migration before it is ever applied; applying it
-- unchanged after this file would silently restore inherited photos.
begin;

create or replace function public.copy_journey(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid; source jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select to_jsonb(j) || jsonb_build_object('stops',coalesce((select jsonb_agg(to_jsonb(s) order by s.sequence) from public.journey_stops s where s.journey_id = j.id),'[]'::jsonb))
    into source from public.journeys j where j.id = source_id and j.status = 'published';
  if not found then raise exception 'Journey not found' using errcode = 'P0002'; end if;
  insert into public.journeys(user_id,title,description,destination_slug,destination_name,destination_latitude,destination_longitude,traveler_type,duration_days,cover_image_path,is_demo,copied_from_journey_id)
    values((select auth.uid()),source->>'title',source->>'description',source->>'destination_slug',source->>'destination_name',(source->>'destination_latitude')::double precision,(source->>'destination_longitude')::double precision,source->>'traveler_type',(source->>'duration_days')::integer,null,false,source_id)
    returning id into new_id;
  insert into public.journey_stops(journey_id,sequence,name,description,latitude,longitude,mapbox_place_id,photo_path,rating,day_number)
    select new_id,sequence,name,description,latitude,longitude,mapbox_place_id,null,rating,day_number
    from jsonb_to_recordset(source->'stops') as s(sequence integer,name text,description text,latitude double precision,longitude double precision,mapbox_place_id text,rating numeric,day_number integer) order by sequence;
  return new_id;
end;
$$;
revoke all on function public.copy_journey(uuid) from public, anon;
grant execute on function public.copy_journey(uuid) to authenticated;

commit;
