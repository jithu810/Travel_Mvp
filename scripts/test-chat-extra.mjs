// LOCAL ONLY: in-memory PGlite, synthetic fixtures. No hosted DSNs, credentials or environment files.
// Independent adversarial cases for 20261127150000_chat_v1 (owner decisions 2026-11-27, option A: blocked and
// cooldown sends store nothing and answer pending-shaped).
// Hard checks must hold, otherwise the run throws. FINDINGS (finding(...)) are desired properties that do NOT hold:
// they are collected, printed with an id and make the process exit with code 1 after the run. NOTES are informational.
import assert from 'node:assert/strict';
import { offlineDb, migrations } from './lib/offline-db.mjs';

const SENT = 'ZZSENT-4c1d9e';
const uid = n => `64a0c0d0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mid = n => `65000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rid = n => `66000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0, cidN = 1000, ridN = 0;
const findings = [], notes = [];
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };
const finding = (id, severity, text, holds) => { if (holds) checks++; else findings.push({ id, severity, text }); };
const note = text => notes.push(text);
const nextCid = () => mid(++cidN);
// Server-side error fields only: PGlite also copies the caller's own bind params onto the JS error object (client side, not a DB leak).
const full = e => JSON.stringify(['message', 'detail', 'hint', 'where', 'internalQuery', 'schema', 'table', 'column', 'constraint', 'dataType', 'routine'].map(k => e[k] ?? null));
const sig = e => ({ code: e.code, message: e.message, hint: e.hint ?? null, detail: e.detail ?? null });
const failure = async p => { try { await p; } catch (e) { return e; } throw new Error('expected a rejection'); };
const reject = async (p, code, m) => {
  const e = await failure(p);
  if (code) assert.equal(e.code, code, `${m ?? ''} (${e.message})`);
  assert.ok(!full(e).includes(SENT), `error text must not contain a body sentinel: ${m ?? ''}`);
  checks++; return e;
};

const db = await offlineDb();
const admin = () => db.exec('reset role');
const as = async (role, user = '', topic = '') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('realtime.topic',$2,false)", [user, topic]);
  await db.exec(`set role ${role}`);
};
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const aq = async (sql, args = []) => { await admin(); return q(sql, args); };
const summary = async () => (await q('select public.get_chat_summary() r'))[0].r;
const list = async (folder, cursor = null, limit = 30) => (await q('select public.list_chat_conversations($1,$2,$3) r', [folder, cursor, limit]))[0].r;
const msgs = async (conv, before = null, after = null, limit = 30) => (await q('select public.list_chat_messages($1,$2,$3,$4) r', [conv, before, after, limit]))[0].r;
const mutate = async (action, o = {}) => (await q('select public.mutate_chat($1,$2,$3,$4,$5,$6,$7,$8,$9) r',
  [action, o.conv ?? null, o.target ?? null, o.cid ?? null, o.body ?? null, o.upTo ?? null, o.reason ?? null, o.details ?? null, o.ids ?? null]))[0].r;
const send = (target, body, cid = nextCid()) => mutate('send', { target, cid, body });
const sendIn = (conv, body, cid = nextCid()) => mutate('send', { conv, cid, body });
const resetRate = async () => { await admin(); await q('delete from private.chat_rate_events'); };
const rtTopic = async u => (await aq('select count(*)::int n from realtime.messages where topic=$1', [`user:${u}`]))[0].n;
const rtChat = async () => (await aq(`select count(*)::int n from realtime.messages where event like 'chat.%'`))[0].n;
const msgCount = async conv => (await aq('select count(*)::int n from private.chat_messages where conversation_id=$1', [conv]))[0].n;
const befriend = async (a, b) => {
  const r = rid(++ridN);
  await as('authenticated', a); await q('select public.mutate_profile_connection($1,$2,$3)', [b, 'request', r]);
  await as('authenticated', b); await q('select public.mutate_profile_connection($1,$2,$3,1)', [a, 'accept', r]);
};
const item = async (user, folder, conv) => { await as('authenticated', user); return (await list(folder, null, 50)).items.find(i => i.id === conv); };
const seedBulk = async (a, b, n, sender) => {
  await admin();
  const c = (await q(`insert into private.chat_conversations(user_low,user_high,last_seq,last_message_at) values (least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$3,clock_timestamp()) returning id`, [a, b, n]))[0].id;
  await q(`insert into private.chat_members(conversation_id,user_id,status) values ($1,$2,'active'),($1,$3,'active')`, [c, a, b]);
  await q(`insert into private.chat_messages(conversation_id,seq,sender_id,client_msg_id,body) select $1,g,$2,gen_random_uuid(),'bulk '||g from generate_series(1,$3::int) g`, [c, sender, n]);
  return c;
};
const invariant = async (user, label) => {
  await as('authenticated', user);
  const s = await summary(), chats = await list('chats', null, 50), reqs = await list('requests', null, 50);
  eq(chats.summary, s, `${label}: list summary equals get_chat_summary`);
  eq(chats.items.reduce((n, i) => n + i.unreadCount, 0), s.unreadMessages, `${label}: unread messages = sum of chat unread`);
  eq(chats.items.filter(i => i.unreadCount > 0).length, s.unreadChats, `${label}: unread chats`);
  eq(reqs.items.length, s.pendingRequests, `${label}: pending requests = request folder`);
  eq(reqs.items.reduce((n, i) => n + i.unreadCount, 0), 0, `${label}: pending requests never count as unread`);
  return { s, chats, reqs };
};

try {
  await migrations(db);
  const U = Array.from({ length: 80 }, (_, i) => uid(i + 1));
  await q('insert into auth.users(id) select unnest($1::uuid[])', [U]);
  // Distinct sentinel names so a name leaking into a payload is detectable.
  for (let i = 0; i < U.length; i++) await q('update public.profiles set display_name=$2, username=$3 where id=$1', [U[i], `NAMESENT ${i + 1}`, `namesent${i + 1}`]);
  const u = n => U[n - 1];
  // admin-seeded rows used by the policy cases
  await q(`insert into realtime.messages(topic, extension, payload, event) values ('seed','broadcast','{}','x'),('seed','presence','{}','x')`);

  // ---------- 1. Body edge cases ----------
  {
    const [A, B] = [u(1), u(2)];
    await befriend(A, B); await as('authenticated', A);
    const accepted = [
      `'; drop table private.chat_messages; --`, `"} ]{'a':1}`, '{"conversationId":"x","seq":1}', '$$ ; select pg_sleep(10) $$', '\\u0000 \\x00 %s %I %L',
      '<script>alert(1)</script>', '😀 emoji ñ 日本語 مرحبا', '  leading and trailing  ', 'line1\nline2\ttab\r\nline3', 'a'.repeat(2000), '😀'.repeat(2000), 'é'.repeat(1000),
      `x${SENT}${'y'.repeat(1990)}`.slice(0, 2000)
    ];
    let conv = null;
    for (const body of accepted) {
      const r = conv ? await sendIn(conv, body) : await send(B, body); conv ??= r.conversationId;
      eq(r.message.body, body, 'send echoes the body verbatim');
    }
    eq((await adminCount('select count(*)::int n from private.chat_messages')), accepted.length, 'every accepted body stored once');
    await as('authenticated', B);
    const stored = (await msgs(conv, null, null, 100)).items.map(i => i.body);
    eq(stored, accepted, 'bodies round-trip byte-for-byte (no trimming, no escaping, no injection effect)');
    ok((await aq(`select to_regclass('private.chat_messages') is not null ok`))[0].ok, 'injection-ish body did not drop the table');
    await resetRate(); await as('authenticated', A);
    const before = await adminCount('select count(*)::int n from private.chat_messages');
    for (const [label, body] of [['empty', ''], ['space', ' '], ['mixed ASCII whitespace', '\t\n\r \u000b\u000c'], ['null', null],
      ['2001 ascii', 'x'.repeat(2001)], ['2001 emoji', '😀'.repeat(2001)], ['2001 with sentinel', SENT + 'x'.repeat(2001 - SENT.length)], ['10000', 'z'.repeat(10000)]]) {
      await reject(sendIn(conv, body), '22023', `rejected: ${label}`);
    }
    const nul = await failure(sendIn(conv, `a\u0000${SENT}`)); ok(!full(nul).includes(SENT), 'NUL byte body: error text has no body');
    eq(await adminCount('select count(*)::int n from private.chat_messages'), before, 'rejected bodies store nothing');
    // Exactly 2000 passes, 2001 fails (code points, not UTF-16 units / bytes).
    await resetRate(); await as('authenticated', A);
    eq((await sendIn(conv, 'k'.repeat(2000))).message.body.length, 2000, 'exactly 2000 accepted');
    await reject(sendIn(conv, 'k'.repeat(2001)), '22023', '2001 rejected');
    // Invisible-only bodies are rejected (owner decision); the same characters next to a visible one are fine.
    const stored1 = await adminCount('select count(*)::int n from private.chat_messages');
    const cp = (...c) => String.fromCodePoint(...c);
    for (const [label, body] of [['zero-width only', cp(0x200b, 0x200d, 0xfeff)], ['NBSP', cp(0xa0)], ['ideographic space', cp(0x3000)], ['em space', cp(0x2003)], ['bidi mark', cp(0x200e)],
      ['soft hyphen', cp(0xad)], ['word joiner', cp(0x2060)], ['mongolian vowel separator', cp(0x180e)], ['isolates', cp(0x2066, 0x2067, 0x2068, 0x2069)], ['line separator', cp(0x2028)],
      ['NEL', cp(0x85)], ['mixed invisible and spaces', ` ${cp(0x200b)} ${cp(0xa0)}\t${cp(0xfeff, 0x202f)}`], ['long invisible run', cp(0x200b).repeat(1999)]]) {
      await reject(sendIn(conv, body), '22023', `invisible-only rejected: ${label}`);
    }
    eq(await adminCount('select count(*)::int n from private.chat_messages'), stored1, 'invisible-only bodies store nothing');
    await resetRate(); await as('authenticated', A);
    for (const body of [`${cp(0x200b)}x`, `${cp(0xa0)}y${cp(0xa0)}`, `${cp(0x200e)}.`, `${cp(0xfeff)}ok`]) eq((await sendIn(conv, body)).message.body, body, 'invisible characters next to a visible one are accepted verbatim');
    for (const [label, body] of [['arabic letter mark', cp(0x61c)], ['combining grapheme joiner', cp(0x34f)], ['hangul filler', cp(0x3164)], ['braille blank', cp(0x2800)]]) {
      await resetRate(); await as('authenticated', A);
      try { await sendIn(conv, body); note(`still accepted (not in the invisible list, renders blank): ${label}`); } catch (e) { note(`rejected: ${label} (${e.code})`); }
    }
  }

  // ---------- 2. Non-member probing equals nonexistent conversation ----------
  {
    const [A, B, C, Dd] = [u(3), u(4), u(5), u(6)];
    await befriend(A, B); await as('authenticated', A);
    const conv = (await send(B, 'private')).conversationId;
    const ghost = mid(99999);
    // a second conversation where C is a declined member
    await as('authenticated', Dd); const declinedConv = (await send(C, 'req')).conversationId;
    await as('authenticated', C); await mutate('decline', { conv: declinedConv });
    const ops = {
      msgs: c => msgs(c), send: c => sendIn(c, 'probe'), read: c => mutate('read', { conv: c, upTo: 1 }), accept: c => mutate('accept', { conv: c }),
      decline: c => mutate('decline', { conv: c }), block: c => mutate('block', { conv: c }), unblock: c => mutate('unblock', { conv: c }),
      report: c => mutate('report', { conv: c, reason: 'spam' })
    };
    await as('authenticated', C);
    for (const [name, op] of Object.entries(ops)) {
      const real = sig(await failure(op(conv))), none = sig(await failure(op(ghost)));
      eq(real, none, `non-member ${name}: foreign conversation == nonexistent conversation`);
    }
    // outsider cannot learn anything through block/unblock either (state must not change)
    eq((await aq('select count(*)::int n from private.chat_blocks'))[0].n, 0, 'probing blocked nobody');
    // a declined member probing their declined thread gets the same answer as a stranger
    for (const name of ['msgs', 'read']) eq(sig(await failure(ops[name](declinedConv))), sig(await failure(ops[name](ghost))), `declined member ${name}`);
  }

  // ---------- 3. Blocked user cannot observe the block ----------
  {
    const [P, Q] = [u(7), u(8)];
    await befriend(P, Q);
    await as('authenticated', P); const conv = (await send(Q, 'p1')).conversationId; await sendIn(conv, 'p2'); await sendIn(conv, 'p3');
    await as('authenticated', Q); await sendIn(conv, 'q1'); await sendIn(conv, 'q2');
    await mutate('read', { conv, upTo: 5 });
    await as('authenticated', P); await sendIn(conv, 'p4'); await sendIn(conv, 'p5');
    const seenBefore = (await msgs(conv)).peerReadSeq;
    eq(seenBefore, 5, 'friend sees Seen before the block');
    const typingBefore = await visible(P, `chat-typing:${conv}`);
    ok(typingBefore > 0, 'typing allowed before the block');
    const sumBefore = await summary(); eq(sumBefore.unreadMessages, 2, 'P has Q messages unread');
    const rtP = await rtTopic(P), msgsBefore = await msgCount(conv); let rtAllBefore = 0;
    await as('authenticated', Q); await mutate('block', { target: P });
    const rtAfterBlock = await rtTopic(P);
    eq(rtAfterBlock, rtP, 'block emits nothing to the blocked user');
    eq((await mutate('read', { conv, upTo: 99 })).lastReadSeq, 7, 'blocker can still read');
    eq(await rtTopic(P), rtP, 'blocker reading emits no Seen signal to the blocked user');
    await reject(sendIn(conv, 'x'), '22023', 'blocker must unblock');
    await as('authenticated', P);
    const afterMsgs = await msgs(conv), afterItem = (await list('chats')).items.find(i => i.id === conv);
    ok(afterMsgs.peerReadSeq === null || afterMsgs.peerReadSeq <= 5, 'Seen never advances for the blocked user');
    ok(afterItem.peerReadSeq === null || afterItem.peerReadSeq <= 5, 'list Seen never advances for the blocked user');
    eq(await summary(), sumBefore, 'blocked user unread summary is unchanged by the block and the blocker reading');
    eq(afterMsgs.peerReadSeq, seenBefore, 'Seen is frozen at the block-time value for the blocked user (not null, not advancing)');
    eq(afterItem.peerReadSeq, seenBefore, 'list Seen is frozen too');
    eq(await visible(P, `chat-typing:${conv}`) > 0, true, 'blocked user can still join the typing topic (join result is not a block signal)');
    await as('authenticated', P, `chat-typing:${conv}`);
    await q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','typing')`, [`chat-typing:${conv}`]); checks++;
    eq(await visible(Q, `chat-typing:${conv}`), 0, 'blocker never receives typing (join denied for the blocker only)');
    await as('authenticated', Q, `chat-typing:${conv}`);
    await reject(q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','typing')`, [`chat-typing:${conv}`]), '42501', 'blocker cannot send typing either');
    // blocked sends: nothing stored, nothing signalled to anyone, pending-shaped
    rtAllBefore = await rtChat();
    await as('authenticated', P);
    const silent = await sendIn(conv, `silent ${SENT}`);
    eq([silent.state, silent.replayed, silent.message.seq], ['active', false, 8], 'blocked send in an active chat looks like a real active send and takes the next seq');
    eq(await msgCount(conv), msgsBefore, 'blocked send stores no message');
    eq(await rtTopic(P), rtP + 1, 'blocked send emits the sender own chat.message signal like a real send'); eq(await rtChat(), rtAllBefore + 1, 'and no signal to anyone else');
    eq((await aq(`select payload from realtime.messages where topic=$1 order by inserted_at desc limit 1`, [`user:${P}`]))[0].payload, { conversationId: conv, seq: 8 }, 'own signal carries ids and seq only');
    eq((await msgs(conv)).items.some(i => i.body.includes(SENT)), false, 'blocked sender does not see the silent body in history');
    // mutual block: unblocking by one side must not reopen
    await mutate('block', { target: Q });
    await as('authenticated', Q); await mutate('unblock', { target: P });
    eq((await item(Q, 'chats', conv)).state, 'active', 'unblocked but still blocked by the other side: still looks active (silent)');
    await as('authenticated', P); eq((await item(P, 'chats', conv)).state, 'blocked'); eq(await visible(P, `chat-typing:${conv}`), 0, 'a user who blocks cannot join typing');
    await as('authenticated', Q); const s2 = await sendIn(conv, `still silent ${SENT}`); eq(s2.state, 'active'); eq(await msgCount(conv), msgsBefore, 'still nothing stored');
    // blocker cannot be forced to see anything via reports/ids; blocked user cannot report-spam to learn state
    await as('authenticated', P); eq((await mutate('report', { conv, reason: 'spam' })).reported, true);
  }

  // ---------- 4. Declined user: cooldown, not told, no signals ----------
  {
    const [R, S] = [u(9), u(10)];
    await as('authenticated', R); const conv = (await send(S, 'first request')).conversationId;
    const snap = async () => {
      const it = await item(R, 'chats', conv); const m = await msgs(conv);
      return { state: it.state, canSend: it.canSend, lastSeq: it.lastSeq, peer: it.peerReadSeq, unread: it.unreadCount, mstate: m.state, mpeer: m.peerReadSeq, items: m.items.map(i => i.seq) };
    };
    const before = await snap(), rtR = await rtTopic(R);
    await as('authenticated', S); await mutate('decline', { conv });
    eq(await snap(), before, 'sender view is identical before and after the decline (not told)');
    eq(await rtTopic(R), rtR, 'decline emits nothing to the sender');
    const totalBefore = (await aq('select count(*)::int n from realtime.messages'))[0].n;
    const rtS0 = await rtTopic(S);
    await as('authenticated', R);
    // 1 real request message already counted: exactly 2 more pending-shaped sends, seq advancing; the 3rd is capped like a real pending request.
    for (let i = 0; i < 2; i++) { const r = await sendIn(conv, `cool ${SENT} ${i}`); eq([r.state, r.replayed, r.message.seq], ['pending', false, 2 + i], 'cooldown send is pending-shaped with an advancing seq'); }
    for (let i = 2; i < 4; i++) { const e = await reject(sendIn(conv, `cool ${SENT} ${i}`), '54000', 'cooldown cap'); eq(e.hint, 'request_pending'); }
    eq(await msgCount(conv), 1, 'cooldown sends store no messages');
    eq((await aq('select count(*)::int n from realtime.messages'))[0].n, totalBefore + 2, 'cooldown sends only add the sender own chat.message signals (2 accepted sends)');
    eq(await rtTopic(S), rtS0, 'the decliner receives nothing from cooldown sends');
    eq(await snap(), before, 'sender view unchanged after cooldown sends');
    await as('authenticated', S);
    eq(await summary(), { unreadChats: 0, unreadMessages: 0, pendingRequests: 0 }, 'decliner summary unchanged by cooldown sends');
    eq((await list('requests')).items, [], 'decliner request folder stays empty');
    await reject(msgs(conv), '42501', 'decliner sees nothing');
    // 30 day boundary
    await admin(); await q(`update private.chat_members set cooldown_until = clock_timestamp() + interval '29 days 23 hours' where conversation_id=$1 and user_id=$2`, [conv, S]);
    await as('authenticated', R); eq((await reject(sendIn(conv, 'almost'), '54000', 'still capped inside the 30 days')).hint, 'request_pending'); eq(await msgCount(conv), 1, 'still inside the 30 days');
    await admin(); await q(`update private.chat_members set cooldown_until = clock_timestamp() - interval '1 second' where conversation_id=$1 and user_id=$2`, [conv, S]);
    await as('authenticated', R); await sendIn(conv, 'after');
    await as('authenticated', S); eq((await msgs(conv)).items.map(i => i.body), ['after'], 'only the post-cooldown message is visible');
    eq((await summary()).pendingRequests, 1);
  }
  {
    // decliner writes first = reply = accept; friendship formed during cooldown skips it entirely
    const [R, S, R2, S2] = [u(11), u(12), u(13), u(14)];
    await as('authenticated', R); const c1 = (await send(S, 'hi')).conversationId;
    await as('authenticated', S); await mutate('decline', { conv: c1 });
    const r = await sendIn(c1, 'changed my mind'); eq(r.state, 'active', 'decliner reply = accept');
    await as('authenticated', R); eq((await msgs(c1)).items.map(i => i.body), ['hi', 'changed my mind']);
    await as('authenticated', R2); const c2 = (await send(S2, 'hi')).conversationId;
    await as('authenticated', S2); await mutate('decline', { conv: c2 });
    await befriend(R2, S2);
    await as('authenticated', R2); const d = await sendIn(c2, 'friends now');
    eq([d.state, d.message.seq], ['active', 2], 'friends skip the declined cooldown and deliver');
    eq((await aq('select status from private.chat_members where conversation_id=$1 and user_id=$2', [c2, S2]))[0].status, 'active');
  }
  {
    // Former side channel: silent sends must hit the same 3-message cap error as a real pending request.
    const [Rc, Sc, Rd, Sd, Rb, Sb] = [u(15), u(16), u(17), u(18), u(19), u(20)];
    const capped = async (R, S) => {
      await as('authenticated', R); const conv = (await send(S, 'm1')).conversationId; await sendIn(conv, 'm2'); await sendIn(conv, 'm3');
      return conv;
    };
    const cc = await capped(Rc, Sc);
    const control = await failure(sendIn(cc, 'm4')); eq(control.code, '54000', 'control: 4th pending message is capped');
    const cd = await capped(Rd, Sd);
    await as('authenticated', Sd); await mutate('decline', { conv: cd });
    await as('authenticated', Rd); const afterDecline = await sendIn(cd, 'm4').then(r => r, e => e);
    eq([afterDecline instanceof Error, afterDecline.code, afterDecline.hint, afterDecline.message], [true, control.code, control.hint, control.message],
      'declined sender hits the exact same cap error as an undeclined pending request (F1 fixed)');
    const cb = await capped(Rb, Sb);
    await as('authenticated', Sb); await mutate('block', { target: Rb });
    await as('authenticated', Rb); const afterBlock = await sendIn(cb, 'm4').then(r => r, e => e);
    eq([afterBlock instanceof Error, afterBlock.code, afterBlock.hint, afterBlock.message], [true, control.code, control.hint, control.message],
      'blocked sender hits the exact same cap error as an undeclined pending request (F2 fixed)');
    for (let i = 0; i < 6; i++) await sendIn(cb, `more ${i}`).catch(() => {});
    eq(await msgCount(cb), 3, 'silent sends never added messages');
  }

  // ---------- 5. Realtime payloads and routing ----------
  {
    await admin();
    const rows = await q(`select m.topic, m.event, m.private, m.payload, m.payload::text p, c.id cid, c.user_low, c.user_high, c.last_seq from realtime.messages m
      left join private.chat_conversations c on c.id = (m.payload->>'conversationId')::uuid where m.event like 'chat.%'`);
    ok(rows.length > 20, 'many signals exist to inspect');
    for (const r of rows) {
      eq(Object.keys(r.payload).sort(), ['conversationId', 'seq'], 'payload carries conversationId + seq only');
      ok(typeof r.payload.seq === 'number' && typeof r.payload.conversationId === 'string', 'payload types');
      ok(!/NAMESENT|namesent|ZZSENT|hello|"body"|username|display/i.test(r.p), 'payload has no body text and no names');
      ok(/^user:[0-9a-f-]{36}$/.test(r.topic), 'topic is a user topic'); eq(r.private, true);
      ok(['chat.message', 'chat.read', 'chat.state'].includes(r.event));
      ok(r.cid && [r.user_low, r.user_high].includes(r.topic.slice(5)), 'signal goes only to a participant of that conversation');
      // Silent sends signal the sender's own topic with their provisional seq (up to last_seq + 3 while capped or unbounded when active-looking).
      ok(r.payload.seq <= r.last_seq || r.event === 'chat.message', 'seq never exceeds the conversation last_seq (except provisional silent seq on chat.message)');
    }
  }

  // ---------- 6. Realtime topic policies ----------
  {
    const [A, B, C, Dd] = [u(22), u(23), u(24), u(25)];
    await befriend(A, B); await as('authenticated', A); const conv = (await send(B, 'x')).conversationId;
    await as('authenticated', C); const reqConv = (await send(Dd, 'y')).conversationId; // pending: nobody may type
    const lower = A, upper = A.toUpperCase();
    for (const t of [`user:${B}`, `USER:${lower}`, `user:${upper}`, `user:${lower} `, ` user:${lower}`, `user:${lower}\n`, `user:${lower}%`, `user:${lower}:x`, 'user:', '', 'user:*', 'chat-typing:*'])
      eq(await visible(A, t), 0, `topic ${JSON.stringify(t)} denied for A`);
    ok(await visible(A, `user:${lower}`) > 0, 'own topic works');
    for (const t of [`chat-typing:${conv.toUpperCase()}`, `chat-typing:${conv}\n`, `chat-typing:${conv} `, `chat-typing:${conv}/x`, `xchat-typing:${conv}`, `chat-typing:${conv}chat-typing:${conv}`, `chat-typing:${mid(1)}`])
      eq(await visible(A, t), 0, `typing topic ${JSON.stringify(t)} denied`);
    ok(await visible(A, `chat-typing:${conv}`) > 0, 'active friends can use the typing topic');
    // non-members, pending, other user topics: cannot subscribe
    eq(await visible(C, `chat-typing:${conv}`), 0, 'outsider cannot subscribe'); eq(await visible(C, `user:${A}`), 0, 'cannot read another user topic');
    eq(await visible(C, `chat-typing:${reqConv}`), 0, 'pending request: neither side may type'); eq(await visible(Dd, `chat-typing:${reqConv}`), 0);
    // inserts
    const ins = (user, topic, ext = 'broadcast') => async () => { await as('authenticated', user, topic); return q(`insert into realtime.messages(topic, extension, payload, event) values ($1,$2,'{}','typing')`, [topic, ext]); };
    await reject(ins(A, `user:${A}`)(), '42501', 'own user topic insert'); await reject(ins(A, `user:${B}`)(), '42501', "other's user topic insert");
    await reject(ins(C, `user:${A}`)(), '42501', 'spoof a signal to another user'); await reject(ins(C, `chat-typing:${conv}`)(), '42501', 'outsider typing insert');
    await reject(ins(C, `chat-typing:${reqConv}`)(), '42501', 'typing on a pending request'); await reject(ins(Dd, `chat-typing:${reqConv}`)(), '42501');
    await reject(ins(A, `chat-typing:${conv}`, 'presence')(), '42501', 'presence on the typing topic is not allowed');
    await reject(ins(A, `chat-typing:${conv}`, 'postgres_changes')(), '42501', 'postgres_changes on the typing topic is not allowed');
    await ins(A, `chat-typing:${conv}`)(); checks++;
    await as('authenticated', A, `user:${A}`);
    eq((await q(`select count(*)::int n from realtime.messages where extension='presence'`))[0].n, 0, 'presence rows on own topic are not visible');
    for (const role of ['anon', 'service_role']) { await as(role, A, `user:${A}`); eq((await q('select count(*)::int n from realtime.messages'))[0].n, 0, `${role} sees no realtime rows`); }
    await as('anon', A, `chat-typing:${conv}`); await reject(q(`insert into realtime.messages(topic, extension, payload, event) values ($1,'broadcast','{}','x')`, [`chat-typing:${conv}`]), '42501', 'anon insert');
    // (SET ROLE cannot be tested here: PGlite's session user is a superuser. Catalog check instead.)
    eq((await aq(`select count(*)::int n from pg_auth_members where roleid='chat_rpc'::regrole`))[0].n, 0, 'no role (authenticated, anon, authenticator) is a member of chat_rpc');
    // after the other side leaves/declines the typing right disappears
    await admin(); await q(`update private.chat_members set status='left' where conversation_id=$1 and user_id=$2`, [conv, B]);
    eq(await visible(A, `chat-typing:${conv}`), 0, 'left peer: no typing');
    await admin(); await q(`update private.chat_members set status='active' where conversation_id=$1 and user_id=$2`, [conv, B]);
  }

  // ---------- 7. List/summary counts across lifecycle ----------
  {
    const T = u(26), [s1, s2, s3, s4, s5] = [u(27), u(28), u(29), u(30), u(31)];
    const conv = {};
    for (const [n, s] of [[1, s1], [2, s2], [3, s3], [4, s4]]) { await as('authenticated', s); conv[n] = (await send(T, `req${n}a`)).conversationId; await sendIn(conv[n], `req${n}b`); }
    let v = await invariant(T, 'four requests'); eq(v.s, { unreadChats: 0, unreadMessages: 0, pendingRequests: 4 }); eq(v.chats.items.length, 0);
    await as('authenticated', T); await mutate('accept', { conv: conv[1] });
    v = await invariant(T, 'accept'); eq([v.s.pendingRequests, v.chats.items.length, v.s.unreadMessages], [3, 1, 0], 'accept moves the request to chats with nothing unread');
    await as('authenticated', s1); await sendIn(conv[1], 'c'); await sendIn(conv[1], 'd');
    v = await invariant(T, 'unread after accept'); eq([v.s.unreadChats, v.s.unreadMessages], [1, 2]);
    await as('authenticated', T); await mutate('decline', { conv: conv[2] });
    v = await invariant(T, 'decline'); eq([v.s.pendingRequests, v.reqs.items.map(i => i.id).sort(), v.chats.items.length], [2, [conv[3], conv[4]].sort(), 1]);
    await mutate('block', { target: s3 });
    v = await invariant(T, 'block'); eq([v.s.pendingRequests, v.reqs.items.map(i => i.id)], [1, [conv[4]]], 'blocked request leaves the request folder and count');
    eq(v.chats.items.find(i => i.id === conv[3]).state, 'blocked'); eq(v.chats.items.find(i => i.id === conv[3]).unreadCount, 0);
    await mutate('unblock', { target: s3 });
    v = await invariant(T, 'unblock'); eq([v.s.pendingRequests, v.reqs.items.length, v.chats.items.length], [2, 2, 1], 'unblock restores the pending request');
    await admin(); await q('delete from auth.users where id=$1', [s4]);
    v = await invariant(T, 'sender deleted'); eq(v.s.pendingRequests, 2, 'request from a deleted account is still counted');
    const del = v.reqs.items.find(i => i.id === conv[4]); eq([del.peer.deleted, del.peer.displayName, del.canSend], [true, 'Deleted traveler', false]);
    ok(!JSON.stringify(v).includes('NAMESENT 30'), 'deleted account name is not exposed');
    await as('authenticated', T); eq((await mutate('accept', { conv: conv[4] })).state, 'active');
    v = await invariant(T, 'accepted deleted sender'); eq([v.s.pendingRequests, v.chats.items.length], [1, 2]);
    await admin(); await q('delete from auth.users where id=$1', [s1]);
    v = await invariant(T, 'active peer deleted'); eq([v.s.unreadChats, v.s.unreadMessages], [1, 2], 'unread from a deleted account still counts');
    await as('authenticated', T); eq((await mutate('read', { conv: conv[1], upTo: 99 })).lastReadSeq, 4);
    v = await invariant(T, 'read after deletion'); eq([v.s.unreadChats, v.s.unreadMessages], [0, 0]);
    // unread count cap per chat
    const bulk = await seedBulk(T, s5, 150, s5);
    v = await invariant(T, 'bulk unread'); eq(v.chats.items.find(i => i.id === bulk).unreadCount, 100, 'per-chat unread is capped at 100'); eq(v.s.unreadMessages, 100);
    eq((await mutate('read', { conv: bulk, upTo: 120 })).lastReadSeq, 120);
    v = await invariant(T, 'partial read'); eq(v.chats.items.find(i => i.id === bulk).unreadCount, 30);
    // own messages are never unread; cleared history is not unread
    await admin(); await q(`update private.chat_members set cleared_seq=140 where conversation_id=$1 and user_id=$2`, [bulk, T]);
    v = await invariant(T, 'cleared'); eq(v.chats.items.find(i => i.id === bulk).unreadCount, 10);
  }

  // ---------- 8. Replay protection ----------
  {
    const [A, B, C] = [u(32), u(33), u(34)];
    await befriend(A, B); await befriend(A, C);
    await as('authenticated', A);
    const cid = nextCid(); const first = await mutate('send', { target: B, cid, body: 'replay me' });
    const viaConv = await mutate('send', { conv: first.conversationId, cid, body: 'replay me' });
    eq([viaConv.replayed, viaConv.message.seq, viaConv.message.id], [true, first.message.seq, first.message.id], 'replay via conversation id returns the stored row');
    eq((await mutate('send', { target: B, cid, body: 'replay me' })).replayed, true, 'replay via target');
    for (const [label, args] of [['trailing space', { target: B, cid, body: 'replay me ' }], ['case', { target: B, cid, body: 'Replay me' }], [`sentinel body`, { target: B, cid, body: SENT }],
      ['other friend by target', { target: C, cid, body: 'replay me' }], ['other conversation by id', { conv: (await send(C, 'c1')).conversationId, cid, body: 'replay me' }]]) {
      const e = await reject(mutate('send', args), '22023', `replay mismatch: ${label}`); eq(e.message, 'Message ID conflict');
    }
    eq(await msgCount(first.conversationId), 1, 'conflicting replays stored nothing');
    await as('authenticated', B);
    const other = await mutate('send', { conv: first.conversationId, cid, body: 'B uses the same client id' });
    eq([other.replayed, other.message.body], [false, 'B uses the same client id'], "another user's client id never returns or conflicts with someone else's message");
    ok(other.message.id !== first.message.id);
    eq((await mutate('send', { conv: first.conversationId, cid, body: 'B uses the same client id' })).replayed, true, "B's own replay works");
    await reject(mutate('send', { target: A, body: 'no id' }), '22023', 'missing client id');
  }

  // ---------- 9. ACLs ----------
  {
    const A = u(35), conv = mid(42);
    await admin(); await q('create role nobody_x nologin'); await q('grant usage on schema public to nobody_x');
    const wrappers = [['get_chat_summary', 'select public.get_chat_summary()', []], ['list_chat_conversations', `select public.list_chat_conversations('chats')`, []],
      ['list_chat_messages', 'select public.list_chat_messages($1)', [conv]], ['mutate_chat', `select public.mutate_chat('read',$1,null,null,null,0)`, [conv]]];
    for (const role of ['anon', 'service_role', 'nobody_x'])
      for (const [name, sql, args] of wrappers) { await as(role, A); await reject(q(sql, args), '42501', `${role} denied on ${name}`); }
    for (const [name, sql, args] of wrappers) { await as('authenticated', ''); await reject(q(sql, args), '28000', `no subject denied on ${name}`); }
    for (const fn of ['private.chat_summary()', `private.chat_list('chats',null,10)`, 'private.chat_messages($1,null,null,10)', `private.chat_mutate('read',$1,null,null,null,0,null,null,null)`, 'private.chat_can_type($1)'])
      for (const role of ['anon', 'service_role']) { await as(role, A); await reject(q(`select ${fn}`, fn.includes('$1') ? [conv] : []), '42501', `${role} denied on ${fn}`); }
    await as('authenticated', A);
    for (const [fn, args] of [['private.chat_view_state($1,$2)', [conv, A]], ['private.chat_uid()', []], ['private.chat_are_friends($1,$1)', [A]], [`private.chat_notify($1,'chat.message',$2,1)`, [A, conv]]])
      await reject(q(`select ${fn}`, args), '42501', `authenticated denied on ${fn}`);
    const tables = ['chat_conversations', 'chat_members', 'chat_messages', 'chat_blocks', 'chat_rate_events', 'chat_reports'];
    for (const role of ['anon', 'authenticated', 'service_role', 'nobody_x']) {
      await as(role, A);
      for (const t of tables) for (const sql of [`select * from private.${t}`, `insert into private.${t} select * from private.${t}`, `update private.${t} set created_at = now()`, `delete from private.${t}`, `truncate private.${t}`])
        await reject(q(sql), '42501', `${role}: ${sql}`);
    }
    // chat_rpc privilege audit: only the chat tables and four profile columns
    await admin();
    const extra = await q(`select n.nspname||'.'||c.relname rel from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private','auth','storage','realtime') and c.relkind in ('r','p','v','m') and c.relname not like 'chat\\_%' and not c.relispartition
      and has_any_column_privilege('chat_rpc', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') and c.oid <> 'public.profiles'::regclass order by 1`);
    eq(extra, [], 'chat_rpc has no privileges outside the chat tables and profiles');
    const cols = await q(`select attname from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped and has_column_privilege('chat_rpc','public.profiles',attname,'SELECT') order by 1`);
    eq(cols.map(c => c.attname), ['avatar_path', 'display_name', 'id', 'username'], 'chat_rpc reads exactly four profile columns');
    eq((await q(`select has_column_privilege('chat_rpc','public.profiles','bio','SELECT') b, has_table_privilege('chat_rpc','public.profiles','UPDATE,INSERT,DELETE') w`))[0], { b: false, w: false });
    eq((await q(`select roles::text r from pg_policies where policyname='profiles_chat_identity'`))[0].r, '{chat_rpc}', 'profiles identity policy is for chat_rpc only');
    eq((await q(`select count(*)::int n from pg_auth_members where member='chat_rpc'::regrole`))[0].n, 0, 'chat_rpc is a member of nothing');
    const evil = await q(`select p.oid::regprocedure::text fn from pg_proc p where p.proname in ('chat_summary','chat_list','chat_messages','chat_mutate','chat_view_state','chat_can_type','get_chat_summary','list_chat_conversations','list_chat_messages','mutate_chat') and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c='search_path=""')`);
    eq(evil, [], 'every chat function pins an empty search_path');
    // search_path hijack attempt: shadow objects must not change behaviour
    await q('create schema evil'); await q('create function evil.char_length(text) returns int language sql as $$ select 1 $$'); await q('grant usage on schema evil to authenticated');
    await as('authenticated', A); await db.exec('set search_path = evil, public');
    await reject(mutate('send', { target: A, cid: nextCid(), body: 'x' }), '22023', 'search_path hijack: still a normal self-message rejection');
    await db.exec('reset search_path');
  }

  // ---------- 10. Input validation and paging ----------
  {
    const [A, B, C, Dd] = [u(36), u(37), u(38), u(39)];
    await befriend(A, B); await befriend(A, C); await befriend(A, Dd);
    await as('authenticated', A);
    const convs = []; for (const t of [B, C, Dd]) { convs.push((await send(t, `hi ${t.slice(-2)}`)).conversationId); await new Promise(r => setTimeout(r, 5)); }
    eq((await list('chats', null, 0)).items.length, 1, 'limit 0 clamps to 1'); eq((await list('chats', null, -9)).items.length, 1); eq((await list('chats', null, 1000000)).items.length, 3);
    eq((await list('chats', null, null)).items.length, 3, 'null limit uses the default');
    const p1 = await list('chats', null, 2); eq(p1.items.length, 2); ok(p1.nextCursor, 'cursor issued');
    const p2 = await list('chats', JSON.stringify(p1.nextCursor), 2); eq(p2.items.length, 1); eq(p2.nextCursor, null);
    eq([...p1.items, ...p2.items].map(i => i.id).sort(), [...convs].sort(), 'cursor paging yields every conversation once');
    for (const bad of ['{}', '[]', 'null', '"x"', 'not json', '{"time":"x","id":"y"}', '{"time":"2026-01-01T00:00:00Z"}', `{"time":"2026-01-01T00:00:00Z","id":"${A}","pad":"${'z'.repeat(600)}"}`, '\u0000'.slice(1) + '{'])
      await reject(list('chats', bad), '22023', `bad cursor ${bad.slice(0, 20)}`);
    for (const f of ['Chats', 'chats; drop table x', '', null, 'all']) await reject(list(f), '22023', `bad folder ${f}`);
    await admin(); const bulk = await seedBulk(A, u(40), 130, u(40)); await as('authenticated', A);
    eq((await msgs(bulk, null, null, 1000000)).items.length, 100, 'message page capped at 100'); eq((await msgs(bulk, null, null, 1000000)).hasMore, true);
    eq((await msgs(bulk, null, null, 0)).items.length, 1); eq((await msgs(bulk, null, null, -3)).items.length, 1);
    eq((await msgs(bulk, 1)).items, [], 'before_seq 1 is empty'); eq((await msgs(bulk, -5)).items, [], 'negative before is empty');
    eq((await msgs(bulk, null, 129)).items.map(i => i.seq), [130]); eq((await msgs(bulk, null, 9007199254740991)).items, []);
    await reject(msgs(bulk, null, null, 5).then(() => msgs(null)), '42501', 'null conversation');
    // report validation
    const conv = convs[0];
    const mine = (await msgs(conv)).items;
    for (const [label, o] of [['reason case', { reason: 'SPAM' }], ['21 ids', { reason: 'spam', ids: Array.from({ length: 21 }, (_, i) => mid(7000 + i)) }], ['null element', { reason: 'spam', ids: [mine[0].id, null] }],
      ['501 details', { reason: 'spam', details: 'd'.repeat(501) }], ['id from another conversation', { reason: 'spam', ids: [(await msgs(bulk, null, null, 1)).items[0].id] }]])
      await reject(mutate('report', { conv, ...o }), '22023', `report ${label}`);
    eq((await mutate('report', { conv, reason: 'other', details: 'd'.repeat(500), ids: [mine[0].id, mine[0].id] })).reported, true, '500 chars and duplicate ids are fine');
    eq((await aq('select count(*)::int n from private.chat_reports where reporter_id=$1', [A]))[0].n, 1, 'rejected reports stored nothing');
    await as('authenticated', A);
    await reject(mutate('block', { target: A }), '22023', 'block self'); await reject(mutate('block', { target: mid(88888) }), '42501', 'block unknown user');
    await reject(mutate('decline', { conv }), '22023', 'cannot decline an active chat');
    const sender = u(41), rec = u(42); await as('authenticated', sender); const rq = (await send(rec, 'req')).conversationId;
    await reject(mutate('decline', { conv: rq }), '22023', 'sender cannot decline their own request');
    eq((await mutate('accept', { conv: rq })).state, 'pending', 'sender accept is a harmless no-op');
    await as('authenticated', rec); eq((await summary()).pendingRequests, 1, 'recipient request unaffected by the sender calling accept');
  }

  // ---------- 11. Silent sends (blocked / decline cooldown): replay, cap, no side effects ----------
  const silentState = async (conv, peer) => (await aq(`select (select request_count from private.chat_members where conversation_id=$1 and user_id=$2)::int rc,
    (select count(*) from private.chat_rate_events where kind='silent' and conversation_id=$1 and consumed_at is null)::int sil, (select count(*) from private.chat_messages where conversation_id=$1)::int msgs,
    (select last_seq from private.chat_conversations where id=$1)::int last_seq`, [conv, peer]))[0];
  {
    const [R, S] = [u(50), u(51)];
    await as('authenticated', R); const conv = (await send(S, 'real one')).conversationId; // request_count 1, last_seq 1
    await as('authenticated', S); await mutate('block', { target: R });
    const rtBefore = (await aq('select count(*)::int n from realtime.messages'))[0].n;
    await as('authenticated', S);
    const viewS = async () => ({ sum: await summary(), chats: await list('chats'), reqs: await list('requests') });
    const sBefore = await viewS();
    await as('authenticated', R);
    const X = nextCid(), Y = nextCid(), Z = nextCid(), body = `silent ${SENT} a`;
    const x = await mutate('send', { conv, cid: X, body });
    eq([x.state, x.replayed, x.message.seq, x.message.mine], ['pending', false, 2, true], 'first silent send: pending-shaped, seq advances');
    const xr = await mutate('send', { conv, cid: X, body });
    eq([xr.replayed, xr.state, xr.message.id, xr.message.seq, xr.message.createdAt, xr.message.clientMsgId], [true, 'pending', x.message.id, x.message.seq, x.message.createdAt, X], 'silent replay returns the same id/seq/time with replayed:true');
    eq((await mutate('send', { target: S, cid: X, body })).message.id, x.message.id, 'silent replay via target resolves to the same synthetic message');
    const convsBefore = (await aq('select count(*)::int n from private.chat_conversations'))[0].n;
    await as('authenticated', R);
    for (const [label, args] of [['changed body', { conv, cid: X, body: `silent ${SENT} b` }], ['trailing space', { conv, cid: X, body: body + ' ' }], ['prefix only', { conv, cid: X, body: SENT }],
      ['another conversation (existing friend pair)', { target: u(52), cid: X, body }], ['another conversation (no conversation yet)', { target: u(60), cid: X, body }]]) {
      const e = await reject(mutate('send', args), '22023', `silent replay mismatch: ${label}`); eq(e.message, 'Message ID conflict');
    }
    eq((await aq('select count(*)::int n from private.chat_conversations'))[0].n, convsBefore, 'conflicting silent replays create no conversation');
    await as('authenticated', R);
    const y = await mutate('send', { conv, cid: Y, body: `silent ${SENT} y` }); eq([y.replayed, y.message.seq], [false, 3], 'second silent send takes the next seq');
    const cap = await reject(mutate('send', { conv, cid: Z, body: `silent ${SENT} z` }), '54000', 'third silent send is capped (peer request_count 1 + 2 silent)'); eq(cap.hint, 'request_pending');
    eq((await mutate('send', { conv, cid: X, body })).replayed, true, 'replay of an accepted silent send still works while capped');
    eq((await mutate('send', { conv, cid: Y, body: `silent ${SENT} y` })).message.id, y.message.id);
    eq(await silentState(conv, S), { rc: 1, sil: 2, msgs: 1, last_seq: 1 }, 'silent sends changed no message, no request_count, no last_seq');
    eq((await aq(`select count(*)::int n from private.chat_messages where client_msg_id in ($1,$2,$3)`, [X, Y, Z]))[0].n, 0, 'silent client ids never reach chat_messages');
    eq((await aq('select count(*)::int n from realtime.messages'))[0].n, rtBefore + 2, 'only the 2 accepted silent sends add a row each (the sender own chat.message); replays and capped sends add none');
    const rows = await aq(`select to_jsonb(e)::text t from private.chat_rate_events e where kind='silent' and conversation_id=$1`, [conv]);
    ok(rows.length === 2 && rows.every(r => !r.t.includes(SENT) && !r.t.includes('silent ')), 'silent rows hold no body text (hash only)');
    // never visible in any list/summary/history, for either side
    await as('authenticated', R);
    const rView = JSON.stringify([await summary(), await list('chats'), await list('requests'), await msgs(conv)]);
    ok(!rView.includes(SENT), 'sender views never show silent text'); eq((await item(R, 'chats', conv)).lastSeq, 1, 'sender list keeps the real last_seq');
    eq((await msgs(conv)).items.length, 1);
    await as('authenticated', S);
    eq(await viewS(), sBefore, 'blocker summary and lists are identical after silent sends');
    // after unblock a silent id stays a silent id on an immediate retry
    await mutate('unblock', { target: R }); await as('authenticated', R);
    const retry = await mutate('send', { conv, cid: X, body }); eq([retry.replayed, retry.message.id], [true, x.message.id], 'retry of a silent id right after unblock stays silent');
    eq(await msgCount(conv), 1);
    const real = await sendIn(conv, 'real two'); eq([real.replayed, real.message.seq], [false, 2], 'a new id after unblock is delivered');
    eq((await aq(`select count(*)::int n from private.chat_rate_events where kind='silent' and conversation_id=$1 and consumed_at is null`, [conv]))[0].n, 0, 'a stored real message consumes the silent rows');
    eq((await aq(`select count(*)::int n from private.chat_rate_events where kind='silent' and conversation_id=$1`, [conv]))[0].n, 2, 'consumed silent rows stay as tombstones');
    const retry2 = await mutate('send', { conv, cid: X, body });
    eq([retry2.replayed, retry2.message.id], [true, x.message.id], 'F5 fixed: a later retry of a silent client id returns the stored replay');
    eq(await msgCount(conv), 2, 'and is never delivered as a real message');
    await reject(mutate('send', { conv, cid: X, body: `silent ${SENT} different` }), '22023', 'tombstone with a different body conflicts');
  }
  {
    // Cycles cannot buy extra sends: request_count + silent rows never exceeds 3, real sends stay capped at 3 per request.
    const bound = async (conv, peer, label) => { const s = await silentState(conv, peer); ok(s.rc + s.sil <= 3, `${label}: request_count ${s.rc} + silent ${s.sil} <= 3`); ok(s.msgs <= 3, `${label}: at most 3 stored messages`); return s; };
    const [R, S] = [u(52), u(53)];
    await as('authenticated', R); const conv = (await send(S, 'm1')).conversationId; await sendIn(conv, 'm2'); await sendIn(conv, 'm3');
    eq((await bound(conv, S, 'three real')).rc, 3);
    for (let i = 0; i < 4; i++) {
      await as('authenticated', S); await mutate('block', { target: R });
      await as('authenticated', R); eq((await reject(sendIn(conv, `try ${i}`), '54000', `blocked after the cap, cycle ${i}`)).hint, 'request_pending');
      await as('authenticated', S); await mutate('unblock', { target: R });
      await as('authenticated', R); eq((await reject(sendIn(conv, `try ${i}`), '54000', `unblocked after the cap, cycle ${i}`)).hint, 'request_pending');
      eq(await bound(conv, S, `cap cycle ${i}`), { rc: 3, sil: 0, msgs: 3, last_seq: 3 });
    }
    // partial use: 1 real, then interleave block/unblock with silent and real sends
    const [R2, S2] = [u(56), u(57)];
    await as('authenticated', R2); const c2 = (await send(S2, 'm1')).conversationId;
    let okSilent = 0, okReal = 0;
    for (let i = 0; i < 6; i++) {
      await as('authenticated', S2); await mutate('block', { target: R2 }); await as('authenticated', R2);
      for (let k = 0; k < 4; k++) { try { await sendIn(c2, `s ${i}.${k}`); okSilent++; } catch (e) { eq(e.code, '54000'); } await bound(c2, S2, `blocked ${i}.${k}`); }
      await as('authenticated', S2); await mutate('unblock', { target: R2 }); await as('authenticated', R2);
      for (let k = 0; k < 4; k++) { try { await sendIn(c2, `r ${i}.${k}`); okReal++; } catch (e) { eq(e.code, '54000'); } await bound(c2, S2, `unblocked ${i}.${k}`); }
    }
    note(`block/unblock cycles on one request: ${okSilent} silent and ${okReal} real sends were accepted in total`);
    ok(okReal <= 2, 'real sends stay capped at 3 per request (1 already sent) across block cycles');
    eq((await silentState(c2, S2)).rc, 3, 'request cap is reached through real sends only'); eq((await silentState(c2, S2)).msgs, 3);
    // decline cycles
    const [R3, S3] = [u(58), u(59)];
    await as('authenticated', R3); const c3 = (await send(S3, 'm1')).conversationId;
    await as('authenticated', S3); await mutate('decline', { conv: c3 });
    await as('authenticated', R3); await sendIn(c3, 's1'); await sendIn(c3, 's2');
    await reject(sendIn(c3, 's3'), '54000', 'cooldown cap'); eq(await bound(c3, S3, 'declined'), { rc: 1, sil: 2, msgs: 1, last_seq: 1 });
    await as('authenticated', S3); eq((await mutate('decline', { conv: c3 })).state, 'declined', 'second decline is a no-op');
    await as('authenticated', R3); await reject(sendIn(c3, 's4'), '54000', 'still capped after a repeated decline'); eq((await bound(c3, S3, 'redecline')).sil, 2);
    await admin(); await q(`update private.chat_members set cooldown_until = clock_timestamp() - interval '1 second' where conversation_id=$1 and user_id=$2`, [c3, S3]);
    await as('authenticated', R3); await sendIn(c3, 'new request'); eq(await bound(c3, S3, 'after cooldown'), { rc: 1, sil: 0, msgs: 2, last_seq: 2 });
    await as('authenticated', S3); await mutate('decline', { conv: c3 });
    await as('authenticated', R3); await sendIn(c3, 'q1'); await sendIn(c3, 'q2'); await reject(sendIn(c3, 'q3'), '54000', 'second decline: same cap');
    eq(await bound(c3, S3, 'second decline'), { rc: 1, sil: 2, msgs: 2, last_seq: 2 });
  }

  // ---------- 12. Report retention, snapshot labels, account deletion ----------
  {
    const [R, S] = [u(54), u(55)]; await befriend(R, S);
    await as('authenticated', R); const conv = (await send(S, `r1 ${SENT}`)).conversationId; await sendIn(conv, 'r2');
    await as('authenticated', S); await sendIn(conv, 's1'); await sendIn(conv, 's2');
    const count = async () => (await aq('select count(*)::int n from private.chat_reports'))[0].n;
    const base = await count(); // reports from earlier sections
    await admin();
    for (const age of ['89 days 23 hours', '91 days', '90 days', '200 days', '1 day']) await q(`insert into private.chat_reports(reporter_id, reported_id, reason, created_at) values ($1,$2,'spam', clock_timestamp() - $3::interval)`, [S, R, age]);
    eq(await count(), base + 5);
    await as('authenticated', S); await mutate('read', { conv, upTo: 9 }); await mutate('block', { target: R }); await mutate('unblock', { target: R }); await mutate('accept', { conv });
    await as('authenticated', R); await sendIn(conv, 'r3');
    eq(await count(), base + 5, 'pruning runs on the report path only');
    await as('authenticated', S);
    const ids = (await msgs(conv)).items; const r1 = ids.find(i => i.body.includes(SENT)), s1 = ids.find(i => i.body === 's1');
    eq((await mutate('report', { conv, reason: 'harassment', ids: [r1.id, s1.id] })).reported, true);
    eq(await count(), base + 3, 'reports older than 90 days are removed, newer kept, plus the new one');
    eq((await aq(`select count(*)::int n from private.chat_reports where created_at < clock_timestamp() - interval '89 days'`))[0].n, 1, 'the 89d23h report survived');
    eq((await aq(`select count(*)::int n from private.chat_reports where created_at <= clock_timestamp() - interval '90 days'`))[0].n, 0, 'nothing at or beyond 90 days is left');
    const snap = (await aq(`select snapshot from private.chat_reports where reason='harassment'`))[0].snapshot;
    eq(snap.map(m => [m.from, m.seq]), [['reported', 1], ['reporter', 3]], 'snapshot labels: reported/reporter');
    for (const m of snap) eq(Object.keys(m).sort(), ['body', 'createdAt', 'from', 'id', 'seq'], 'snapshot rows carry no sender id');
    await mutate('report', { conv, reason: 'other' });
    const last = (await aq(`select snapshot from private.chat_reports where reason='other' order by created_at desc limit 1`))[0].snapshot;
    ok(last.length > 0 && last.every(m => m.from === 'reported'), 'default snapshot is the peer messages, labelled');
    for (const r of await aq(`select snapshot::text t from private.chat_reports where reporter_id=$1 and reason in ('harassment','other')`, [S])) ok(![R, S].some(id => r.t.toLowerCase().includes(id.toLowerCase())), 'snapshot contains no uuid of either user');
    // the other user reports back; then the reported user deletes the account
    await as('authenticated', R); await mutate('report', { conv, reason: 'spam', details: 'back at you' });
    await admin(); await q('delete from auth.users where id=$1', [R]);
    const dump = await q(`select row_to_json(r)::text t from private.chat_reports r`);
    ok(dump.length >= 4, 'reports survive account deletion'); ok(dump.every(r => !r.t.toLowerCase().includes(R.toLowerCase())), 'the deleted user id appears nowhere in any report row (columns or snapshot)');
    await as('authenticated', S);
    await mutate('report', { conv, reason: 'spam' }); // peer account is gone: remaining messages are labelled unknown
    const post = (await aq(`select snapshot from private.chat_reports where reporter_id=$1 order by created_at desc limit 1`, [S]))[0].snapshot;
    ok(post.length > 0 && post.every(m => m.from === 'unknown'), 'messages of a deleted sender are labelled unknown');
    ok(!JSON.stringify(post).toLowerCase().includes(R.toLowerCase()), 'no deleted-user id after the post-deletion report');
    // privileges: chat_rpc cannot delete/update/read reports; the prune function is installer-owned and not callable by clients
    eq((await q(`select has_table_privilege('chat_rpc','private.chat_reports','DELETE') d, has_table_privilege('chat_rpc','private.chat_reports','UPDATE') u,
      has_table_privilege('chat_rpc','private.chat_reports','SELECT') s, has_table_privilege('chat_rpc','private.chat_reports','TRUNCATE') t, has_table_privilege('chat_rpc','private.chat_reports','INSERT') i`))[0],
      { d: false, u: false, s: false, t: false, i: true }, 'chat_rpc keeps insert-only on chat_reports (no DELETE)');
    eq((await q(`select pg_get_userbyid(proowner) = 'chat_rpc' o from pg_proc where oid='private.chat_prune_reports()'::regprocedure`))[0].o, false, 'prune function is not owned by chat_rpc');
    eq((await q(`select has_function_privilege('chat_rpc','private.chat_prune_reports()','EXECUTE') c, has_function_privilege('authenticated','private.chat_prune_reports()','EXECUTE') a,
      has_function_privilege('anon','private.chat_prune_reports()','EXECUTE') n, has_function_privilege('service_role','private.chat_prune_reports()','EXECUTE') s`))[0], { c: true, a: false, n: false, s: false });
    for (const role of ['anon', 'authenticated', 'service_role']) { await as(role, S); await reject(q('select private.chat_prune_reports()'), '42501', `${role} cannot call the prune function`); await reject(q('delete from private.chat_reports'), '42501'); }
  }

  console.log(`test-chat-extra: ${checks} checks passed, ${findings.length} finding(s), ${notes.length} note(s)`);
  for (const n of notes) console.log(`NOTE: ${n}`);
  for (const f of findings) console.log(`FINDING ${f.id} [${f.severity}]: ${f.text}`);
  if (findings.length) process.exitCode = 1;
} finally {
  await db.close();
}

async function adminCount(sql) { await db.exec('reset role'); return (await db.query(sql)).rows[0].n; }
async function visible(user, topic) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('realtime.topic',$2,false)", [user, topic]);
  await db.exec('set role authenticated');
  return (await db.query(`select count(*)::int n from realtime.messages where extension='broadcast'`)).rows[0].n;
}
