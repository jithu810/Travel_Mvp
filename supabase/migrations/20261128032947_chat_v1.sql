-- LOCAL REVIEW PROPOSAL (P24). No live execution authorized; a live apply needs separate approval naming the project.
-- Chat v1 database layer: private tables, chat_rpc definer role, public invoker wrappers, Realtime policies.
-- Push tables / pg_net are NOT part of this migration (P26).
-- PII rule: message text never appears in RAISE text, DETAIL, Realtime payloads or logs. Bodies are validated
-- in the RPC before any insert so a table CHECK violation (which logs the failing row) cannot fire.
--
-- Owner decisions encoded here (2026-11-27):
--  * Blocked senders and senders in a decline cooldown get a "silent" send: no message text is stored and nothing is
--    delivered, but the response is shaped like a real send and the sender's own user:<id> topic gets the same
--    chat.message signal (ids + seq) a real send emits, so a waiting client or second device behaves the same. The
--    mobile client renders the sender's own messages, previews and new conversations from a local outbox.
--    Parity is reproduced from chat_rate_events rows of kind 'silent' (id, seq, a salted hash of the body for mismatch
--    detection; never the text):
--      - the 3-message request cap applies only while the sender's view is pending (peer requested/declined/left);
--        a blocked sender in a formerly active chat looks active and has no cap, like a real active chat;
--      - seq advances like a real send; a replay returns the same id/seq with replayed=true;
--      - the hash is nulled after 24 h (a replay then matches by client_msg_id alone);
--      - a real send marks earlier silent rows consumed (excluded from the cap) but keeps them as tombstones, so a retry
--        of an old silent id is still never delivered. Tombstones are pruned after 30 days (accepted edge: a retry of
--        a silent id older than 30 days would be delivered as a new message).
--    Still observable to a silent sender: (a) silent seq numbers are provisional - when the peer later replies, real
--    messages can reuse seq values that were returned for silent sends (closing the gap would show the peer a seq jump);
--    the client must key its outbox by client_msg_id and treat server seq as authoritative once messages sync;
--    (b) silent messages never appear in server-side lists, so a client without a local outbox sees them vanish;
--    (c) Seen is frozen while a blocked sender's chat looks active and null while pending.
--  * A blocked first message creates a shell conversation (members, last_seq = 0, no messages) so the response can carry a
--    real conversationId. Lists hide shells. When a shell later gets its first stored message it counts as a new request
--    against the hourly request cap, so unblock cannot bypass it.
--  * A blocked replier in a received request is moved to Chats (reply = accept) exactly like a real reply, but nothing is
--    delivered.
--  * Typing: the typing topic policy denies the blocker (they neither receive nor send) but still lets the blocked user
--    join and send; the blocker simply never receives those broadcasts. A join denial is therefore not a block signal for
--    the blocked user. Remaining accepted low risk: a denied join is observable in the pending/declined states (which the
--    sender already sees as "pending"). The mobile client MUST join the typing topic only when the chat state is 'active',
--    MUST treat any failed typing join as "peer offline", MUST leave the chat-typing channel immediately on its own block
--    action, and MUST leave it on any state change.
--  * Seen: the blocked user's peerReadSeq is null while the view is pending; in a still-active view it is frozen at the
--    blocker's last_read_seq at block time and never advances.
--  * Report snapshots are kept 90 days. Pruning runs on the report path only (no pg_cron), so expired reports are removed
--    the next time anyone files a report; chat_reports(created_at) is indexed for that. Snapshot rows carry a role label
--    (reporter / reported / unknown), never a user id, so account deletion leaves nothing identifying in them.
--  * Status 'left' is reserved and not set by any action in v1; where it appears it is treated as unavailable (own side)
--    or as a silent recipient (peer side).
begin;
set local lock_timeout = '3s';

-- 1. Role and identity helper (created first; installer-owned, EXECUTE for chat_rpc only).
create role chat_rpc nologin noinherit nosuperuser nobypassrls;
grant usage on schema public, private to chat_rpc;

create function private.chat_uid() returns uuid language sql stable security definer set search_path='' as $$ select auth.uid() $$;
revoke all on function private.chat_uid() from public, anon, authenticated, service_role;
do $acl$
declare grantee_name name;
begin
  for grantee_name in select distinct r.rolname from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    join pg_roles r on r.oid = a.grantee where p.oid = 'private.chat_uid()'::regprocedure and a.grantee <> p.proowner loop
    execute format('revoke all on function private.chat_uid() from %I', grantee_name);
  end loop;
end;
$acl$;
grant execute on function private.chat_uid() to chat_rpc;

-- Migration-only capabilities for ownership transfer and final ACL work; removed at the very end.
grant chat_rpc to current_user with inherit true, set true;
grant create on schema private to chat_rpc;

-- 2. Tables (private schema, RLS on, no client grants).
create table private.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct')),
  user_low uuid references public.profiles(id) on delete set null,
  user_high uuid references public.profiles(id) on delete set null,
  last_seq bigint not null default 0 check (last_seq >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (user_low is null or user_high is null or user_low < user_high),
  unique (user_low, user_high)
);
create index chat_conversations_high on private.chat_conversations(user_high);

create table private.chat_members (
  conversation_id uuid not null references private.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('active','requested','declined','left')),
  last_read_seq bigint not null default 0 check (last_read_seq >= 0),
  cleared_seq bigint not null default 0 check (cleared_seq >= 0),
  request_count smallint not null default 0 check (request_count between 0 and 3),
  declined_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key (conversation_id, user_id),
  check (status <> 'declined' or declined_at is not null)
);
create index chat_members_user on private.chat_members(user_id, status, conversation_id);

create table private.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references private.chat_conversations(id) on delete cascade,
  seq bigint not null check (seq > 0),
  sender_id uuid references public.profiles(id) on delete set null,
  client_msg_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  kind text not null default 'text' check (kind in ('text')),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  unique (conversation_id, seq),
  unique (sender_id, client_msg_id)
);

create table private.chat_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  seen_seq bigint,
  created_at timestamptz not null default clock_timestamp(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index chat_blocks_blocked on private.chat_blocks(blocked_id);

create table private.chat_rate_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('message','request','report','silent')),
  conversation_id uuid references private.chat_conversations(id) on delete cascade,
  client_msg_id uuid,
  synthetic_id uuid,
  seq bigint,
  body_hash bytea,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index chat_rate_events_actor on private.chat_rate_events(actor_id, kind, created_at desc);
create index chat_rate_events_conversation on private.chat_rate_events(conversation_id) where conversation_id is not null;
create unique index chat_rate_events_silent_replay on private.chat_rate_events(actor_id, client_msg_id) where kind = 'silent';

create table private.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references private.chat_conversations(id) on delete set null,
  reason text not null check (reason in ('spam','harassment','inappropriate','other')),
  details text check (details is null or char_length(details) <= 500),
  snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index chat_reports_reporter on private.chat_reports(reporter_id);
create index chat_reports_reported on private.chat_reports(reported_id);
create index chat_reports_conversation on private.chat_reports(conversation_id);
create index chat_reports_created on private.chat_reports(created_at);

alter table private.chat_conversations enable row level security;
alter table private.chat_members enable row level security;
alter table private.chat_messages enable row level security;
alter table private.chat_blocks enable row level security;
alter table private.chat_rate_events enable row level security;
alter table private.chat_reports enable row level security;

-- Strip every non-owner grantee (Supabase default ACLs may add service_role etc.), then grant minimally.
do $tacl$
declare tbl text; grantee_name name;
begin
  foreach tbl in array array['private.chat_conversations','private.chat_members','private.chat_messages','private.chat_blocks','private.chat_rate_events','private.chat_reports'] loop
    execute format('revoke all on table %s from public', tbl);
    for grantee_name in select distinct r.rolname from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      join pg_roles r on r.oid = a.grantee where c.oid = tbl::regclass and a.grantee <> c.relowner loop
      execute format('revoke all on table %s from %I', tbl, grantee_name);
    end loop;
  end loop;
end;
$tacl$;
grant select, insert, update on private.chat_conversations to chat_rpc;
grant select, insert, update on private.chat_members to chat_rpc;
grant select, insert on private.chat_messages to chat_rpc;
grant select, insert, delete on private.chat_blocks to chat_rpc;
grant select, insert, update, delete on private.chat_rate_events to chat_rpc;
grant insert on private.chat_reports to chat_rpc;

create policy chat_conversations_participants_select on private.chat_conversations for select to chat_rpc
  using ((select private.chat_uid()) in (user_low, user_high));
create policy chat_conversations_participants_insert on private.chat_conversations for insert to chat_rpc
  with check ((select private.chat_uid()) in (user_low, user_high));
create policy chat_conversations_participants_update on private.chat_conversations for update to chat_rpc
  using ((select private.chat_uid()) in (user_low, user_high)) with check ((select private.chat_uid()) in (user_low, user_high));

create policy chat_members_participants_select on private.chat_members for select to chat_rpc
  using (exists (select 1 from private.chat_conversations c where c.id = chat_members.conversation_id and (select private.chat_uid()) in (c.user_low, c.user_high)));
create policy chat_members_participants_insert on private.chat_members for insert to chat_rpc
  with check (exists (select 1 from private.chat_conversations c where c.id = chat_members.conversation_id
    and (select private.chat_uid()) in (c.user_low, c.user_high) and chat_members.user_id in (c.user_low, c.user_high)));
create policy chat_members_participants_update on private.chat_members for update to chat_rpc
  using (exists (select 1 from private.chat_conversations c where c.id = chat_members.conversation_id and (select private.chat_uid()) in (c.user_low, c.user_high)))
  with check (exists (select 1 from private.chat_conversations c where c.id = chat_members.conversation_id and (select private.chat_uid()) in (c.user_low, c.user_high)));

create policy chat_messages_participants_select on private.chat_messages for select to chat_rpc
  using (exists (select 1 from private.chat_conversations c where c.id = chat_messages.conversation_id and (select private.chat_uid()) in (c.user_low, c.user_high)));
create policy chat_messages_sender_insert on private.chat_messages for insert to chat_rpc
  with check (sender_id = (select private.chat_uid())
    and exists (select 1 from private.chat_conversations c where c.id = chat_messages.conversation_id and (select private.chat_uid()) in (c.user_low, c.user_high)));

create policy chat_blocks_select on private.chat_blocks for select to chat_rpc using ((select private.chat_uid()) in (blocker_id, blocked_id));
create policy chat_blocks_insert on private.chat_blocks for insert to chat_rpc with check ((select private.chat_uid()) = blocker_id);
create policy chat_blocks_delete on private.chat_blocks for delete to chat_rpc using ((select private.chat_uid()) = blocker_id);

create policy chat_rate_events_select on private.chat_rate_events for select to chat_rpc using ((select private.chat_uid()) = actor_id);
create policy chat_rate_events_insert on private.chat_rate_events for insert to chat_rpc with check ((select private.chat_uid()) = actor_id);
create policy chat_rate_events_update on private.chat_rate_events for update to chat_rpc using ((select private.chat_uid()) = actor_id) with check ((select private.chat_uid()) = actor_id);
create policy chat_rate_events_delete on private.chat_rate_events for delete to chat_rpc using ((select private.chat_uid()) = actor_id);

-- Insert-only: chat_rpc has no SELECT, so snapshots are readable only by owner SQL.
create policy chat_reports_insert on private.chat_reports for insert to chat_rpc with check ((select private.chat_uid()) = reporter_id);

-- 3. Installer-owned helpers.
-- Friendship lookup stays installer-owned so the connection tables get no new grants or policies.
create function private.chat_are_friends(p_a uuid, p_b uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from private.connection_friendships f where f.user_low = least(p_a, p_b) and f.user_high = greatest(p_a, p_b))
$$;

-- Report retention: 90 days, pruned on the report path. Installer-owned so chat_rpc keeps no DELETE on chat_reports.
create function private.chat_prune_reports() returns void language sql volatile security definer set search_path='' as $$
  delete from private.chat_reports r where r.created_at < clock_timestamp() - interval '90 days'
$$;

-- Signal only (ids + seq). Failures never roll back the caller.
create function private.chat_notify(p_user uuid, p_event text, p_conversation uuid, p_seq bigint) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_user is null then return; end if;
  begin
    perform realtime.send(jsonb_build_object('conversationId', p_conversation, 'seq', p_seq), p_event, 'user:' || p_user::text, true);
  exception when others then
    raise warning 'chat realtime notify failed';
  end;
end;
$$;

-- 4. chat_rpc-owned functions.
create function private.chat_view_state(p_conversation uuid, p_actor uuid) returns text language sql stable security definer set search_path='' as $$
  -- Order matters: the actor's own blocker/request status is checked first; a block by the peer alone never changes the
  -- actor's view (a blocked sender in an active chat keeps looking active; in a request/declined chat they see pending).
  select case
    when exists (select 1 from private.chat_blocks b where b.blocker_id = p_actor and b.blocked_id = pm.user_id) then 'blocked'
    when am.status = 'requested' then 'request'
    when pm.status in ('requested','declined','left') then 'pending'
    else 'active' end
  from private.chat_conversations c
  join private.chat_members am on am.conversation_id = c.id and am.user_id = p_actor
  left join private.chat_members pm on pm.conversation_id = c.id and pm.user_id = case when c.user_low = p_actor then c.user_high else c.user_low end
  where c.id = p_conversation
$$;

create function private.chat_can_type(p_conversation uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid := private.chat_uid();
begin
  if v_actor is null or p_conversation is null then return false; end if;
  return exists (
    select 1 from private.chat_conversations c
    join private.chat_members am on am.conversation_id = c.id and am.user_id = v_actor
    join private.chat_members pm on pm.conversation_id = c.id and pm.user_id = case when c.user_low = v_actor then c.user_high else c.user_low end
    where c.id = p_conversation and am.status = 'active' and pm.status = 'active'
      -- Only the blocker is denied; the blocked user still joins (their typing is never received), see the header note.
      and not exists (select 1 from private.chat_blocks b where b.blocker_id = v_actor and b.blocked_id = pm.user_id));
end;
$$;

create function private.chat_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid := private.chat_uid(); v_result jsonb;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  with mine as (
    select cm.conversation_id, cm.status, cm.last_read_seq, cm.cleared_seq,
      case when c.user_low = v_actor then c.user_high else c.user_low end as peer
    from private.chat_members cm join private.chat_conversations c on c.id = cm.conversation_id
    where cm.user_id = v_actor and cm.status in ('active','requested') and c.last_seq > 0
  ), flagged as (
    select m.*, exists (select 1 from private.chat_blocks b where b.blocker_id = v_actor and b.blocked_id = m.peer) as blocked from mine m
  ), counted as (
    select f.*, case when f.status = 'active' and not f.blocked then
      (select count(*) from (select 1 from private.chat_messages x where x.conversation_id = f.conversation_id
        and x.seq > greatest(f.last_read_seq, f.cleared_seq) and x.sender_id is distinct from v_actor limit 100) q) else 0 end as unread
    from flagged f
  )
  select jsonb_build_object('unreadChats', count(*) filter (where unread > 0), 'unreadMessages', coalesce(sum(unread), 0)::int,
    'pendingRequests', count(*) filter (where status = 'requested' and not blocked)) into v_result from counted;
  return v_result;
end;
$$;

create function private.chat_list(p_folder text, p_cursor text, p_limit integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid := private.chat_uid(); v_take integer; v_time timestamptz; v_id uuid; v_items jsonb; v_next jsonb;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_folder is null or p_folder not in ('chats','requests') then raise exception 'Invalid folder' using errcode = '22023'; end if;
  v_take := least(greatest(coalesce(p_limit, 30), 1), 50);
  if p_cursor is not null then
    if length(p_cursor) > 512 then raise exception 'Invalid cursor' using errcode = '22023'; end if;
    begin v_time := (p_cursor::jsonb->>'time')::timestamptz; v_id := (p_cursor::jsonb->>'id')::uuid;
    exception when others then raise exception 'Invalid cursor' using errcode = '22023'; end;
    if v_time is null or v_id is null then raise exception 'Invalid cursor' using errcode = '22023'; end if;
  end if;
  with mine as (
    select c.id, c.last_seq, c.last_message_at, cm.status as my_status, cm.last_read_seq, cm.cleared_seq,
      case when c.user_low = v_actor then c.user_high else c.user_low end as peer
    from private.chat_members cm join private.chat_conversations c on c.id = cm.conversation_id
    where cm.user_id = v_actor and c.last_seq > 0 and cm.status in ('active','requested')
  ), flagged as (
    select m.*, exists (select 1 from private.chat_blocks b where b.blocker_id = v_actor and b.blocked_id = m.peer) as blocked from mine m
  ), picked as (
    select f.*, row_number() over (order by f.last_message_at desc, f.id desc) as rn from flagged f
    where ((p_folder = 'chats' and (f.my_status = 'active' or f.blocked)) or (p_folder = 'requests' and f.my_status = 'requested' and not f.blocked))
      and (v_time is null or (f.last_message_at, f.id) < (v_time, v_id))
    order by f.last_message_at desc, f.id desc limit v_take + 1
  ), rws as (
    select p.*, pr.username, pr.display_name, pr.avatar_path, pm.status as peer_status, pm.last_read_seq as peer_read,
      bb.blocker_id as bb_blocker, bb.seen_seq as frozen_seen,
      private.chat_view_state(p.id, v_actor) as state, lm.seq as lm_seq, lm.sender_id as lm_sender, lm.preview, lm.created_at as lm_at,
      case when p.my_status = 'active' and not p.blocked then
        (select count(*) from (select 1 from private.chat_messages x where x.conversation_id = p.id
          and x.seq > greatest(p.last_read_seq, p.cleared_seq) and x.sender_id is distinct from v_actor limit 100) q) else 0 end as unread
    from picked p
    left join public.profiles pr on pr.id = p.peer
    left join private.chat_members pm on pm.conversation_id = p.id and pm.user_id = p.peer
    left join private.chat_blocks bb on bb.blocker_id = p.peer and bb.blocked_id = v_actor
    left join lateral (select m.seq, m.sender_id, left(m.body, 120) as preview, m.created_at from private.chat_messages m
      where m.conversation_id = p.id and m.seq > p.cleared_seq order by m.seq desc limit 1) lm on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'peer', case when r.peer is null then jsonb_build_object('id', null, 'username', null, 'displayName', 'Deleted traveler', 'avatar', null, 'deleted', true)
        else jsonb_build_object('id', r.peer, 'username', r.username,
          'displayName', coalesce(nullif(btrim(r.display_name), ''), nullif(btrim(r.username), ''), 'Traveler'), 'avatar', r.avatar_path, 'deleted', false) end,
      'state', r.state, 'canSend', (r.state in ('active','pending') and r.peer is not null),
      'lastSeq', r.last_seq, 'lastMessageAt', r.last_message_at, 'unreadCount', r.unread, 'lastReadSeq', r.last_read_seq,
      'peerReadSeq', case when r.state = 'pending' then null when r.bb_blocker is not null then r.frozen_seen when r.state = 'active' and r.peer_status = 'active' then r.peer_read else null end,
      'lastMessage', case when r.state = 'blocked' or r.lm_seq is null then null
        else jsonb_build_object('seq', r.lm_seq, 'mine', r.lm_sender = v_actor, 'preview', r.preview, 'createdAt', r.lm_at) end
    ) order by r.rn) filter (where r.rn <= v_take), '[]'::jsonb),
    (select jsonb_build_object('time', x.last_message_at, 'id', x.id) from rws x where x.rn = v_take and (select count(*) from rws) > v_take)
  into v_items, v_next from rws r;
  return jsonb_build_object('items', v_items, 'nextCursor', v_next, 'summary', private.chat_summary());
end;
$$;

create function private.chat_messages(p_conversation uuid, p_before bigint, p_after bigint, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid := private.chat_uid(); v_conv private.chat_conversations; v_am private.chat_members; v_pm private.chat_members; v_bb private.chat_blocks;
  v_take integer; v_items jsonb; v_more boolean; v_state text;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_conversation is null then raise exception 'Chat unavailable' using errcode = '42501'; end if;
  if p_before is not null and p_after is not null then raise exception 'Invalid page' using errcode = '22023'; end if;
  v_take := least(greatest(coalesce(p_limit, 30), 1), 100);
  select c.* into v_conv from private.chat_conversations c where c.id = p_conversation;
  select m.* into v_am from private.chat_members m where m.conversation_id = p_conversation and m.user_id = v_actor;
  if v_conv.id is null or v_am.user_id is null or v_am.status not in ('active','requested') then raise exception 'Chat unavailable' using errcode = '42501'; end if;
  select m.* into v_pm from private.chat_members m where m.conversation_id = p_conversation
    and m.user_id = case when v_conv.user_low = v_actor then v_conv.user_high else v_conv.user_low end;
  select b.* into v_bb from private.chat_blocks b where b.blocked_id = v_actor and b.blocker_id = v_pm.user_id;
  v_state := private.chat_view_state(p_conversation, v_actor);
  -- Two plain branches so the (conversation_id, seq) unique index drives each scan.
  if p_after is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'seq', q.seq, 'mine', q.sender_id = v_actor, 'senderDeleted', q.sender_id is null,
        'body', q.body, 'kind', q.kind, 'createdAt', q.created_at,
        'clientMsgId', case when q.sender_id = v_actor then q.client_msg_id else null end) order by q.seq) filter (where q.rn <= v_take), '[]'::jsonb),
      count(*) > v_take into v_items, v_more
    from (select m.*, row_number() over (order by m.seq asc) as rn from (
      select x.* from private.chat_messages x where x.conversation_id = p_conversation and x.seq > greatest(p_after, v_am.cleared_seq)
      order by x.seq asc limit v_take + 1) m) q;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'seq', q.seq, 'mine', q.sender_id = v_actor, 'senderDeleted', q.sender_id is null,
        'body', q.body, 'kind', q.kind, 'createdAt', q.created_at,
        'clientMsgId', case when q.sender_id = v_actor then q.client_msg_id else null end) order by q.seq) filter (where q.rn <= v_take), '[]'::jsonb),
      count(*) > v_take into v_items, v_more
    from (select m.*, row_number() over (order by m.seq desc) as rn from (
      select x.* from private.chat_messages x where x.conversation_id = p_conversation and x.seq > v_am.cleared_seq
        and (p_before is null or x.seq < p_before)
      order by x.seq desc limit v_take + 1) m) q;
  end if;
  return jsonb_build_object('conversationId', p_conversation, 'state', v_state, 'items', v_items, 'hasMore', v_more,
    'lastSeq', v_conv.last_seq, 'lastReadSeq', v_am.last_read_seq,
    'peerReadSeq', case when v_state = 'pending' then null when v_bb.blocker_id is not null then v_bb.seen_seq when v_state = 'active' and v_pm.status = 'active' then v_pm.last_read_seq else null end);
end;
$$;

create function private.chat_mutate(p_action text, p_conversation_id uuid, p_target_id uuid, p_client_msg_id uuid, p_body text,
  p_up_to_seq bigint, p_reason text, p_details text, p_message_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_actor uuid := private.chat_uid();
  v_conv private.chat_conversations; v_am private.chat_members; v_pm private.chat_members; v_msg private.chat_messages;
  v_peer uuid; v_low uuid; v_high uuid; v_seq bigint; v_new bigint; v_state text; v_snapshot jsonb;
  v_blocked_by_actor boolean := false; v_blocked_me boolean := false; v_friends boolean := false;
  v_cooldown boolean := false; v_new_request boolean := false; v_silent boolean := false; v_count integer;
  v_evt private.chat_rate_events; v_hash bytea; v_silent_count integer;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_action is null or p_action not in ('send','accept','decline','read','block','unblock','report') then raise exception 'Invalid action' using errcode = '22023'; end if;
  if p_action in ('accept','decline','read','report') and p_conversation_id is null then raise exception 'Conversation required' using errcode = '22023'; end if;
  if p_action in ('send','block','unblock') and p_conversation_id is null and p_target_id is null then raise exception 'Conversation required' using errcode = '22023'; end if;

  -- Validate user text first; fixed messages only (no user text in errors or DETAIL).
  if p_action = 'send' then
    if p_client_msg_id is null then raise exception 'Message ID required' using errcode = '22023'; end if;
    -- Blank = only whitespace or invisible characters; explicit code point ranges, not locale classes.
    if p_body is null or p_body !~ '[^\u0009-\u000d\u0020\u0085\u00a0\u00ad\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u2064\u2066-\u2069\u3000\ufeff\u034f\u061c\u115f\u1160\u3164\uffa0\u2800\U000e0000-\U000e007f]' then raise exception 'Message is empty' using errcode = '22023'; end if;
    if char_length(p_body) > 2000 then raise exception 'Message is too long' using errcode = '22023'; end if;
  elsif p_action = 'report' then
    if p_reason is null or p_reason not in ('spam','harassment','inappropriate','other') then raise exception 'Invalid reason' using errcode = '22023'; end if;
    if p_details is not null and char_length(p_details) > 500 then raise exception 'Details are too long' using errcode = '22023'; end if;
    if p_message_ids is not null and (cardinality(p_message_ids) > 20 or exists (select 1 from unnest(p_message_ids) i where i is null)) then raise exception 'Invalid messages' using errcode = '22023'; end if;
  elsif p_action = 'read' then
    if p_up_to_seq is null or p_up_to_seq < 0 then raise exception 'Invalid sequence' using errcode = '22023'; end if;
  end if;

  -- Resolve the pair (RLS shows a conversation only to its participants).
  if p_conversation_id is not null then
    select c.* into v_conv from private.chat_conversations c where c.id = p_conversation_id;
    if v_conv.id is null then raise exception 'Chat unavailable' using errcode = '42501'; end if;
    v_peer := case when v_conv.user_low = v_actor then v_conv.user_high else v_conv.user_low end;
  else
    v_peer := p_target_id;
    if v_peer = v_actor then raise exception 'Cannot message yourself' using errcode = '22023'; end if;
    if not exists (select 1 from public.profiles p where p.id = v_peer) then raise exception 'Chat unavailable' using errcode = '42501'; end if;
  end if;
  if v_peer is null and p_action in ('send','block') then raise exception 'Chat unavailable' using errcode = '42501'; end if;

  -- Lock order is always: pair lock, then actor lock.
  if v_peer is not null then
    v_low := least(v_actor, v_peer); v_high := greatest(v_actor, v_peer);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:' || v_low::text || ':' || v_high::text, 0));
    select c.* into v_conv from private.chat_conversations c where c.user_low = v_low and c.user_high = v_high;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:deleted:' || v_conv.id::text, 0));
    select c.* into v_conv from private.chat_conversations c where c.id = p_conversation_id;
  end if;
  if p_action in ('send','report') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat-actor:' || v_actor::text, 0));
  end if;

  if v_conv.id is not null then
    select m.* into v_am from private.chat_members m where m.conversation_id = v_conv.id and m.user_id = v_actor;
    select m.* into v_pm from private.chat_members m where m.conversation_id = v_conv.id and m.user_id = v_peer;
    if v_am.user_id is null then raise exception 'Chat unavailable' using errcode = '42501'; end if;
  end if;
  if v_peer is not null then
    v_blocked_by_actor := exists (select 1 from private.chat_blocks b where b.blocker_id = v_actor and b.blocked_id = v_peer);
    v_blocked_me := exists (select 1 from private.chat_blocks b where b.blocker_id = v_peer and b.blocked_id = v_actor);
  end if;

  if p_action = 'send' then
    if v_am.status = 'left' then raise exception 'Chat unavailable' using errcode = '42501'; end if;
    -- Housekeeping on the actor's own rows: old limit events, 24 h body hashes, 30-day silent tombstones.
    delete from private.chat_rate_events e where e.actor_id = v_actor and e.kind <> 'silent' and e.created_at < clock_timestamp() - interval '2 days';
    update private.chat_rate_events e set body_hash = null where e.actor_id = v_actor and e.kind = 'silent' and e.body_hash is not null and e.created_at < clock_timestamp() - interval '24 hours';
    delete from private.chat_rate_events e where e.actor_id = v_actor and e.kind = 'silent' and e.created_at < clock_timestamp() - interval '30 days';
    -- Idempotent replay: same client_msg_id returns the stored row; a mismatch is rejected with fixed text.
    select m.* into v_msg from private.chat_messages m where m.sender_id = v_actor and m.client_msg_id = p_client_msg_id;
    if v_msg.id is not null then
      if v_conv.id is null or v_msg.conversation_id <> v_conv.id or v_msg.body <> p_body then raise exception 'Message ID conflict' using errcode = '22023'; end if;
      return jsonb_build_object('conversationId', v_conv.id, 'state', private.chat_view_state(v_conv.id, v_actor), 'replayed', true,
        'message', jsonb_build_object('id', v_msg.id, 'clientMsgId', v_msg.client_msg_id, 'seq', v_msg.seq, 'body', v_msg.body, 'createdAt', v_msg.created_at, 'mine', true));
    end if;
    -- Replay of a silent send: same synthetic id and seq. The body is compared through a salted hash (no text is stored).
    v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_body || p_client_msg_id::text, 'UTF8'));
    select e.* into v_evt from private.chat_rate_events e where e.actor_id = v_actor and e.kind = 'silent' and e.client_msg_id = p_client_msg_id;
    if v_evt.id is not null then
      if v_conv.id is null or v_evt.conversation_id <> v_conv.id or (v_evt.body_hash is not null and v_evt.body_hash <> v_hash) then raise exception 'Message ID conflict' using errcode = '22023'; end if;
      return jsonb_build_object('conversationId', v_conv.id, 'state', private.chat_view_state(v_conv.id, v_actor), 'replayed', true,
        'message', jsonb_build_object('id', v_evt.synthetic_id, 'clientMsgId', p_client_msg_id, 'seq', v_evt.seq, 'body', p_body, 'createdAt', v_evt.created_at, 'mine', true));
    end if;
    if v_blocked_by_actor then raise exception 'Unblock to send a message' using errcode = '22023'; end if;
    v_friends := private.chat_are_friends(v_actor, v_peer);
    v_cooldown := (not v_friends) and v_pm.user_id is not null and v_pm.status = 'declined' and v_pm.cooldown_until > clock_timestamp();
    v_silent := v_blocked_me or v_cooldown or v_pm.status = 'left';

    select count(*) into v_count from private.chat_rate_events e where e.actor_id = v_actor and e.kind = 'message' and e.created_at > clock_timestamp() - interval '1 minute';
    if v_count >= 30 then raise exception 'Too many messages. Please slow down.' using errcode = '54000', hint = 'rate_minute'; end if;
    select count(*) into v_count from private.chat_rate_events e where e.actor_id = v_actor and e.kind = 'message' and e.created_at > clock_timestamp() - interval '1 day';
    if v_count >= 1000 then raise exception 'Too many messages. Please try later.' using errcode = '54000', hint = 'rate_day'; end if;

    -- A silent send into an existing conversation is never a new request. A shell (last_seq = 0) that gets its first
    -- stored message counts as a new request, so unblocking cannot bypass the hourly cap.
    v_new_request := (not v_friends) and (v_conv.id is null or v_pm.user_id is null
      or (not v_silent and (v_conv.last_seq = 0 or (v_pm.status = 'declined' and not v_cooldown))));
    if v_new_request then
      select count(*) into v_count from private.chat_rate_events e where e.actor_id = v_actor and e.kind = 'request' and e.created_at > clock_timestamp() - interval '1 hour';
      if v_count >= 10 then raise exception 'Too many requests. Please try later.' using errcode = '54000', hint = 'request_hour'; end if;
    end if;
    insert into private.chat_rate_events(actor_id, kind) values (v_actor, 'message');
    if v_new_request then insert into private.chat_rate_events(actor_id, kind) values (v_actor, 'request'); end if;

    if v_conv.id is null then
      insert into private.chat_conversations(user_low, user_high) values (v_low, v_high) returning * into v_conv;
      insert into private.chat_members(conversation_id, user_id, status) values (v_conv.id, v_actor, 'active');
      insert into private.chat_members(conversation_id, user_id, status) values (v_conv.id, v_peer, case when v_friends then 'active' else 'requested' end);
      select m.* into v_am from private.chat_members m where m.conversation_id = v_conv.id and m.user_id = v_actor;
      select m.* into v_pm from private.chat_members m where m.conversation_id = v_conv.id and m.user_id = v_peer;
    end if;

    if v_silent then
      -- Silent: nothing stored or delivered to the peer. Same cap (while pending), advancing seq, replay and own signal as a real send.
      if v_am.status in ('requested','declined') then
        -- A blocked replier in a received request moves to Chats like a real reply (reply = accept).
        update private.chat_members set status = 'active', last_read_seq = v_conv.last_seq, declined_at = null, cooldown_until = null, request_count = 0
          where conversation_id = v_conv.id and user_id = v_actor;
      end if;
      select count(*) into v_silent_count from private.chat_rate_events e
        where e.actor_id = v_actor and e.kind = 'silent' and e.conversation_id = v_conv.id and e.consumed_at is null;
      if v_pm.status in ('requested','declined','left') and coalesce(v_pm.request_count, 0) + v_silent_count >= 3 then
        raise exception 'Wait for a reply before sending more messages.' using errcode = '54000', hint = 'request_pending';
      end if;
      insert into private.chat_rate_events(actor_id, kind, conversation_id, client_msg_id, synthetic_id, seq, body_hash)
        values (v_actor, 'silent', v_conv.id, p_client_msg_id, gen_random_uuid(), v_conv.last_seq + 1 + v_silent_count, v_hash) returning * into v_evt;
      perform private.chat_notify(v_actor, 'chat.message', v_conv.id, v_evt.seq);
      return jsonb_build_object('conversationId', v_conv.id, 'state', private.chat_view_state(v_conv.id, v_actor), 'replayed', false,
        'message', jsonb_build_object('id', v_evt.synthetic_id, 'clientMsgId', p_client_msg_id, 'seq', v_evt.seq, 'body', p_body, 'createdAt', v_evt.created_at, 'mine', true));
    end if;
    -- A real send consumes earlier silent rows (kept as tombstones: a retry of an old silent id is never delivered).
    update private.chat_rate_events e set consumed_at = clock_timestamp()
      where e.actor_id = v_actor and e.kind = 'silent' and e.conversation_id = v_conv.id and e.consumed_at is null;

    if v_am.status in ('requested','declined') then
      -- Reply = accept.
      update private.chat_members set status = 'active', last_read_seq = v_conv.last_seq, declined_at = null, cooldown_until = null, request_count = 0
        where conversation_id = v_conv.id and user_id = v_actor;
    end if;
    if v_pm.status in ('requested','declined') and v_friends then
      update private.chat_members set status = 'active', declined_at = null, cooldown_until = null, request_count = 0
        where conversation_id = v_conv.id and user_id = v_peer returning * into v_pm;
    elsif v_pm.status = 'declined' then
      update private.chat_members set status = 'requested', declined_at = null, cooldown_until = null, request_count = 0
        where conversation_id = v_conv.id and user_id = v_peer returning * into v_pm;
    end if;
    if v_pm.status = 'requested' and v_pm.request_count >= 3 then
      raise exception 'Wait for a reply before sending more messages.' using errcode = '54000', hint = 'request_pending';
    end if;

    update private.chat_conversations set last_seq = last_seq + 1, last_message_at = clock_timestamp() where id = v_conv.id returning last_seq into v_seq;
    if v_seq is null then raise exception 'Chat unavailable' using errcode = '42501'; end if;
    insert into private.chat_messages(conversation_id, seq, sender_id, client_msg_id, body) values (v_conv.id, v_seq, v_actor, p_client_msg_id, p_body) returning * into v_msg;
    if v_pm.status = 'requested' then
      update private.chat_members set request_count = request_count + 1 where conversation_id = v_conv.id and user_id = v_peer;
    end if;
    perform private.chat_notify(v_peer, 'chat.message', v_conv.id, v_seq);
    perform private.chat_notify(v_actor, 'chat.message', v_conv.id, v_seq);
    return jsonb_build_object('conversationId', v_conv.id, 'state', private.chat_view_state(v_conv.id, v_actor), 'replayed', false,
      'message', jsonb_build_object('id', v_msg.id, 'clientMsgId', v_msg.client_msg_id, 'seq', v_msg.seq, 'body', v_msg.body, 'createdAt', v_msg.created_at, 'mine', true));
  end if;

  if p_action = 'accept' then
    if v_conv.id is null or v_am.status not in ('requested','active') then raise exception 'Chat unavailable' using errcode = '42501'; end if;
    if v_am.status = 'requested' then
      update private.chat_members set status = 'active', last_read_seq = v_conv.last_seq, declined_at = null, cooldown_until = null, request_count = 0
        where conversation_id = v_conv.id and user_id = v_actor;
      if v_peer is not null and not v_blocked_by_actor and not v_blocked_me then perform private.chat_notify(v_peer, 'chat.state', v_conv.id, v_conv.last_seq); end if;
      perform private.chat_notify(v_actor, 'chat.state', v_conv.id, v_conv.last_seq);
    end if;
    return jsonb_build_object('conversationId', v_conv.id, 'state', private.chat_view_state(v_conv.id, v_actor));
  end if;

  if p_action = 'decline' then
    if v_conv.id is null or v_am.status not in ('requested','declined') then
      if v_am.status = 'active' then raise exception 'Cannot decline this chat' using errcode = '22023'; end if;
      raise exception 'Chat unavailable' using errcode = '42501';
    end if;
    if v_am.status = 'requested' then
      -- Silent to the sender: no notification to the peer.
      update private.chat_members set status = 'declined', declined_at = clock_timestamp(), cooldown_until = clock_timestamp() + interval '30 days',
        cleared_seq = v_conv.last_seq where conversation_id = v_conv.id and user_id = v_actor;
      perform private.chat_notify(v_actor, 'chat.state', v_conv.id, v_conv.last_seq);
    end if;
    return jsonb_build_object('conversationId', v_conv.id, 'state', 'declined');
  end if;

  if p_action = 'read' then
    if v_conv.id is null or v_am.status not in ('active','requested') then raise exception 'Chat unavailable' using errcode = '42501'; end if;
    v_new := v_am.last_read_seq;
    -- A pending request is never marked read (no Seen while pending); active members are monotonic and capped at last_seq.
    if v_am.status = 'active' then
      v_new := least(greatest(v_am.last_read_seq, p_up_to_seq), v_conv.last_seq);
      if v_new > v_am.last_read_seq then
        update private.chat_members set last_read_seq = v_new where conversation_id = v_conv.id and user_id = v_actor;
        if v_pm.status = 'active' and not v_blocked_by_actor and not v_blocked_me then perform private.chat_notify(v_peer, 'chat.read', v_conv.id, v_new); end if;
        perform private.chat_notify(v_actor, 'chat.read', v_conv.id, v_new);
      end if;
    end if;
    return jsonb_build_object('conversationId', v_conv.id, 'lastReadSeq', v_new, 'lastSeq', v_conv.last_seq);
  end if;

  if p_action = 'block' then
    -- seen_seq freezes what the blocked user keeps seeing as Seen (never advances while blocked).
    insert into private.chat_blocks(blocker_id, blocked_id, seen_seq)
      values (v_actor, v_peer, case when v_am.status = 'active' then v_am.last_read_seq end) on conflict do nothing;
    if v_conv.id is not null then perform private.chat_notify(v_actor, 'chat.state', v_conv.id, v_conv.last_seq); end if;
    return jsonb_build_object('conversationId', v_conv.id, 'state', 'blocked');
  end if;

  if p_action = 'unblock' then
    if v_peer is not null then delete from private.chat_blocks b where b.blocker_id = v_actor and b.blocked_id = v_peer; end if;
    if v_conv.id is not null then perform private.chat_notify(v_actor, 'chat.state', v_conv.id, v_conv.last_seq); end if;
    return jsonb_build_object('conversationId', v_conv.id,
      'state', case when v_conv.id is null then 'none' else private.chat_view_state(v_conv.id, v_actor) end);
  end if;

  -- report
  if v_conv.id is null then raise exception 'Chat unavailable' using errcode = '42501'; end if;
  delete from private.chat_rate_events e where e.actor_id = v_actor and e.kind <> 'silent' and e.created_at < clock_timestamp() - interval '2 days';
  perform private.chat_prune_reports();
  select count(*) into v_count from private.chat_rate_events e where e.actor_id = v_actor and e.kind = 'report' and e.created_at > clock_timestamp() - interval '1 hour';
  if v_count >= 10 then raise exception 'Too many reports. Please try later.' using errcode = '54000', hint = 'report_hour'; end if;
  if p_message_ids is not null and cardinality(p_message_ids) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'seq', m.seq, 'from', case when m.sender_id = v_actor then 'reporter' when m.sender_id = v_peer then 'reported' else 'unknown' end, 'body', m.body, 'createdAt', m.created_at) order by m.seq), '[]'::jsonb), count(*)
      into v_snapshot, v_count from private.chat_messages m where m.conversation_id = v_conv.id and m.id = any(p_message_ids);
    if v_count <> (select count(distinct i) from unnest(p_message_ids) i) then raise exception 'Message unavailable' using errcode = '22023'; end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'seq', t.seq, 'from', case when t.sender_id = v_actor then 'reporter' when t.sender_id = v_peer then 'reported' else 'unknown' end, 'body', t.body, 'createdAt', t.created_at) order by t.seq), '[]'::jsonb)
      into v_snapshot from (select m.* from private.chat_messages m where m.conversation_id = v_conv.id and m.sender_id is distinct from v_actor order by m.seq desc limit 10) t;
  end if;
  insert into private.chat_reports(reporter_id, reported_id, conversation_id, reason, details, snapshot)
    values (v_actor, v_peer, v_conv.id, p_reason, p_details, v_snapshot);
  insert into private.chat_rate_events(actor_id, kind) values (v_actor, 'report');
  return jsonb_build_object('conversationId', v_conv.id, 'reported', true);
end;
$$;

-- 5. Public SECURITY INVOKER wrappers (authenticated only).
create function public.get_chat_summary() returns jsonb language sql stable security invoker set search_path='' as $$ select private.chat_summary(); $$;
create function public.list_chat_conversations(folder text, cursor text default null, page_limit integer default 30) returns jsonb
  language sql stable security invoker set search_path='' as $$ select private.chat_list(folder, cursor, page_limit); $$;
create function public.list_chat_messages(conversation_id uuid, before_seq bigint default null, after_seq bigint default null, page_limit integer default 30) returns jsonb
  language sql stable security invoker set search_path='' as $$ select private.chat_messages(conversation_id, before_seq, after_seq, page_limit); $$;
create function public.mutate_chat(action text, conversation_id uuid default null, target_id uuid default null, client_msg_id uuid default null, body text default null,
  up_to_seq bigint default null, reason text default null, details text default null, message_ids uuid[] default null) returns jsonb
  language sql volatile security invoker set search_path='' as $$ select private.chat_mutate(action, conversation_id, target_id, client_msg_id, body, up_to_seq, reason, details, message_ids); $$;

-- 6. Ownership transfer to chat_rpc (needs the temporary membership + CREATE on private).
alter function private.chat_view_state(uuid, uuid) owner to chat_rpc;
alter function private.chat_can_type(uuid) owner to chat_rpc;
alter function private.chat_summary() owner to chat_rpc;
alter function private.chat_list(text, text, integer) owner to chat_rpc;
alter function private.chat_messages(uuid, bigint, bigint, integer) owner to chat_rpc;
alter function private.chat_mutate(text, uuid, uuid, uuid, text, bigint, text, text, uuid[]) owner to chat_rpc;

-- 7. Final ACLs, run while the temporary membership is still held (owner-granted privileges can only be revoked as the owner).
do $acl$
declare item record; grantee_name name; grantee_list text;
begin
  for item in select * from (values
    ('private.chat_uid()', array['chat_rpc']),
    ('private.chat_are_friends(uuid,uuid)', array['chat_rpc']),
    ('private.chat_notify(uuid,text,uuid,bigint)', array['chat_rpc']),
    ('private.chat_prune_reports()', array['chat_rpc']),
    ('private.chat_view_state(uuid,uuid)', array[]::text[]),
    ('private.chat_can_type(uuid)', array['authenticated']),
    ('private.chat_summary()', array['authenticated']),
    ('private.chat_list(text,text,integer)', array['authenticated']),
    ('private.chat_messages(uuid,bigint,bigint,integer)', array['authenticated']),
    ('private.chat_mutate(text,uuid,uuid,uuid,text,bigint,text,text,uuid[])', array['authenticated']),
    ('public.get_chat_summary()', array['authenticated']),
    ('public.list_chat_conversations(text,text,integer)', array['authenticated']),
    ('public.list_chat_messages(uuid,bigint,bigint,integer)', array['authenticated']),
    ('public.mutate_chat(text,uuid,uuid,uuid,text,bigint,text,text,uuid[])', array['authenticated'])
  ) v(sig, grantees) loop
    if to_regprocedure(item.sig) is null then raise exception 'Expected chat function missing: %', item.sig; end if;
    execute format('revoke all on function %s from public', item.sig);
    for grantee_name in select distinct r.rolname from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      join pg_roles r on r.oid = a.grantee where p.oid = to_regprocedure(item.sig) and a.grantee <> p.proowner loop
      execute format('revoke all on function %s from %I', item.sig, grantee_name);
    end loop;
    select string_agg(quote_ident(g), ',') into grantee_list from unnest(item.grantees) g;
    if grantee_list is not null then execute format('grant execute on function %s to %s', item.sig, grantee_list); end if;
  end loop;
end;
$acl$;

-- 8. Profile identity access for chat_rpc (kept late: these statements lock public.profiles).
grant select(id, username, display_name, avatar_path) on public.profiles to chat_rpc;
create policy profiles_chat_identity on public.profiles for select to chat_rpc using (true);

-- 8b. Realtime private-channel policies (no insert policy on user:*; no publication changes).
create policy chat_user_topic_select on realtime.messages for select to authenticated
  using (extension = 'broadcast' and realtime.topic() = 'user:' || ((select auth.uid())::text));
create policy chat_typing_select on realtime.messages for select to authenticated
  using (extension = 'broadcast' and (select private.chat_can_type(case when realtime.topic() ~ '^chat-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(realtime.topic(), 13)::uuid end)));
create policy chat_typing_insert on realtime.messages for insert to authenticated
  with check (extension = 'broadcast' and (select private.chat_can_type(case when realtime.topic() ~ '^chat-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(realtime.topic(), 13)::uuid end)));

-- 9. Drop migration-only capabilities last.
revoke create on schema private from chat_rpc;
revoke chat_rpc from current_user;
commit;
