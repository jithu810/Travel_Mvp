begin;
-- Deliberate deployment gate. No client or RPC role can attest historical media.
-- Populate only after reviewing provenance; do not bulk-approve the inventory.
create table private.legacy_journey_media_approvals (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  media_path text not null,
  review_note text not null check (length(trim(review_note)) > 0),
  reviewed_at timestamptz not null default clock_timestamp(),
  primary key (journey_id, media_path)
);
revoke all on private.legacy_journey_media_approvals from public, anon, authenticated;
alter table private.legacy_journey_media_approvals enable row level security;

create view private.legacy_journey_media_inventory as
select distinct j.id as journey_id, j.user_id, m.media_path,
  starts_with(m.media_path, 'journey-media/' || j.user_id::text || '/' || j.id::text || '/')
    and exists (select 1 from storage.objects o where o.bucket_id = 'journey-media'
      and o.name = substr(m.media_path, 15)) as owned_existing_upload
from public.journeys j cross join lateral (
  select j.cover_image_path as media_path
  union select s.photo_path from public.journey_stops s where s.journey_id = j.id
) m where m.media_path is not null;
revoke all on private.legacy_journey_media_inventory from public, anon, authenticated;
commit;
