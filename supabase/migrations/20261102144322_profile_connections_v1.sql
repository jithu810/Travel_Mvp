-- REVIEW PROPOSAL ONLY. No live execution authorized. See profile-connections-activation.md.
begin;
create role connection_rpc nologin noinherit nosuperuser nobypassrls;
grant usage on schema public, private, auth to connection_rpc;
grant execute on function auth.uid() to connection_rpc;
grant select(id, username, display_name, avatar_path) on public.profiles to connection_rpc;
create policy profiles_connection_identity on public.profiles for select to connection_rpc using (true);

create table private.connection_requests (
  id uuid primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','removed')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check(sender_id <> recipient_id)
);
create unique index connection_pending_pair on private.connection_requests(least(sender_id,recipient_id),greatest(sender_id,recipient_id)) where status='pending';
create index connection_requests_sender on private.connection_requests(sender_id,created_at desc,id desc);
create index connection_requests_recipient on private.connection_requests(recipient_id,created_at desc,id desc);
create table private.connection_friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null unique references private.connection_requests(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_low,user_high), check(user_low < user_high)
);
create index connection_friendships_high on private.connection_friendships(user_high,created_at desc,request_id desc);
create table private.connection_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  revision integer not null default 0 check(revision >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(follower_id,followed_id), check(follower_id <> followed_id)
);
create index connection_follows_target on private.connection_follows(followed_id);
create index connection_following_page on private.connection_follows(follower_id,created_at desc,followed_id desc) where enabled;
create table private.connection_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references private.connection_requests(id) on delete cascade,
  kind text not null check(kind in ('friend_request','friend_accepted')),
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(recipient_id,request_id,kind), check(recipient_id <> actor_id)
);
create index connection_inbox_page on private.connection_notifications(recipient_id,created_at desc,id desc);
create index connection_inbox_actor on private.connection_notifications(actor_id);
create index connection_inbox_request on private.connection_notifications(request_id);
create index connection_inbox_unread on private.connection_notifications(recipient_id) where read_at is null;

alter table private.connection_requests enable row level security;
alter table private.connection_friendships enable row level security;
alter table private.connection_follows enable row level security;
alter table private.connection_notifications enable row level security;
revoke all on private.connection_requests,private.connection_friendships,private.connection_follows,private.connection_notifications from public,anon,authenticated;
grant select,insert,update,delete on private.connection_requests,private.connection_friendships,private.connection_follows to connection_rpc;
grant select,insert,update on private.connection_notifications to connection_rpc;
create policy connection_requests_participants on private.connection_requests to connection_rpc
  using ((select auth.uid()) in (sender_id,recipient_id)) with check ((select auth.uid()) in (sender_id,recipient_id));
create policy connection_friends_participants on private.connection_friendships to connection_rpc
  using ((select auth.uid()) in (user_low,user_high)) with check ((select auth.uid()) in (user_low,user_high));
create policy connection_follows_owner on private.connection_follows to connection_rpc
  using ((select auth.uid())=follower_id) with check ((select auth.uid())=follower_id);
create policy connection_inbox_read on private.connection_notifications for select to connection_rpc using ((select auth.uid())=recipient_id);
create policy connection_inbox_insert on private.connection_notifications for insert to connection_rpc with check ((select auth.uid())=actor_id);
create policy connection_inbox_update on private.connection_notifications for update to connection_rpc using ((select auth.uid())=recipient_id) with check ((select auth.uid())=recipient_id);

create function private.connection_summary(target_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid(); req private.connection_requests; relation text := 'none'; following boolean := false; follow_revision int := 0;
begin
  if actor is null then raise exception 'Sign in required' using errcode='28000'; end if;
  if target_id is null or not exists(select 1 from public.profiles where id=target_id) then raise exception 'Profile unavailable' using errcode='22023'; end if;
  select r.* into req from private.connection_requests r
    where least(r.sender_id,r.recipient_id)=least(actor,target_id) and greatest(r.sender_id,r.recipient_id)=greatest(actor,target_id)
      and (r.status='pending' or (r.status='accepted' and exists(select 1 from private.connection_friendships f where f.request_id=r.id)))
    order by r.created_at desc,r.id desc limit 1;
  if req.id is not null then relation := case when req.status='accepted' then 'friends' when req.sender_id=actor then 'outgoing' else 'incoming' end; end if;
  select f.enabled,f.revision into following,follow_revision from private.connection_follows f where f.follower_id=actor and f.followed_id=target_id;
  return jsonb_build_object('targetId',target_id,'friendStatus',relation,'requestId',req.id,'requestRevision',req.revision,
    'following',coalesce(following,false),'followRevision',coalesce(follow_revision,0),
    'friendsCount',(select count(*) from private.connection_friendships where actor in (user_low,user_high)),
    'followingCount',(select count(*) from private.connection_follows where follower_id=actor and enabled),
    'unreadCount',(select count(*) from private.connection_notifications where recipient_id=actor and read_at is null));
end; $$;
-- PostgreSQL requires SET ROLE membership and schema CREATE for ownership transfer.
-- These migration-only capabilities are revoked after the final transfer below.
grant connection_rpc to current_user;
grant create on schema private to connection_rpc;
alter function private.connection_summary(uuid) owner to connection_rpc;
revoke all on function private.connection_summary(uuid) from public,anon,authenticated;
grant execute on function private.connection_summary(uuid) to authenticated;

create function private.connection_list(collection text,cursor text,page_limit integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid(); cursor_time timestamptz; cursor_id uuid; result jsonb; take integer; last_row jsonb;
begin
  if actor is null then raise exception 'Sign in required' using errcode='28000'; end if;
  if collection not in ('friends','following','incoming','outgoing','inbox') or collection is null then raise exception 'Invalid collection' using errcode='22023'; end if;
  take := least(greatest(coalesce(page_limit,20),1),50);
  if cursor is not null then
    if length(cursor)>512 then raise exception 'Invalid cursor' using errcode='22023'; end if;
    begin cursor_time := (cursor::jsonb->>'time')::timestamptz; cursor_id := (cursor::jsonb->>'id')::uuid;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
    if cursor_time is null or cursor_id is null then raise exception 'Invalid cursor' using errcode='22023'; end if;
  end if;
  with entries as (
    select r.id,r.id request_id,r.revision,r.status,null::text kind,null::timestamptz read_at,r.created_at,
      case when r.sender_id=actor then r.recipient_id else r.sender_id end peer
    from private.connection_requests r where r.status='pending' and ((collection='incoming' and r.recipient_id=actor) or (collection='outgoing' and r.sender_id=actor))
    union all
    select f.request_id,f.request_id,r.revision,r.status,null::text,null::timestamptz,f.created_at,case when f.user_low=actor then f.user_high else f.user_low end
    from private.connection_friendships f join private.connection_requests r on r.id=f.request_id where collection='friends' and actor in (f.user_low,f.user_high)
    union all
    select f.followed_id,null::uuid,f.revision,null::text,null::text,null::timestamptz,f.created_at,f.followed_id
    from private.connection_follows f where collection='following' and f.follower_id=actor and f.enabled
    union all
    select n.id,n.request_id,r.revision,r.status,n.kind,n.read_at,n.created_at,n.actor_id
    from private.connection_notifications n join private.connection_requests r on r.id=n.request_id where collection='inbox' and n.recipient_id=actor
  ), page as (
    select e.*,p.username,p.display_name,p.avatar_path from entries e join public.profiles p on p.id=e.peer
    where cursor_time is null or (e.created_at,e.id)<(cursor_time,cursor_id) order by e.created_at desc,e.id desc limit take+1
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'person',jsonb_build_object('id',peer,'username',username,'displayName',coalesce(nullif(btrim(display_name),''),nullif(btrim(username),''),'Traveler'),'avatar',avatar_path),
      'requestId',request_id,'revision',revision,'status',status,'kind',kind,'readAt',read_at,'createdAt',created_at) order by created_at desc,id desc),'[]'::jsonb) into result from page;
  if jsonb_array_length(result)>take then
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into result from jsonb_array_elements(result) with ordinality where ordinality<=take;
    last_row:=result->(take-1);
    return jsonb_build_object('items',result,'nextCursor',jsonb_build_object('time',last_row->>'createdAt','id',last_row->>'id')::text);
  end if;
  return jsonb_build_object('items',result,'nextCursor',null);
end; $$;
alter function private.connection_list(text,text,integer) owner to connection_rpc;
revoke all on function private.connection_list(text,text,integer) from public,anon,authenticated;
grant execute on function private.connection_list(text,text,integer) to authenticated;

create function private.connection_mutate(target_id uuid,action text,request_id uuid,expected_revision integer,enabled boolean,notification_ids uuid[]) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); req private.connection_requests; prior_revision integer; prior_enabled boolean; low_id uuid; high_id uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='28000'; end if;
  if target_id is null or not exists(select 1 from public.profiles where id=target_id) then raise exception 'Profile unavailable' using errcode='22023'; end if;
  if action is null or action not in ('request','accept','decline','cancel','remove','follow','read') then raise exception 'Invalid action' using errcode='22023'; end if;
  if action='read' then
    if notification_ids is null or cardinality(notification_ids)>50 or cardinality(notification_ids)<1 then raise exception 'Invalid notifications' using errcode='22023'; end if;
    if exists(select 1 from unnest(notification_ids) i where i is null or not exists(select 1 from private.connection_notifications n where n.id=i and n.recipient_id=actor)) then raise exception 'Notification unavailable' using errcode='42501'; end if;
    update private.connection_notifications n set read_at=coalesce(n.read_at,clock_timestamp()) where n.id=any(notification_ids) and n.recipient_id=actor;
    return private.connection_summary(target_id);
  end if;
  if actor=target_id then raise exception 'Cannot connect to yourself' using errcode='22023'; end if;
  low_id:=least(actor,target_id); high_id:=greatest(actor,target_id);
  -- Every pair mutation takes this same transaction lock, including missing rows.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('connection:'||low_id::text||':'||high_id::text,0));
  if action='follow' then
    if enabled is null or expected_revision is null or expected_revision<0 then raise exception 'Invalid follow' using errcode='22023'; end if;
    select f.revision,f.enabled into prior_revision,prior_enabled from private.connection_follows f where f.follower_id=actor and f.followed_id=target_id;
    if coalesce(prior_revision,0)<>expected_revision then raise exception 'Connection changed. Refresh before trying again.' using errcode='40001'; end if;
    if coalesce(prior_enabled,false)<>enabled then
      insert into private.connection_follows(follower_id,followed_id,enabled,revision) values(actor,target_id,enabled,1)
      on conflict(follower_id,followed_id) do update set enabled=excluded.enabled,revision=connection_follows.revision+1,updated_at=clock_timestamp();
    end if;
    return private.connection_summary(target_id);
  end if;
  if request_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
  select r.* into req from private.connection_requests r where r.id=request_id;
  if action='request' then
    if req.id is not null then
      if req.sender_id<>actor or req.recipient_id<>target_id then raise exception 'Request unavailable' using errcode='42501'; end if;
      return private.connection_summary(target_id); -- terminal replay never resurrects
    end if;
    if exists(select 1 from private.connection_friendships where user_low=low_id and user_high=high_id)
      or exists(select 1 from private.connection_requests where least(sender_id,recipient_id)=low_id and greatest(sender_id,recipient_id)=high_id and status='pending') then
      return private.connection_summary(target_id); -- opposite request never autoaccepts
    end if;
    -- Actor lock makes limits hold even for simultaneous requests to distinct peers.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('connection-sender:'||actor::text,0));
    if (select count(*) from private.connection_requests where sender_id=actor and created_at>clock_timestamp()-interval '1 hour')>=20
      or (select count(*) from private.connection_requests where sender_id=actor and status='pending')>=50 then raise exception 'Too many requests. Please try later.' using errcode='54000'; end if;
    insert into private.connection_requests(id,sender_id,recipient_id) values(request_id,actor,target_id);
    insert into private.connection_notifications(recipient_id,actor_id,request_id,kind) values(target_id,actor,request_id,'friend_request') on conflict do nothing;
    return private.connection_summary(target_id);
  end if;
  if req.id is null or least(req.sender_id,req.recipient_id)<>low_id or greatest(req.sender_id,req.recipient_id)<>high_id then raise exception 'Request unavailable' using errcode='42501'; end if;
  if action in ('accept','decline') and req.recipient_id<>actor then raise exception 'Recipient required' using errcode='42501'; end if;
  if action='cancel' and req.sender_id<>actor then raise exception 'Sender required' using errcode='42501'; end if;
  if action='remove' then
    if req.status='accepted' then
      delete from private.connection_friendships where connection_friendships.request_id=req.id and user_low=low_id and user_high=high_id;
      update private.connection_requests set status='removed',revision=revision+1,updated_at=clock_timestamp() where id=req.id;
    end if;
    return private.connection_summary(target_id);
  end if;
  if expected_revision is null or expected_revision<1 then raise exception 'Revision required' using errcode='22023'; end if;
  if req.status<>'pending' then return private.connection_summary(target_id); end if;
  if req.revision<>expected_revision then raise exception 'Request changed. Refresh before trying again.' using errcode='40001'; end if;
  update private.connection_requests set status=case action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,revision=revision+1,updated_at=clock_timestamp() where id=req.id;
  if action='accept' then
    insert into private.connection_friendships(user_low,user_high,request_id) values(low_id,high_id,req.id) on conflict do nothing;
    insert into private.connection_notifications(recipient_id,actor_id,request_id,kind) values(req.sender_id,actor,req.id,'friend_accepted') on conflict do nothing;
  end if;
  return private.connection_summary(target_id);
end; $$;
alter function private.connection_mutate(uuid,text,uuid,integer,boolean,uuid[]) owner to connection_rpc;
revoke create on schema private from connection_rpc;
revoke connection_rpc from current_user;
revoke all on function private.connection_mutate(uuid,text,uuid,integer,boolean,uuid[]) from public,anon,authenticated;
grant execute on function private.connection_mutate(uuid,text,uuid,integer,boolean,uuid[]) to authenticated;

create function public.get_profile_connections(target_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.connection_summary(target_id); $$;
create function public.list_profile_connections(collection text,cursor text default null,page_limit integer default 20) returns jsonb language sql stable security invoker set search_path='' as $$ select private.connection_list(collection,cursor,page_limit); $$;
create function public.mutate_profile_connection(target_id uuid,action text,request_id uuid default null,expected_revision integer default null,enabled boolean default null,notification_ids uuid[] default null) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.connection_mutate(target_id,action,request_id,expected_revision,enabled,notification_ids); $$;
revoke all on function public.get_profile_connections(uuid),public.list_profile_connections(text,text,integer),public.mutate_profile_connection(uuid,text,uuid,integer,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.get_profile_connections(uuid),public.list_profile_connections(text,text,integer),public.mutate_profile_connection(uuid,text,uuid,integer,boolean,uuid[]) to authenticated;
commit;
