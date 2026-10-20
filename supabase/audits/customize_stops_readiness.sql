-- READ ONLY. Intended for an approved isolated restored snapshot first.
-- This file does not approve legacy media or apply any migration.
-- Uses the pre-October-5 core tables; optional October-5/20 objects are guarded.
-- Only aggregate data counts and schema/authorization metadata are returned.
begin transaction read only;

-- Existence is evidence, not proof of matching definitions or deployment history.
select required.name, to_regclass(required.name) is not null as present
from (values ('private.legacy_journey_media_approvals'),
  ('private.legacy_journey_media_inventory'), ('private.journey_media_authorizations'),
  ('private.selected_copy_requests')) as required(name) order by required.name;

select required.signature, p.oid is not null as present, n.nspname as schema,
  r.rolname as owner, p.prosecdef as security_definer, p.proconfig as settings,
  p.proacl as execute_acl,
  case when p.oid is not null then md5(pg_get_functiondef(p.oid)) end as definition_md5,
  case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anon_execute,
  case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_execute
from (values ('public.save_journey(jsonb)'), ('public.copy_journey(uuid)'),
  ('private.copy_authorized_media(uuid,text)'),
  ('public.copy_journey_selected(uuid,uuid[],uuid)'),
  ('private.copy_journey_selected(uuid,uuid[],uuid)')) as required(signature)
left join pg_proc p on p.oid = to_regprocedure(required.signature)
left join pg_namespace n on n.oid=p.pronamespace
left join pg_roles r on r.oid=p.proowner order by required.signature;

select rolname, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolbypassrls
from pg_roles where rolname in ('anon','authenticated','journey_rpc') order by rolname;
select member.rolname as member, granted.rolname as granted_role
from pg_auth_members m join pg_roles member on member.oid=m.member
join pg_roles granted on granted.oid=m.roleid
where member.rolname in ('anon','authenticated','journey_rpc')
  or granted.rolname='journey_rpc' order by member.rolname,granted.rolname;

select n.nspname as schema,c.relname,r.rolname as owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_roles r on r.oid=c.relowner
where (n.nspname='public' and c.relname in ('journeys','journey_stops'))
  or (n.nspname='storage' and c.relname='objects')
  or (n.nspname='private' and c.relname in ('selected_copy_requests','journey_media_authorizations','legacy_journey_media_approvals'))
order by n.nspname,c.relname;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where (schemaname='public' and tablename in ('journeys','journey_stops'))
  or (schemaname='storage' and tablename='objects')
  or (schemaname='private' and tablename in ('selected_copy_requests','journey_media_authorizations','legacy_journey_media_approvals'))
order by schemaname,tablename,policyname;
-- Includes column grants, which a table-level REVOKE does not remove.
select grantee,table_schema,table_name,column_name,privilege_type
from information_schema.column_privileges
where grantee in ('PUBLIC','anon','authenticated','journey_rpc')
  and table_schema='public' and table_name in ('journeys','journey_stops')
  and privilege_type in ('INSERT','UPDATE','REFERENCES')
order by table_name,grantee,column_name,privilege_type;

-- Mirrors protected hardening data gates without assuming private objects exist.
with inspected as (
  select j.*,
    (select count(*) from public.journey_stops s where s.journey_id=j.id) as stop_count,
    exists (select 1 from (select s.*,row_number() over(order by sequence) as expected
      from public.journey_stops s where s.journey_id=j.id) s
      where s.sequence<>s.expected or s.day_number>j.duration_days
        or length(coalesce(s.description,''))>1000 or length(s.mapbox_place_id)>500
        or length(s.photo_path)>2000
        or (j.status='published' and (s.latitude is null or s.longitude is null))) as invalid_stops,
    coalesce(j.traveler_type,'') not in ('solo','couple','friends','family')
      or case when j.destination_name is not null then
        length(trim(j.destination_name)) not between 1 and 200
        or j.destination_latitude is null or j.destination_longitude is null
        or j.destination_latitude not between -90 and 90 or j.destination_longitude not between -180 and 180
        or coalesce(j.destination_slug,'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(j.destination_slug)>200
      else coalesce(j.destination_slug,'') not in ('goa','varkala','munnar','kochi','thenkasi') end as invalid_metadata
  from public.journeys j
)
select count(*) as journey_count,
  count(*) filter(where invalid_metadata) as invalid_editor_metadata,
  count(*) filter(where invalid_stops or stop_count>50 or (status='published' and stop_count=0)) as invalid_stop_aggregates,
  count(*) filter(where not isfinite(updated_at)) as invalid_versions,
  count(*) filter(where length(coalesce(description,''))>5000 or length(cover_image_path)>2000
    or length(destination_name)>200 or (destination_latitude is null)<>(destination_longitude is null)) as invalid_row_bounds
from inspected;

with inventory as (
  select distinct j.id as journey_id,m.media_path,
    starts_with(m.media_path,'journey-media/' || j.user_id::text || '/' || j.id::text || '/')
      and exists(select 1 from storage.objects o where o.bucket_id='journey-media'
        and o.name=substr(m.media_path,15)) as owned_existing_upload
  from public.journeys j cross join lateral (
    select j.cover_image_path as media_path
    union select s.photo_path from public.journey_stops s where s.journey_id=j.id
  ) m where m.media_path is not null
)
select count(*) as media_reference_count,
  count(*) filter(where not owned_existing_upload) as requires_provenance_review,
  count(*) filter(where length(media_path)>2000 or not (
    starts_with(media_path,'journey-media/') or media_path ~ '^/images/[^?#]+$'
    or (media_path ~ '^https://' and media_path !~* '/storage/|/object/|[?#]|@'))) as unsupported_media_form
from inventory;

-- Optional tables cannot be referenced statically before the review migration.
-- Notices report counts only. An absent prerequisite is never a passing gate.
do $$ declare unresolved bigint; begin
  if to_regclass('private.legacy_journey_media_inventory') is null
    or to_regclass('private.legacy_journey_media_approvals') is null then
    raise notice 'Legacy approval gate: unavailable; review migration is absent';
  else
    execute 'select count(*) from private.legacy_journey_media_inventory i
      where not i.owned_existing_upload and not exists (
        select 1 from private.legacy_journey_media_approvals a
        where a.journey_id=i.journey_id and a.media_path=i.media_path)' into unresolved;
    raise notice 'Legacy approval gate: % unresolved references',unresolved;
  end if;
end $$;
rollback;
