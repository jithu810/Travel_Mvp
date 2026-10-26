-- Recorded live migration 20261024041322 journey_media_thumbnail_v1_read.
-- This version is registered in the live project's migration history; it was
-- authored in the Mobile repository and is captured here so the Web migration
-- directory matches live history. The guards and policy are the live statements.
-- The only difference: CREATE POLICY is skipped when the policy already exists,
-- so a re-run is a no-op and never alters an existing policy.
-- Read-only Storage policy for 512 px thumbnails of referenced originals.
-- No INSERT/UPDATE/DELETE grants. Recovery (separately approved on live):
-- DROP POLICY journey_media_thumbnail_v1_read ON storage.objects; originals unaffected.
begin;
set local lock_timeout = '5s';
do $$ begin
  if to_regclass('private.journey_media_authorizations') is not null then
    raise exception 'Hardened media branch requires a separate policy review';
  end if;
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity)
    or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='journey_media_read' and cmd='SELECT') then
    raise exception 'Expected baseline Storage RLS/read policy absent';
  end if;
end $$;
do $thumbnail$ begin
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='journey_media_thumbnail_v1_read') then
    raise notice 'SUCCESS_NOOP: journey_media_thumbnail_v1_read already exists; left unchanged';
    return;
  end if;
  execute $policy$
create policy journey_media_thumbnail_v1_read on storage.objects
for select to anon, authenticated using (
  bucket_id = 'journey-media'
  and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(cover|stops/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.thumb-512-v1\.jpg$'
  and exists (
    select 1 from public.journeys j
    where (j.status = 'published' or j.user_id = (select auth.uid()))
      and (
        j.cover_image_path = any(array[
          'journey-media/' || regexp_replace(objects.name,'\.thumb-512-v1\.jpg$','.full-v1.jpg'),
          'journey-media/' || regexp_replace(objects.name,'\.thumb-512-v1\.jpg$','.full-v1.png'),
          'journey-media/' || regexp_replace(objects.name,'\.thumb-512-v1\.jpg$','.full-v1.webp')])
        or exists(select 1 from public.journey_stops s where s.journey_id=j.id and s.photo_path = any(array[
          'journey-media/' || regexp_replace(objects.name,'\.thumb-512-v1\.jpg$','.full-v1.jpg'),
          'journey-media/' || regexp_replace(objects.name,'\.thumb-512-v1\.jpg$','.full-v1.png'),
          'journey-media/' || regexp_replace(objects.name,'\.thumb-512-v1\.jpg$','.full-v1.webp')]))
      )
  )
)
$policy$;
end $thumbnail$;
commit;
