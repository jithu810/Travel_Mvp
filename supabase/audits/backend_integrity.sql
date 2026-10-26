-- READ ONLY. Run against an isolated restored snapshot before activation.
-- Identifiers and paths are review material; do not publish raw results.
select j.id, j.status,
  (select count(*) from public.journey_stops s where s.journey_id=j.id) as stop_count,
  not isfinite(j.updated_at) as invalid_version,
  length(coalesce(j.description,'')) > 5000 as long_description,
  length(j.cover_image_path) > 2000 as long_cover,
  length(j.destination_name) > 200 as long_destination,
  (j.destination_latitude is null) <> (j.destination_longitude is null) as incomplete_destination_pair,
  coalesce(j.traveler_type,'') not in ('solo','couple','friends','family')
    or case when j.destination_name is not null then
      length(trim(j.destination_name)) not between 1 and 200
      or j.destination_latitude is null or j.destination_longitude is null
      or j.destination_latitude not between -90 and 90
      or j.destination_longitude not between -180 and 180
      or coalesce(j.destination_slug,'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or length(j.destination_slug) > 200
    else coalesce(j.destination_slug,'') not in ('goa','varkala','munnar','kochi','thenkasi') end
    as incomplete_editor_metadata,
  exists (select 1 from (select s.*, row_number() over(order by sequence) as expected
    from public.journey_stops s where s.journey_id=j.id) s
    where s.sequence <> s.expected or s.day_number > j.duration_days
      or length(coalesce(s.description,'')) > 1000 or length(s.mapbox_place_id) > 500
      or length(s.photo_path) > 2000
      or (j.status='published' and (s.latitude is null or s.longitude is null))) as invalid_stops
from public.journeys j order by j.id;

-- Available after the review-table migration. A matching approval is an explicit
-- human attestation, not evidence inferred from an untrusted historical path.
select i.*, a.review_note, a.reviewed_at,
  length(i.media_path) <= 2000 and (
    starts_with(i.media_path,'journey-media/') or i.media_path ~ '^/images/[^?#]+$'
    or (i.media_path ~ '^https://' and i.media_path !~* '/storage/|/object/|[?#]|@')) as supported_form
from private.legacy_journey_media_inventory i
left join private.legacy_journey_media_approvals a using(journey_id,media_path)
where not i.owned_existing_upload order by i.journey_id;

select r.rolname, r.rolcanlogin, r.rolsuper, r.rolbypassrls,
  has_table_privilege(r.rolname,'public.journeys','INSERT,UPDATE,TRUNCATE') as journey_write,
  has_any_column_privilege(r.rolname,'public.journeys','INSERT,UPDATE') as journey_column_write,
  has_table_privilege(r.rolname,'public.journey_stops','INSERT,UPDATE,DELETE,TRUNCATE') as stop_write
from pg_roles r where r.rolname in ('anon','authenticated','journey_rpc');

select p.oid::regprocedure, r.rolname as owner, p.prosecdef, p.proconfig, p.proacl
from pg_proc p join pg_roles r on r.oid=p.proowner
where p.oid in ('public.save_journey(jsonb)'::regprocedure,'public.copy_journey(uuid)'::regprocedure);
