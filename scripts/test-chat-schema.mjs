// LOCAL ONLY: in-memory PGlite with synthetic fixtures. No hosted DSNs, credentials or environment files.
// Covers 20261127150000_chat_v1: catalog/ACL, auth, request flow, cooldown, block, report, pagination,
// read state, deletion, replay, rate limits and realtime.messages policies.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { offlineDb, migrations, migrationDirectory } from './lib/offline-db.mjs';

const chatName = (await readdir(migrationDirectory)).find(n => /^\d{14}_chat_v1\.sql$/.test(n));
assert.ok(chatName && chatName > '20261102152400', 'chat_v1 is ordered after the connection migrations');

const SENTINEL = 'SENTINEL-body-7f3a91';
const uid = n => `61000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mid = n => `62000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rid = n => `63000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };
const failure = async p => { try { await p; } catch (e) { return e; } throw new Error('expected a rejection'); };
const reject = async (p, code, m, hint) => {
  await assert.rejects(p, e => {
    assert.equal(e.code, code, m);
    if (hint) assert.equal(e.hint, hint, m);
    assert.ok(!String(e.message).includes(SENTINEL) && !String(e.detail ?? '').includes(SENTINEL), 'error text never contains the body');
    return true;
  }, m);
  checks++;
};

const db = await offlineDb();
// The realtime stub (partitioned messages, realtime.send swallowing errors, topic GUC) comes from scripts/lib/offline-db.mjs.
const admin = () => db.exec('reset role');
const as = async (role, user = '', topic = '') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('realtime.topic',$2,false)", [user, topic]);
  await db.exec(`set role ${role}`);
};
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const summary = async () => (await q('select public.get_chat_summary() r'))[0].r;
const list = async (folder, cursor = null, limit = 30) => (await q('select public.list_chat_conversations($1,$2,$3) r', [folder, cursor, limit]))[0].r;
const msgs = async (conv, before = null, after = null, limit = 30) => (await q('select public.list_chat_messages($1,$2,$3,$4) r', [conv, before, after, limit]))[0].r;
const mutate = async (action, o = {}) => (await q('select public.mutate_chat($1,$2,$3,$4,$5,$6,$7,$8,$9) r',
  [action, o.conv ?? null, o.target ?? null, o.cid ?? null, o.body ?? null, o.upTo ?? null, o.reason ?? null, o.details ?? null, o.ids ?? null]))[0].r;
const send = (target, n, body = `hello ${n}`) => mutate('send', { target, cid: mid(n), body });
const sendIn = (conv, n, body = `hello ${n}`) => mutate('send', { conv, cid: mid(n), body });
const adminRows = async (sql, args = []) => { await admin(); return q(sql, args); };

try {
  // 1. Full migration chain, including chat_v1. Supabase-like default privileges are installed just before chat_v1
  // so the grant-stripping loops are really exercised (other suites keep their exact ACL expectations).
  await migrations(db, n => n < chatName);
  await db.exec(`alter default privileges in schema public, private grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public, private grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public, private grant all on sequences to anon, authenticated, service_role;`);
  ok((await q('select count(*)::int n from pg_default_acl'))[0].n >= 3, 'default privileges are active for the chat migration');
  await migrations(db, n => n >= chatName);
  const U = Array.from({ length: 48 }, (_, i) => uid(i + 1));
  const [A, B, C, D, E, F, G, H] = U;
  await q(`insert into auth.users(id) select unnest($1::uuid[])`, [U]);

  // 2. Catalog and ACL assertions.
  eq((await q(`select rolcanlogin,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname='chat_rpc'`))[0],
    { rolcanlogin: false, rolsuper: false, rolinherit: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  eq((await q(`select count(*)::int n from pg_auth_members where roleid='chat_rpc'::regrole or member='chat_rpc'::regrole`))[0].n, 0, 'temporary installer membership removed');
  eq((await q(`select has_schema_privilege('chat_rpc','private','USAGE') u, has_schema_privilege('chat_rpc','private','CREATE') c, has_schema_privilege('chat_rpc','auth','USAGE') a`))[0],
    { u: true, c: false, a: false }, 'chat_rpc has no CREATE and no auth schema access');
  const fnRows = await q(`select p.oid::regprocedure::text fn, p.proname, r.rolname owner, p.prosecdef def, p.proconfig, p.proacl::text acl from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.proname in ('chat_uid','chat_are_friends','chat_notify','chat_prune_reports','chat_view_state','chat_can_type','chat_summary','chat_list','chat_messages','chat_mutate',
      'get_chat_summary','list_chat_conversations','list_chat_messages','mutate_chat') order by 1`);
  eq(fnRows.length, 14);
  const expected = { // name -> [owner, security definer, EXECUTE for authenticated]
    chat_uid: ['postgres', true, false], chat_are_friends: ['postgres', true, false], chat_notify: ['postgres', true, false], chat_prune_reports: ['postgres', true, false],
    chat_view_state: ['chat_rpc', true, false], chat_can_type: ['chat_rpc', true, true], chat_summary: ['chat_rpc', true, true], chat_list: ['chat_rpc', true, true],
    chat_messages: ['chat_rpc', true, true], chat_mutate: ['chat_rpc', true, true], get_chat_summary: ['postgres', false, true], list_chat_conversations: ['postgres', false, true],
    list_chat_messages: ['postgres', false, true], mutate_chat: ['postgres', false, true] };
  for (const f of fnRows) {
    ok(f.proconfig.some(c => c === 'search_path=""'), `${f.fn} pins search_path`);
    ok(!/(^|[{,])=/.test(f.acl), `${f.fn} has no PUBLIC grant`);
    ok(!/anon=|service_role=/.test(f.acl), `${f.fn} has no anon/service_role grant`);
    eq([f.owner, f.def, /authenticated=X/.test(f.acl)], expected[f.proname], `${f.fn} owner / definer / authenticated EXECUTE`);
  }
  eq((await q(`select proacl::text a from pg_proc where oid='private.chat_uid()'::regprocedure`))[0].a.includes('chat_rpc=X'), true);
  eq((await q(`select has_function_privilege('chat_rpc','private.chat_notify(uuid,text,uuid,bigint)','EXECUTE') n,
    has_function_privilege('authenticated','private.chat_notify(uuid,text,uuid,bigint)','EXECUTE') a`))[0], { n: true, a: false });
  const tables = ['chat_conversations', 'chat_members', 'chat_messages', 'chat_blocks', 'chat_rate_events', 'chat_reports'];
  for (const t of tables) {
    const r = (await q(`select relrowsecurity rls, has_table_privilege('anon','private.${t}','SELECT,INSERT,UPDATE,DELETE') anon,
      has_table_privilege('authenticated','private.${t}','SELECT,INSERT,UPDATE,DELETE') au, has_table_privilege('service_role','private.${t}','SELECT,INSERT,UPDATE,DELETE') sr
      from pg_class where oid='private.${t}'::regclass`))[0];
    eq(r, { rls: true, anon: false, au: false, sr: false }, `${t} RLS on, no client grants`);
  }
  eq((await q(`select has_table_privilege('chat_rpc','private.chat_reports','SELECT') s, has_table_privilege('chat_rpc','private.chat_reports','INSERT') i,
    has_table_privilege('chat_rpc','private.chat_reports','UPDATE') u, has_table_privilege('chat_rpc','private.chat_messages','UPDATE') mu,
    has_table_privilege('chat_rpc','private.chat_messages','DELETE') md`))[0], { s: false, i: true, u: false, mu: false, md: false }, 'reports insert-only, messages append-only');
  eq((await q(`select count(*)::int n from pg_policies where schemaname='realtime' and tablename='messages'`))[0].n, 3);
  eq((await q(`select count(*)::int n from pg_policies where schemaname='realtime' and tablename='messages' and cmd in ('INSERT','ALL') and policyname like '%user%'`))[0].n, 0, 'no insert policy on user topics');

  // 3. Authorization: anon, no subject, service_role, direct table access.
  await as('anon'); await reject(summary(), '42501'); await reject(mutate('read', { conv: mid(1), upTo: 0 }), '42501');
  await as('service_role'); await reject(summary(), '42501', 'service_role has no EXECUTE');
  await reject(q('select private.chat_summary()'), '42501');
  await as('authenticated', ''); await reject(summary(), '28000', 'no subject');
  await as('authenticated', A);
  for (const t of tables) await reject(q(`select * from private.${t}`), '42501', `direct read of ${t}`);
  await reject(q(`insert into private.chat_blocks(blocker_id,blocked_id) values ($1,$2)`, [A, B]), '42501');
  await reject(q('select private.chat_uid()'), '42501');
  await reject(q('select private.chat_notify($1,$2,$3,1)', [B, 'chat.message', mid(1)]), '42501');
  await reject(mutate('nope'), '22023'); await reject(mutate('send', { target: A, cid: mid(1), body: 'x' }), '22023', 'self message');
  await reject(mutate('send', { target: uid(99), cid: mid(1), body: 'x' }), '42501', 'unknown target is uniformly unavailable');
  await reject(mutate('send', { target: B, body: 'x' }), '22023'); await reject(mutate('send', { target: B, cid: mid(1), body: '   ' }), '22023');
  await reject(mutate('send', { target: B, cid: mid(1), body: SENTINEL + 'x'.repeat(2001) }), '22023', 'oversize body');
  eq((await adminRows('select count(*)::int n from private.chat_messages'))[0].n, 0);

  // 4. Friends skip requests; pagination; read state; unread counts.
  await as('authenticated', A); await q('select public.mutate_profile_connection($1,$2,$3)', [B, 'request', rid(1)]);
  await as('authenticated', B); await q('select public.mutate_profile_connection($1,$2,$3,1)', [A, 'accept', rid(1)]);
  await as('authenticated', A);
  const first = await send(B, 1, `hello ${SENTINEL}`);
  eq(first.state, 'active', 'friends skip requests'); eq(first.message.seq, 1);
  const conv = first.conversationId;
  for (let n = 2; n <= 10; n++) await sendIn(conv, n);
  await as('authenticated', B);
  eq(await summary(), { unreadChats: 1, unreadMessages: 10, pendingRequests: 0 });
  eq((await list('requests')).items, []); eq((await list('chats')).items.length, 1);
  eq((await list('chats')).items[0].unreadCount, 10);
  eq((await list('chats')).items[0].lastMessage.preview, 'hello 10');
  let page = await msgs(conv, null, null, 4);
  eq(page.items.map(i => i.seq), [7, 8, 9, 10]); eq(page.hasMore, true);
  page = await msgs(conv, 7, null, 4); eq(page.items.map(i => i.seq), [3, 4, 5, 6]); eq(page.hasMore, true);
  page = await msgs(conv, 3, null, 4); eq(page.items.map(i => i.seq), [1, 2]); eq(page.hasMore, false);
  page = await msgs(conv, null, 8, 4); eq(page.items.map(i => i.seq), [9, 10]); eq(page.hasMore, false);
  page = await msgs(conv, null, 2, 3); eq(page.items.map(i => i.seq), [3, 4, 5]); eq(page.hasMore, true);
  eq(page.items[0].mine, false); eq(page.items[0].clientMsgId, null, 'peer client ids not exposed');
  await reject(msgs(conv, 5, 2), '22023');
  eq((await mutate('read', { conv, upTo: 4 })).lastReadSeq, 4);
  eq((await summary()).unreadMessages, 6);
  eq((await mutate('read', { conv, upTo: 2 })).lastReadSeq, 4, 'monotonic');
  eq((await mutate('read', { conv, upTo: 9999 })).lastReadSeq, 10, 'capped at last_seq');
  eq(await summary(), { unreadChats: 0, unreadMessages: 0, pendingRequests: 0 });
  await as('authenticated', A);
  eq((await msgs(conv)).peerReadSeq, 10, 'Seen shown for active chats');
  eq((await list('chats')).items[0].peerReadSeq, 10);
  eq((await list('chats')).items[0].unreadCount, 0, 'own messages are not unread');
  await reject(mutate('read', { conv, upTo: -1 }), '22023');

  // 5. Replay idempotency.
  const replay = await mutate('send', { conv, cid: mid(5), body: 'hello 5' });
  eq(replay.replayed, true); eq(replay.message.seq, 5);
  eq((await adminRows('select count(*)::int n from private.chat_messages'))[0].n, 10);
  await as('authenticated', A);
  await reject(mutate('send', { conv, cid: mid(5), body: `different ${SENTINEL}` }), '22023', 'mismatched replay');
  await reject(mutate('send', { target: C, cid: mid(5), body: 'hello 5' }), '22023', 'replay into another conversation');

  let cidSeq = 0;
  // 5b. Bodies of only whitespace / invisible characters are rejected (explicit code points); mixed bodies pass.
  await admin(); await q('delete from private.chat_rate_events where actor_id=$1', [A]); await as('authenticated', A);
  for (const body of ['\u200b\u200c\u200d', '\u00a0', '\ufeff', '\u2060', '\u200e\u200f', '\u202a\u202b\u202c\u202d\u202e', '\u2066\u2067\u2068\u2069', ' \u200b \t\n\u00a0\ufeff', '\u3000', '\u2003', '\u034f', '\u061c', '\u115f\u1160', '\u3164\uffa0', '\u2800', '\u{e0001}\u{e0020}\u{e007f}'])
    await reject(sendIn(conv, 5000 + (cidSeq += 1), body), '22023', `invisible-only body ${JSON.stringify(body)}`);
  eq((await sendIn(conv, 5100, 'a\u200b')).message.body, 'a\u200b', 'visible character plus a zero-width one is accepted');
  await admin(); await q('delete from private.chat_rate_events where actor_id=$1', [A]); await as('authenticated', A);

  // 6. Request flow (non-friends): 3-message cap, reply = accept, Seen hidden while pending.
  await as('authenticated', D);
  const r1 = await send(E, 101);
  eq(r1.state, 'pending'); const reqConv = r1.conversationId;
  await sendIn(reqConv, 102); await sendIn(reqConv, 103);
  await reject(sendIn(reqConv, 104), '54000', '4th pending message', 'request_pending');
  eq((await adminRows('select count(*)::int n from private.chat_messages where conversation_id=$1', [reqConv]))[0].n, 3);
  await as('authenticated', D);
  eq((await list('chats')).items[0].state, 'pending'); eq((await summary()).pendingRequests, 0);
  await as('authenticated', E);
  eq(await summary(), { unreadChats: 0, unreadMessages: 0, pendingRequests: 1 });
  eq((await list('chats')).items, []); const reqs = await list('requests');
  eq(reqs.items.length, 1); eq(reqs.items[0].state, 'request'); eq(reqs.summary.pendingRequests, 1);
  eq((await msgs(reqConv)).items.length, 3, 'recipient reads the request thread');
  eq((await mutate('read', { conv: reqConv, upTo: 3 })).lastReadSeq, 0, 'read is a no-op while pending');
  await as('authenticated', D); eq((await msgs(reqConv)).peerReadSeq, null, 'no Seen while pending');
  await as('authenticated', E);
  eq((await sendIn(reqConv, 105, 'reply')).state, 'active', 'recipient reply = accept');
  eq(await summary(), { unreadChats: 0, unreadMessages: 0, pendingRequests: 0 });
  await as('authenticated', D);
  eq((await list('chats')).items[0].state, 'active'); eq((await sendIn(reqConv, 106)).message.seq, 5, 'cap gone after accept');
  eq((await summary()).unreadMessages, 1);

  // 7. Decline: silent, 30-day cooldown, silent no-deliver sends, counted against limits.
  await as('authenticated', F); const dc = (await send(G, 201)).conversationId;
  await as('authenticated', G);
  const declined = await mutate('decline', { conv: dc }); eq(declined.state, 'declined');
  eq((await mutate('decline', { conv: dc })).state, 'declined', 'decline is idempotent');
  eq(await summary(), { unreadChats: 0, unreadMessages: 0, pendingRequests: 0 });
  eq((await list('requests')).items, []); eq((await list('chats')).items, []);
  await reject(msgs(dc), '42501', 'declined member sees nothing');
  const before = (await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${G}`]))[0].n;
  await as('authenticated', F);
  const evBefore = (await adminRows(`select count(*)::int n from private.chat_rate_events where actor_id=$1 and kind='message'`, [F]))[0].n;
  await as('authenticated', F);
  const silent = await sendIn(dc, 202, `silent ${SENTINEL}`);
  eq(silent.state, 'pending'); eq(Object.keys(silent.message).sort(), Object.keys(first.message).sort(), 'same response shape');
  const stored = await adminRows('select count(*)::int n from private.chat_messages where conversation_id=$1', [dc]);
  eq(stored[0].n, 1, 'silent send writes no message');
  eq((await adminRows(`select count(*)::int n from private.chat_rate_events where actor_id=$1 and kind='message'`, [F]))[0].n, evBefore + 1, 'silent send counts against limits');
  eq((await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${G}`]))[0].n, before, 'no signal delivered to the decliner');
  eq((await adminRows(`select cooldown_until > clock_timestamp() + interval '29 days' ok from private.chat_members where user_id=$1 and conversation_id=$2`, [G, dc]))[0].ok, true);
  await admin(); await q(`update private.chat_members set cooldown_until = clock_timestamp() - interval '1 second' where user_id=$1 and conversation_id=$2`, [G, dc]);
  await as('authenticated', F); eq((await sendIn(dc, 203, 'after cooldown')).state, 'pending');
  await as('authenticated', G);
  eq((await summary()).pendingRequests, 1, 'new request after cooldown'); eq((await msgs(dc)).items.map(i => i.body), ['after cooldown'], 'declined messages stay hidden');

  // 8. Block is silent to the blocked person; blocker sees Blocked; unblock restores delivery.
  await as('authenticated', H); const bc = (await send(B, 301)).conversationId;
  await as('authenticated', B);
  eq((await sendIn(bc, 302, 'reply')).state, 'active'); // reply = accept (H -> B non-friends)
  eq((await mutate('block', { target: H })).state, 'blocked');
  eq((await mutate('block', { target: H })).state, 'blocked', 'block idempotent');
  const blockedItem = (await list('chats')).items.find(i => i.id === bc);
  eq([blockedItem.state, blockedItem.lastMessage, blockedItem.canSend], ['blocked', null, false]);
  await reject(sendIn(bc, 303), '22023', 'blocker must unblock first');
  await as('authenticated', H);
  const sig = await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${B}`]);
  await as('authenticated', H);
  const hs = await sendIn(bc, 304, `blocked ${SENTINEL}`);
  eq(hs.state, 'active', 'blocked sender in a formerly active chat looks active'); eq(Object.keys(hs.message).sort(), Object.keys(first.message).sort());
  eq((await adminRows('select count(*)::int n from private.chat_messages where conversation_id=$1', [bc]))[0].n, 2, 'blocked send writes nothing');
  eq((await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${B}`]))[0].n, sig[0].n, 'no signal to the blocker');
  eq((await list('chats')).items[0].state, 'active'); eq((await msgs(bc)).peerReadSeq, 1, 'Seen frozen at the blocker last_read_seq at block time (active view)');
  await as('authenticated', B); eq((await mutate('read', { conv: bc, upTo: 99 })).lastReadSeq, 2, 'blocker can still read');
  await as('authenticated', H);
  eq([(await msgs(bc)).peerReadSeq, (await list('chats')).items[0].peerReadSeq], [1, 1], 'Seen never advances for the blocked user');
  await as('authenticated', B); await mutate('unblock', { target: H });
  eq((await list('chats')).items.find(i => i.id === bc).state, 'active');
  await as('authenticated', H); eq((await sendIn(bc, 305, 'delivered')).message.seq, 3);
  // Block with no prior conversation: a shell conversation (members, last_seq 0, no messages) gives a real conversationId.
  await as('authenticated', C); await mutate('block', { target: A });
  await as('authenticated', A);
  const nb = await send(C, 306); eq(nb.state, 'pending');
  eq((await adminRows('select count(*)::int n from private.chat_messages where conversation_id=$1', [nb.conversationId]))[0].n, 0);
  eq((await adminRows('select last_seq, (select count(*)::int from private.chat_members where conversation_id=c.id) members from private.chat_conversations c where id=$1', [nb.conversationId]))[0], { last_seq: 0, members: 2 }, 'shell conversation');
  const reqEvents = async who => (await adminRows(`select count(*)::int n from private.chat_rate_events where actor_id=$1 and kind='request'`, [who]))[0].n;
  const shellRequests = await reqEvents(A);
  eq((await adminRows(`select count(*)::int n from private.chat_rate_events where actor_id=$1 and kind='silent'`, [A]))[0].n, 1, 'silent send recorded as an id/seq row only');
  await as('authenticated', A); eq((await sendIn(nb.conversationId, 307, 'repeat silent')).message.seq, 2, 'seq advances like a pending send');
  eq(await reqEvents(A), shellRequests, 'further silent sends are not new requests');
  await as('authenticated', C); await mutate('unblock', { target: A });
  await as('authenticated', A); const first_real = await sendIn(nb.conversationId, 308, 'first real');
  eq(first_real.message.seq, 1, 'first stored message of the shell');
  eq(await reqEvents(A), shellRequests + 1, 'first stored message of a shell counts as a new request (no unblock bypass of the hourly cap)');
  eq((await adminRows(`select count(*)::int n from private.chat_rate_events where actor_id=$1 and kind='silent' and conversation_id=$2 and consumed_at is null`, [A, nb.conversationId]))[0].n, 0, 'silent rows consumed by the next real send');
  eq((await adminRows(`select count(*)::int n from private.chat_rate_events where actor_id=$1 and kind='silent' and conversation_id=$2`, [A, nb.conversationId]))[0].n, 2, 'consumed silent rows stay as tombstones');
  // Retry of the old silent id after unblock + real send: stored replay, never delivered.
  { const msgsBefore = (await adminRows('select count(*)::int n from private.chat_messages where conversation_id=$1', [nb.conversationId]))[0].n;
    const rtBefore = (await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${C}`]))[0].n;
    await as('authenticated', A);
    const retry = await mutate('send', { conv: nb.conversationId, cid: mid(306), body: 'hello 306' });
    eq([retry.replayed, retry.message.id, retry.message.seq], [true, nb.message.id, nb.message.seq], 'retry of an old silent id returns the stored replay');
    await reject(mutate('send', { conv: nb.conversationId, cid: mid(306), body: `different ${SENTINEL}` }), '22023', 'old silent id with a different body conflicts');
    eq((await adminRows('select count(*)::int n from private.chat_messages where conversation_id=$1', [nb.conversationId]))[0].n, msgsBefore, 'old silent id is never delivered');
    eq((await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${C}`]))[0].n, rtBefore, 'and sends no signal to the peer');
    // 24 h: the hash is nulled and a replay then matches by client_msg_id alone.
    await admin(); await q(`update private.chat_rate_events set created_at = clock_timestamp() - interval '25 hours' where actor_id=$1 and client_msg_id=$2`, [A, mid(306)]);
    await as('authenticated', A); await sendIn(nb.conversationId, 309, 'trigger housekeeping');
    eq((await adminRows(`select body_hash is null n from private.chat_rate_events where actor_id=$1 and client_msg_id=$2`, [A, mid(306)]))[0].n, true, 'hash cleared after 24 h');
    await as('authenticated', A); eq((await mutate('send', { conv: nb.conversationId, cid: mid(306), body: 'anything' })).replayed, true, 'replay after hash expiry matches by id alone');
    await admin(); await q(`update private.chat_rate_events set created_at = clock_timestamp() - interval '31 days' where actor_id=$1 and client_msg_id=$2`, [A, mid(306)]);
    await as('authenticated', A); await sendIn(nb.conversationId, 310, 'trigger housekeeping again');
    eq((await adminRows(`select count(*)::int n from private.chat_rate_events where actor_id=$1 and client_msg_id=$2`, [A, mid(306)]))[0].n, 0, 'tombstones are pruned after 30 days'); }
  await as('authenticated', C); eq((await list('requests')).items.length, 1, 'after unblock and a real message the request is visible');

  // 8b. The silent path behaves exactly like an untouched pending request (cap, seq, replay).
  const trio = async (from, to, n) => { await as('authenticated', from); const c = (await send(to, n)).conversationId; await sendIn(c, n + 1); await sendIn(c, n + 2); return c; };
  const ctl = await trio(U[24], U[25], 900);
  const capCtl = await failure(sendIn(ctl, 903));
  eq([capCtl.code, capCtl.hint], ['54000', 'request_pending'], 'control: untouched pending request is capped');
  const dcap = await trio(U[26], U[27], 910);
  await as('authenticated', U[27]); await mutate('decline', { conv: dcap });
  await as('authenticated', U[26]);
  const dErr = await failure(sendIn(dcap, 913)); eq([dErr.code, dErr.hint, dErr.message], [capCtl.code, capCtl.hint, capCtl.message], '4th send after a decline == pending cap');
  const bcap = await trio(U[28], U[29], 920);
  await as('authenticated', U[29]); await mutate('block', { target: U[28] });
  await as('authenticated', U[28]);
  const bErr = await failure(sendIn(bcap, 923)); eq([bErr.code, bErr.hint, bErr.message], [capCtl.code, capCtl.hint, capCtl.message], '4th send after a block == pending cap');
  // seq, ids and replay after one real message, then decline / block
  const realSeqs = []; { await as('authenticated', U[30]); const c = (await send(U[31], 930)).conversationId; realSeqs.push(1);
    const r2 = await sendIn(c, 931); const r3 = await sendIn(c, 932); realSeqs.push(r2.message.seq, r3.message.seq);
    const replayReal = await mutate('send', { conv: c, cid: mid(931), body: 'hello 931' });
    eq([replayReal.replayed, replayReal.message.id, replayReal.message.seq], [true, r2.message.id, r2.message.seq], 'control replay'); }
  eq(realSeqs, [1, 2, 3]);
  for (const kind of ['decline', 'block']) {
    const sender = kind === 'decline' ? U[32] : U[34], other = kind === 'decline' ? U[33] : U[35], base = kind === 'decline' ? 940 : 950;
    await as('authenticated', sender); const c = (await send(other, base)).conversationId;
    await as('authenticated', other); await mutate(kind, kind === 'decline' ? { conv: c } : { target: sender });
    await as('authenticated', sender);
    const s1 = await sendIn(c, base + 1, `silent one ${SENTINEL}`), s2 = await sendIn(c, base + 2, `silent two ${SENTINEL}`);
    eq([s1.message.seq, s2.message.seq], [2, 3], `${kind}: seq advances like a real pending send`);
    ok(s1.message.id !== s2.message.id && s1.message.id !== null, `${kind}: distinct ids`);
    const rp = await mutate('send', { conv: c, cid: mid(base + 1), body: `silent one ${SENTINEL}` });
    eq([rp.replayed, rp.message.id, rp.message.seq, rp.message.createdAt], [true, s1.message.id, s1.message.seq, s1.message.createdAt], `${kind}: replay returns the same id/seq`);
    await reject(mutate('send', { conv: c, cid: mid(base + 1), body: `changed ${SENTINEL}` }), '22023', `${kind}: mismatched silent replay`);
    await reject(sendIn(c, base + 3), '54000', `${kind}: 4th message capped`, 'request_pending');
    eq((await adminRows(`select count(*)::int n from private.chat_rate_events where kind='silent' and body_hash is not null and conversation_id=$1`, [c]))[0].n, 2);
    eq([(await msgs(c)).peerReadSeq, (await list('chats')).items.find(i => i.id === c).peerReadSeq, (await msgs(c)).state], [null, null, 'pending'], `${kind}: pending view never shows Seen`);
    eq((await adminRows(`select count(*)::int n from private.chat_rate_events where conversation_id=$1 and (body_hash::text like $2)`, [c, '%SENTINEL%']))[0].n, 0, 'only a hash, never text');
    eq((await adminRows('select count(*)::int n from private.chat_messages where conversation_id=$1', [c]))[0].n, 1);
  }

  // 8b2. The silent path emits the sender's own chat.message signal (ids + seq only) and nothing to the peer.
  { const [X, Y] = [U[40], U[41]];
    await as('authenticated', X); const c = (await send(Y, 970)).conversationId;
    await as('authenticated', Y); await mutate('decline', { conv: c });
    const own = async u => (await adminRows(`select payload from realtime.messages where topic=$1 and event='chat.message'`, [`user:${u}`])).length;
    const peerRt = (await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${Y}`]))[0].n, ownBefore = await own(X);
    await as('authenticated', X); const sl = await sendIn(c, 971, `silent ${SENTINEL}`);
    eq(await own(X), ownBefore + 1, 'silent send signals the sender own topic like a real send');
    const last = (await adminRows(`select payload from realtime.messages where topic=$1 and event='chat.message' order by inserted_at desc limit 1`, [`user:${X}`]))[0].payload;
    eq([Object.keys(last).sort(), last.seq, last.conversationId], [['conversationId', 'seq'], sl.message.seq, c], 'signal carries ids and seq only');
    eq((await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${Y}`]))[0].n, peerRt, 'nothing for the peer'); }

  // 8b3. A blocked replier in a received request moves to Chats like a real reply; nothing is delivered.
  { const [X, Y] = [U[42], U[43]];
    await as('authenticated', X); const c = (await send(Y, 975)).conversationId;
    await mutate('block', { target: Y });
    await as('authenticated', Y);
    eq([(await list('requests')).items.length, (await list('chats')).items.length], [1, 0], 'request is in Requests before the reply');
    const xRt = (await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${X}`]))[0].n; await as('authenticated', Y);
    const rr = await sendIn(c, 976, `reply ${SENTINEL}`);
    eq(rr.state, 'active', 'blocked reply looks like a real reply (active)'); eq(rr.message.seq, 2);
    const v = await list('chats'); eq([v.items.length, v.items[0].id, v.items[0].state, (await list('requests')).items.length], [1, c, 'active', 0], 'moved to Chats');
    eq((await summary()).pendingRequests, 0);
    eq((await adminRows('select count(*)::int n from private.chat_messages where conversation_id=$1', [c]))[0].n, 1, 'reply not stored');
    eq((await adminRows(`select count(*)::int n from realtime.messages where topic=$1`, [`user:${X}`]))[0].n, xRt, 'blocker receives nothing'); }

  // 8c. list_chat_conversations cursor pagination and invalid cursors.
  await as('authenticated', U[36]);
  const pc = []; for (const t of [U[37], U[38], U[39]]) { pc.push((await send(t, 960 + pc.length)).conversationId); await new Promise(r => setTimeout(r, 5)); }
  const pg1 = await list('chats', null, 2); eq(pg1.items.length, 2); ok(pg1.nextCursor, 'cursor issued');
  const pg2 = await list('chats', JSON.stringify(pg1.nextCursor), 2); eq(pg2.items.length, 1); eq(pg2.nextCursor, null);
  eq([...pg1.items, ...pg2.items].map(i => i.id), [...pc].reverse(), 'newest first, each conversation once');
  for (const bad of ['{}', '[]', 'not json', '{"time":"x","id":"y"}', `{"time":"2026-01-01T00:00:00Z","pad":"${'z'.repeat(600)}"}`]) await reject(list('chats', bad), '22023', `invalid cursor ${bad.slice(0, 16)}`);
  await reject(list('nope'), '22023', 'invalid folder');

  // 9. Reports: insert-only, snapshot readable by owner SQL only, limit.
  await as('authenticated', B);
  const target = (await msgs(bc)).items.find(i => !i.mine);
  await reject(mutate('report', { conv: bc, reason: 'bogus' }), '22023');
  await reject(mutate('report', { conv: bc, reason: 'spam', ids: [mid(9999)] }), '22023', 'unknown message id');
  eq((await mutate('report', { conv: bc, reason: 'spam', ids: [target.id], details: 'note' })).reported, true);
  eq((await adminRows('select snapshot, reporter_id, reported_id from private.chat_reports'))[0].snapshot[0].body, 'hello 301');
  await as('chat_rpc', B); await reject(q('select * from private.chat_reports'), '42501', 'chat_rpc cannot read reports');
  await reject(q('update private.chat_reports set reason=$1', ['spam']), '42501'); await reject(q('delete from private.chat_reports'), '42501');
  await as('authenticated', B); await reject(q('select * from private.chat_reports'), '42501');
  await reject(mutate('report', { conv: reqConv, reason: 'spam' }), '42501', 'non-member cannot report');
  for (let n = 1; n < 10; n++) await mutate('report', { conv: bc, reason: 'other' });
  await reject(mutate('report', { conv: bc, reason: 'other' }), '54000', 'report limit', 'report_hour');

  // 9b. Report retention: 90 days, pruned on the report path; snapshots carry role labels, never user ids.
  await admin(); await q(`update private.chat_reports set created_at = clock_timestamp() - interval '91 days' where reporter_id=$1`, [B]);
  await as('authenticated', A);
  eq((await mutate('report', { conv, reason: 'spam', ids: (await msgs(conv)).items.slice(0, 2).map(i => i.id) })).reported, true);
  eq((await adminRows('select count(*)::int n from private.chat_reports where reporter_id=$1', [B]))[0].n, 0, 'reports older than 90 days are pruned on the report path');
  await admin(); await q(`update private.chat_reports set created_at = clock_timestamp() - interval '89 days' where reporter_id=$1`, [A]);
  await as('authenticated', A); await mutate('report', { conv, reason: 'other' });
  eq((await adminRows('select count(*)::int n from private.chat_reports where reporter_id=$1', [A]))[0].n, 2, 'reports younger than 90 days are kept');
  { const snaps = (await adminRows('select snapshot::text t from private.chat_reports')).map(r => r.t).join(' ');
    ok(snaps.length > 10 && U.every(id => !snaps.includes(id)), 'snapshots contain no user ids');
    ok(/"from": ?"(reported|reporter)"/.test(snaps), 'snapshots carry role labels'); }

  // 10. Non-members get one uniform error; participants isolated.
  await as('authenticated', C);
  await reject(msgs(conv), '42501'); await reject(sendIn(conv, 401), '42501'); await reject(mutate('read', { conv, upTo: 1 }), '42501');
  await reject(mutate('accept', { conv }), '42501'); await reject(msgs(mid(98765)), '42501', 'nonexistent id gives the same error');
  eq((await list('chats')).items.length, 0);

  // 11. Account deletion keeps the peer's history.
  await as('authenticated', D); eq((await mutate('report', { conv: reqConv, reason: 'harassment' })).reported, true);
  eq((await adminRows('select reported_id from private.chat_reports where conversation_id=$1', [reqConv]))[0].reported_id, E);
  await admin(); await q('delete from auth.users where id=$1', [E]);
  eq((await q('select reported_id, reporter_id, snapshot::text t from private.chat_reports where conversation_id=$1', [reqConv]))[0].reported_id, null, 'report keeps working after the reported account is deleted');
  { const r = (await q('select snapshot::text t from private.chat_reports where conversation_id=$1', [reqConv]))[0]; ok(!r.t.includes(E) && !r.t.includes(D) && r.t.includes('"reported"'), 'deleted account id is not in the snapshot'); }
  await as('authenticated', D);
  const dli = (await list('chats')).items.find(i => i.id === reqConv);
  eq([dli.peer.displayName, dli.peer.id, dli.peer.deleted, dli.canSend], ['Deleted traveler', null, true, false]);
  const hist = await msgs(reqConv); eq(hist.items.length, 5);
  ok(hist.items.some(i => i.senderDeleted), 'deleted sender kept as senderDeleted');
  await reject(sendIn(reqConv, 501), '42501', 'cannot message a deleted traveler');
  eq((await mutate('read', { conv: reqConv, upTo: 99 })).lastReadSeq, 5, 'read still works');

  // 12. Realtime signals carry ids + seq only; failures never roll back; policies.
  await admin();
  const sig2 = await q(`select payload, event, private from realtime.messages where topic=$1 order by inserted_at desc limit 1`, [`user:${B}`]);
  ok(sig2.length === 1);
  for (const r of await q('select payload::text p, event from realtime.messages where event like $1', ['chat.%'])) {
    ok(!r.p.includes(SENTINEL) && !r.p.includes('hello'), 'payload has no body text');
    ok(['chat.message', 'chat.read', 'chat.state'].includes(r.event));
  }
  eq(Object.keys((await q(`select payload from realtime.messages where event='chat.message' limit 1`))[0].payload).sort(), ['conversationId', 'seq']);
  eq((await q(`select bool_and(private) p from realtime.messages where event like 'chat.%'`))[0].p, true);
  await q(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $$ begin raise exception 'down'; end $$`);
  await as('authenticated', A);
  eq((await sendIn(conv, 601)).message.seq, 12, 'send succeeds although realtime.send fails');
  await admin();
  await q(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $$
    begin begin perform set_config('realtime.topic', topic, true);
    insert into realtime.messages(payload, event, topic, private, extension) values (payload, event, topic, private, 'broadcast');
    exception when others then raise warning 'x'; end; end $$`);
  await q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','x'),($2,'broadcast','{}','x'),($3,'broadcast','{}','x')`,
    [`user:${A}`, `user:${B}`, `chat-typing:${conv}`]);
  const visible = async (user, topic) => { await as('authenticated', user, topic); return (await q('select count(*)::int n from realtime.messages'))[0].n; };
  ok(await visible(A, `user:${A}`) > 0, 'own user topic visible'); eq(await visible(A, `user:${B}`), 0, 'other user topic hidden');
  eq(await visible(A, 'user:'), 0); eq(await visible(A, ''), 0);
  await as('authenticated', A, `user:${A}`);
  await reject(q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','x')`, [`user:${A}`]), '42501', 'client insert on user:* denied');
  ok(await visible(A, `chat-typing:${conv}`) > 0, 'active friends may subscribe to typing'); ok(await visible(B, `chat-typing:${conv}`) > 0);
  await as('authenticated', A, `chat-typing:${conv}`);
  await q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','typing')`, [`chat-typing:${conv}`]);
  checks++;
  eq(await visible(C, `chat-typing:${conv}`), 0, 'outsider denied');
  await as('authenticated', C, `chat-typing:${conv}`);
  await reject(q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','typing')`, [`chat-typing:${conv}`]), '42501');
  eq(await visible(A, 'chat-typing:not-a-uuid'), 0, 'malformed typing topic denied without error');
  eq(await visible(D, `chat-typing:${reqConv}`), 0, 'deleted peer: denied'); eq(await visible(D, `chat-typing:${dc}`), 0);
  eq(await visible(F, `chat-typing:${dc}`), 0, 'pending request: denied'); eq(await visible(G, `chat-typing:${dc}`), 0);
  await as('authenticated', B); await mutate('block', { target: A });
  ok(await visible(A, `chat-typing:${conv}`) > 0, 'blocked user can still join (a denied join would reveal the block)');
  eq(await visible(B, `chat-typing:${conv}`), 0, 'blocker neither receives nor sends typing');
  await as('authenticated', A, `chat-typing:${conv}`); await q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','typing')`, [`chat-typing:${conv}`]); checks++;
  await as('authenticated', B, `chat-typing:${conv}`);
  await reject(q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','typing')`, [`chat-typing:${conv}`]), '42501', 'blocker cannot type');
  await as('authenticated', B); await mutate('unblock', { target: A });
  ok(await visible(A, `chat-typing:${conv}`) > 0, 'unblock restores');
  await as('anon', '', `user:${A}`); eq((await q('select count(*)::int n from realtime.messages'))[0].n, 0, 'anon has no policy path');

  // 13. Rate limits (SQLSTATE 54000).
  await as('authenticated', A);
  const burst = await adminRows(`select count(*)::int n from private.chat_rate_events where actor_id=$1 and kind='message' and created_at > clock_timestamp() - interval '1 minute'`, [A]);
  await as('authenticated', A);
  for (let n = 0; n < 30 - burst[0].n; n++) await sendIn(conv, 700 + n);
  await reject(sendIn(conv, 799), '54000', '31st message in a minute', 'rate_minute');
  await admin(); await q(`update private.chat_rate_events set created_at = clock_timestamp() - interval '5 minutes' where actor_id=$1`, [A]);
  await q(`insert into private.chat_rate_events(actor_id,kind,created_at) select $1,'message',clock_timestamp() - interval '2 hours' from generate_series(1,1000)`, [A]);
  await as('authenticated', A); await reject(sendIn(conv, 798), '54000', 'daily limit', 'rate_day');
  await admin(); await q('delete from private.chat_rate_events where actor_id=$1', [A]);
  await as('authenticated', U[10]);
  for (let n = 0; n < 10; n++) await send(U[11 + n], 800 + n);
  await reject(send(U[21], 811), '54000', '11th new request in an hour', 'request_hour');
  await as('authenticated', U[10]); await reject(send(U[22], 812), '54000', 'still capped');
  console.log(`test-chat-schema: ${checks} checks passed`);
} finally {
  await db.close();
}
