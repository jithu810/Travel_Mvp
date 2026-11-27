-- Registration email check (recovered 2026-11-27 from the live project, where it was applied on
-- 2026-10-31 without a web repo file). Applied source: travel-mvp-mobile
-- backend/email-registration/rollout-proposal.sql (SHA256 7FE699F5...D78CBD, see the mobile repo's
-- docs/qa/email-first-auth-db-rollout-2026-10-31.md); same logic, grants and RLS. Lets the sign-up flow tell an already-registered email to sign in
-- instead of registering again. Server-only: EXECUTE is granted to service_role, never anon or
-- authenticated. Rate limits: 30/minute and 1000/day globally, 3 per email hash per 15 minutes.

create table if not exists private.registration_email_limits (
  key text primary key,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null
);

create index if not exists registration_email_limits_expiry
  on private.registration_email_limits (expires_at);

alter table private.registration_email_limits enable row level security;

revoke all on table private.registration_email_limits from public, anon, authenticated, service_role;

create or replace function public.registration_email_check(p_email text, p_email_hash text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  normalized text := lower(btrim(p_email));
  checked_at timestamptz := clock_timestamp();
  current_epoch bigint;
  quota record;
  existing private.registration_email_limits%rowtype;
  deadline timestamptz;
begin
  if normalized is null or length(normalized) > 254
    or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid lookup input' using errcode = '22023';
  end if;
  -- Shared lock makes quota checks/increments atomic across server instances.
  perform pg_catalog.pg_advisory_xact_lock(720311, 101);
  checked_at := clock_timestamp();
  current_epoch := floor(extract(epoch from checked_at));
  delete from private.registration_email_limits where expires_at <= checked_at;
  -- Pilot fixed windows: 30/global minute, 1000/global day, 3/email/15 minutes.
  for quota in select * from (values
    ('global:minute', 30, 60), ('global:day', 1000, 86400),
    ('email:' || p_email_hash, 3, 900)
  ) as limits(key, maximum, seconds) loop
    select * into existing from private.registration_email_limits where key = quota.key;
    if found and existing.attempts >= quota.maximum then
      return jsonb_build_object('allowed', false, 'retry_after', greatest(1, ceil(extract(epoch from existing.expires_at-checked_at))::integer));
    end if;
  end loop;
  for quota in select * from (values
    ('global:minute', 30, 60), ('global:day', 1000, 86400),
    ('email:' || p_email_hash, 3, 900)
  ) as limits(key, maximum, seconds) loop
    deadline := to_timestamp(((current_epoch / quota.seconds) + 1) * quota.seconds);
    insert into private.registration_email_limits(key, attempts, expires_at)
      values(quota.key, 1, deadline)
      on conflict(key) do update set attempts = private.registration_email_limits.attempts + 1;
  end loop;
  -- Intentional membership disclosure. Include all providers/SSO/unconfirmed users.
  return jsonb_build_object('allowed', true, 'exists', exists(
    select 1 from auth.users where lower(btrim(email)) = normalized
  ));
end;
$function$;

revoke all on function public.registration_email_check(text, text) from public, anon, authenticated;
grant execute on function public.registration_email_check(text, text) to service_role;
