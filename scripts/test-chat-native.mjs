// Opt-in synthetic-only PostgreSQL 17 race tests for chat_v1. Target is pinned to the approved portable
// cluster (127.0.0.1 only). No environment files, hosted DSNs or pre-existing databases are touched:
// each variant creates a NEW random-suffix database plus its own installer role and drops both afterwards.
// The installer is a non-superuser CREATEROLE role (like the hosted postgres role), run once with
// INHERIT and once with NOINHERIT. The cluster must already be running; this script never starts it.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { fixtureSql, migrationDirectory } from './lib/offline-db.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--run-synthetic-fixtures') {
  throw new Error('Usage: node scripts/test-chat-native.mjs --run-synthetic-fixtures');
}
const root = fileURLToPath(new URL('../.local-tests/customize-stops-pg', import.meta.url));
const identity = JSON.parse(await readFile(join(root, 'cluster-identity.json'), 'utf8'));
const port = String(identity.port);
const admin = 'journey_test_admin';
const psql = join(root, 'pgsql/bin/psql.exe');
assert.equal(identity.host, '127.0.0.1');
assert.equal(resolve(identity.dataDirectory).toLowerCase(), resolve(root, 'data').toLowerCase(), 'data directory is inside .local-tests');
const environment = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k)));
const baseArgs = ['--no-psqlrc', '--no-password', '--quiet', '--tuples-only', '--no-align', '-h', '127.0.0.1', '-p', port, '-U', admin, '-v', 'ON_ERROR_STOP=1'];

function run(db, sql, { file } = {}) {
  const args = [...baseArgs, '-d', db, ...(file ? ['-f', file] : [])];
  const child = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    env: { ...environment, PGCONNECT_TIMEOUT: '5', PGPASSFILE: join(root, 'no-password-file') } });
  let out = '', err = '';
  child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; });
  const done = new Promise((res, rej) => { child.on('error', rej); child.on('exit', code => res({ code, out: out.trim(), err })); });
  child.stdin.on('error', () => {});
  if (sql !== undefined) { child.stdin.write(`\\set VERBOSITY sqlstate\nset statement_timeout='60s';\n${sql}\n`); child.stdin.end(); }
  return { child, done };
}
async function exec(db, sql) {
  const r = await run(db, sql).done;
  if (r.code !== 0) throw new Error(`Local SQL failed: ${r.err.replace(/\s+/g, ' ').slice(0, 400)}`);
  return r.out;
}
const scalar = (db, sql) => exec(db, sql);
const json = async (db, sql) => JSON.parse(await exec(db, sql));

// Isolation: only the pinned local cluster, loopback only, inside .local-tests.
assert.equal(await scalar('postgres', 'show listen_addresses;'), '127.0.0.1');
assert.equal(resolve(await scalar('postgres', 'show data_directory;')).toLowerCase(), resolve(root, 'data').toLowerCase());
assert.equal(await scalar('postgres', "select count(*) from pg_roles where rolname = 'chat_rpc';"), '0', 'no pre-existing chat_rpc in the cluster');

const names = (await readdir(migrationDirectory)).filter(n => n.endsWith('.sql')).sort();
const chatName = names.find(n => /^\d{14}_chat_v1\.sql$/.test(n));
const uid = n => `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mid = n => `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };
const createdRoles = [];

async function variant(kind) {
  const suffix = randomBytes(4).toString('hex');
  const db = `journey_chat_test_${suffix}`;
  const installer = `chat_installer_${kind}_${suffix}`;
  console.log(`variant ${kind}: database ${db}`);
  const rolesBefore = (await scalar('postgres', "select string_agg(rolname, ',' order by rolname) from pg_roles where rolname !~ '^pg_';")).split(',');
  try {
    await exec('postgres', `create role ${installer} login createrole nosuperuser ${kind === 'inherit' ? 'inherit' : 'noinherit'};
      create database ${db} owner ${installer};`);
    if (!rolesBefore.includes('service_role') && !createdRoles.includes('service_role')) {
      createdRoles.push('service_role');
      await exec('postgres', 'create role service_role nologin;');
    }
    await exec(db, fixtureSql.replace(/create role \w+ nologin;/g, ''));
    // The realtime stub is part of fixtureSql; the installer gets the privileges the hosted postgres role has on it.
    await exec(db, `grant usage on schema realtime to ${installer} with grant option;
      grant select, insert on realtime.messages to ${installer} with grant option;`);
    // Earlier migrations run as the bootstrap superuser, then ownership moves to the installer (like hosted postgres).
    // The customize-stops/integrity migrations detect pre-existing cluster roles of the other suites; chat does not depend on them.
    for (const n of names.filter(n => n < chatName && !/capture_customize_stops|legacy_media_review|rpc_integrity_hardening/.test(n))) await run(db, undefined, { file: fileURLToPath(new URL(n, migrationDirectory)) }).done
      .then(r => { if (r.code !== 0) throw new Error(`Migration ${n} failed: ${r.err.replace(/\s+/g, ' ').slice(0, 300)}`); });
    await exec(db, `do $own$ declare r record; begin
      for r in select format('alter schema %I owner to ${installer}', nspname) s from pg_namespace where nspname in ('public','private','auth','storage') loop execute r.s; end loop;
      for r in select format('alter %s %s owner to ${installer}', case c.relkind when 'S' then 'sequence' when 'v' then 'view' else 'table' end, c.oid::regclass) s
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private','auth','storage') and c.relkind in ('r','p','S','v') and not c.relispartition loop execute r.s; end loop;
      for r in select format('alter function %s owner to ${installer}', p.oid::regprocedure) s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','private','auth','storage') and p.prokind = 'f' loop execute r.s; end loop;
      for r in select format('alter type %s owner to ${installer}', t.oid::regtype) s from pg_type t join pg_namespace n on n.oid = t.typnamespace
        where n.nspname in ('public','private','auth','storage') and t.typtype in ('e','d') loop execute r.s; end loop;
    end $own$;
    grant usage on schema auth to ${installer}; grant execute on function auth.uid() to ${installer};`);
    // Supabase-like default privileges for objects the installer creates, so the grant-stripping loops are exercised.
    await exec(db, `alter default privileges for role ${installer} in schema public, private grant all on tables to anon, authenticated, service_role;
      alter default privileges for role ${installer} in schema public, private grant all on functions to anon, authenticated, service_role;
      alter default privileges for role ${installer} in schema public, private grant all on sequences to anon, authenticated, service_role;`);
    eq(await scalar(db, 'select count(*) >= 3 from pg_default_acl;'), 't', 'default privileges active');
    // The chat migration, run as the non-superuser installer. realtime.messages policy DDL runs privileged (supautils policy_grants).
    let chatSql = await readFile(new URL(chatName, migrationDirectory), 'utf8');
    chatSql = chatSql.replace(/(create policy \w+ on realtime\.messages[^;]*;)/g, `reset role; $1 set role ${installer};`);
    const install = await run(db, `set role ${installer};\n${chatSql}`).done;
    if (install.code !== 0) throw new Error(`chat_v1 failed as non-superuser installer: ${install.err.replace(/\s+/g, ' ').slice(0, 500)}`);
    checks++; console.log('  installed as non-superuser installer');

    // Catalog end state under live-like privileges.
    eq(await json(db, `select row_to_json(x) from (select rolcanlogin, rolsuper, rolinherit, rolbypassrls from pg_roles where rolname='chat_rpc') x;`),
      { rolcanlogin: false, rolsuper: false, rolinherit: false, rolbypassrls: false });
    eq(await json(db, `select row_to_json(x) from (select (select count(*)::int from pg_auth_members where roleid='chat_rpc'::regrole and member='${installer}'::regrole and (inherit_option or set_option)) as risky,
      has_schema_privilege('chat_rpc','private','CREATE') as c) x;`), { risky: 0, c: false }, 'no leftover INHERIT/SET membership or CREATE');
    const fns = await json(db, `select jsonb_agg(row_to_json(x) order by fn) from (select p.proname, p.oid::regprocedure::text fn, pg_get_userbyid(p.proowner) owner, p.prosecdef def, p.proacl::text acl from pg_proc p
      where p.proname in ('chat_uid','chat_are_friends','chat_notify','chat_prune_reports','chat_view_state','chat_can_type','chat_summary','chat_list','chat_messages','chat_mutate','get_chat_summary','list_chat_conversations','list_chat_messages','mutate_chat')) x;`);
    eq(fns.length, 14);
    const expected = { chat_uid: [installer, true, false], chat_are_friends: [installer, true, false], chat_notify: [installer, true, false], chat_prune_reports: [installer, true, false],
      chat_view_state: ['chat_rpc', true, false], chat_can_type: ['chat_rpc', true, true], chat_summary: ['chat_rpc', true, true], chat_list: ['chat_rpc', true, true],
      chat_messages: ['chat_rpc', true, true], chat_mutate: ['chat_rpc', true, true], get_chat_summary: [installer, false, true], list_chat_conversations: [installer, false, true],
      list_chat_messages: [installer, false, true], mutate_chat: [installer, false, true] };
    for (const f of fns) {
      eq([f.owner, f.def, /authenticated=X/.test(f.acl), /(^|[{,])=/.test(f.acl), /anon=|service_role=/.test(f.acl)], [...expected[f.proname], false, false], `${f.fn} owner / definer / ACL`);
    }

    // Fixtures: users and friendships (owner SQL).
    const users = Array.from({ length: 70 }, (_, i) => uid(i + 1));
    const [A, B, C, D] = users;
    await exec(db, `insert into auth.users(id) select unnest('{${users.join(',')}}'::uuid[]);
      insert into private.connection_requests(id,sender_id,recipient_id,status) values ('${mid(9001)}','${A}','${B}','accepted');
      insert into private.connection_friendships(user_low,user_high,request_id) values (least('${A}'::uuid,'${B}'::uuid), greatest('${A}'::uuid,'${B}'::uuid), '${mid(9001)}');`);

    // Concurrent worker harness: a barrier (exclusive advisory lock) releases all workers together.
    const barrier = 8800 + Math.floor(Math.random() * 100);
    // The cluster allows only 20 connections, so calls are spread over at most 12 concurrent sessions.
    async function race(calls, sessions = 12) {
      const groups = Array.from({ length: Math.min(sessions, calls.length) }, () => []);
      calls.forEach((c, i) => groups[i % groups.length].push([i, c]));
      const holder = run(db, `select pg_advisory_lock(${barrier}); select pg_sleep(60);`);
      await new Promise(r => setTimeout(r, 500));
      const jobs = groups.map(g => {
        const body = g.map(([i, c]) => `do $w$ begin perform set_config('request.jwt.claim.sub','${c.user}',false);
          raise notice 'RES ${i} OK %', public.mutate_chat(${c.args})::text;
          exception when others then raise notice 'RES ${i} ERR %', sqlstate; end $w$;`).join('\n');
        const j = run(db, `\\set VERBOSITY default\nset role authenticated;\nselect pg_advisory_lock_shared(${barrier}); select pg_advisory_unlock_shared(${barrier});\n${body}`);
        return j.done;
      });
      for (let i = 0; i < 100; i++) {
        const waiting = Number(await scalar(db, `select count(*) from pg_locks where locktype='advisory' and objid=${barrier} and not granted;`));
        if (waiting === groups.length) break;
        await new Promise(r => setTimeout(r, 100));
      }
      holder.child.kill();
      const results = [];
      for (const r of await Promise.all(jobs)) {
        assert.equal(r.code, 0, `worker session failed: ${r.err.slice(0, 300)}`);
        for (const m of r.err.matchAll(/RES (\d+) (OK|ERR) (\S+)/g)) results[Number(m[1])] = m[2] === 'OK' ? { ok: m[3] } : { err: m[3] };
      }
      assert.equal(results.filter(Boolean).length, calls.length, 'every call reported');
      return results;
    }
    const sendArgs = (user, n, extra) => ({ user, args: `'send', ${extra}, '${mid(n)}', 'race ${n}'` });

    console.log('  1. 50');
    // 1. 50 parallel sends over a friend pair (25 each way): gap-free unique seq, no deadlock.
    let res = await race([...Array(25).keys()].flatMap(i => [sendArgs(A, 1000 + i, `null, '${B}'`), sendArgs(B, 2000 + i, `null, '${A}'`)]));
    eq(res.filter(r => r.ok).length, 50, `all 50 succeed: ${JSON.stringify(res.filter(r => r.err))}`);
    eq(await json(db, `select jsonb_build_object('n',count(*),'min',min(seq),'max',max(seq),'distinct',count(distinct seq)) from private.chat_messages;`), { n: 50, min: 1, max: 50, distinct: 50 }, 'gap-free seq 1..50');
    eq(await scalar(db, `select last_seq from private.chat_conversations;`), '50');
    const conv = await scalar(db, 'select id from private.chat_conversations;');

    console.log('  2. 50');
    // 2. 50 parallel sends from one actor: the per-minute limit holds exactly (30 ok, 20 x 54000).
    await exec(db, `delete from private.chat_rate_events;`);
    res = await race([...Array(50).keys()].map(i => sendArgs(A, 3000 + i, `'${conv}', null`)));
    eq(res.filter(r => r.ok).length, 30, 'exactly 30 sends pass the minute limit'); eq(res.filter(r => r.err === '54000').length, 20);
    eq(await scalar(db, `select count(*) from private.chat_messages where seq > 50;`), '30');
    eq(await scalar(db, `select max(seq) - 50 = count(*) from private.chat_messages where seq > 50;`), 't', 'still gap-free');

    console.log('  3. Parallel');
    // 3. Parallel new requests to 15 distinct people vs the hourly cap of 10.
    await exec(db, `delete from private.chat_rate_events;`);
    res = await race([...Array(15).keys()].map(i => sendArgs(C, 4000 + i, `null, '${users[10 + i]}'`)));
    eq(res.filter(r => r.ok).length, 10, 'exactly 10 requests pass'); eq(res.filter(r => r.err === '54000').length, 5, 'rest rejected with 54000');
    eq(await scalar(db, `select count(*) from private.chat_conversations where user_low = '${C}' or user_high = '${C}';`), '10');

    console.log('  4. Simultaneous');
    // 4. Simultaneous first messages in both directions: one conversation, one request, no deadlock.
    res = await race([sendArgs(users[30], 5001, `null, '${users[31]}'`), sendArgs(users[31], 5002, `null, '${users[30]}'`),
      sendArgs(users[30], 5003, `null, '${users[31]}'`), sendArgs(users[31], 5004, `null, '${users[30]}'`)]);
    eq(res.filter(r => r.err).length, 0, JSON.stringify(res));
    eq(await json(db, `select jsonb_build_object('convs',(select count(*) from private.chat_conversations where '${users[30]}' in (user_low,user_high)),
      'max',(select max(seq) from private.chat_messages m join private.chat_conversations c on c.id=m.conversation_id where '${users[30]}' in (c.user_low,c.user_high)),
      'n',(select count(*) from private.chat_messages m join private.chat_conversations c on c.id=m.conversation_id where '${users[30]}' in (c.user_low,c.user_high)))`), { convs: 1, max: 4, n: 4 });

    console.log('  5. Send vs block');
    // 5. Send vs block: nothing is delivered after the block commits.
    const X = users[40], Y = users[41];
    await exec(db, `select 1;`);
    res = await race([...Array(10).keys()].map(i => sendArgs(X, 6000 + i, `null, '${Y}'`)).concat([{ user: Y, args: `'block', null, '${X}'` }]));
    eq(res.filter(r => r.err && r.err !== '54000').length, 0, JSON.stringify(res)); // 54000 = pending cap, expected
    eq(await scalar(db, `select count(*) from private.chat_messages m join private.chat_blocks b on b.blocker_id='${Y}' and b.blocked_id='${X}' where m.created_at > b.created_at;`), '0', 'no message after the block');
    eq(await scalar(db, `select count(*) from private.chat_blocks where blocker_id='${Y}' and blocked_id='${X}';`), '1');

    console.log('  6. Send vs declin');
    // 6. Send vs decline: no delivered message after the decline; cap respected.
    const P = users[50], Q = users[51];
    res = await race([sendArgs(P, 7000, `null, '${Q}'`)]);
    eq(res.filter(r => r.ok).length, 1, 'one pending message to start from');
    const pc = await scalar(db, `select id from private.chat_conversations where '${P}' in (user_low,user_high) and '${Q}' in (user_low,user_high);`);
    res = await race([...Array(4).keys()].map(i => sendArgs(P, 7100 + i, `'${pc}', null`)).concat([{ user: Q, args: `'decline', '${pc}'` }]));
    eq(res.filter(r => r.err && r.err !== '54000').length, 0, JSON.stringify(res));
    eq(await scalar(db, `select count(*) from private.chat_messages m join private.chat_members d on d.conversation_id=m.conversation_id and d.user_id='${Q}' where m.created_at > d.declined_at;`), '0', 'nothing delivered after the decline');
    eq(await scalar(db, `select count(*) <= 3 from private.chat_messages where conversation_id='${pc}';`), 't', 'pending cap respected under concurrency');
    eq(await scalar(db, `select (select count(*) from private.chat_rate_events where kind='silent' and consumed_at is null and conversation_id='${pc}') + (select request_count from private.chat_members where conversation_id='${pc}' and user_id='${Q}') <= 3;`), 't', 'silent + stored messages never exceed the cap of 3');

    console.log('  7. Send vs accept');
    // 7. Send vs accept: seq stays gap-free, recipient ends active.
    const R = users[60], S = users[61];
    res = await race([...Array(3).keys()].map(i => sendArgs(R, 8000 + i, `null, '${S}'`)));
    const rc = await scalar(db, `select id from private.chat_conversations where '${R}' in (user_low,user_high) and '${S}' in (user_low,user_high);`);
    res = await race([{ user: S, args: `'accept', '${rc}'` }, sendArgs(R, 8100, `'${rc}', null`), sendArgs(S, 8101, `'${rc}', null`), sendArgs(R, 8102, `'${rc}', null`)]);
    eq(res.filter(r => r.err && r.err !== '54000').length, 0, JSON.stringify(res));
    eq(await scalar(db, `select status from private.chat_members where conversation_id='${rc}' and user_id='${S}';`), 'active');
    eq(await scalar(db, `select max(seq) = count(*) and min(seq) = 1 from private.chat_messages where conversation_id='${rc}';`), 't', 'gap-free');
    eq(await scalar(db, `select last_seq = (select max(seq) from private.chat_messages where conversation_id='${rc}') from private.chat_conversations where id='${rc}';`), 't');

    // 8. Direct table access by authenticated is still denied on the native cluster.
    const denied = await run(db, `set role authenticated; select set_config('request.jwt.claim.sub','${A}',false); select count(*) from private.chat_messages;`).done;
    ok(denied.code !== 0 && /42501/.test(denied.err), 'authenticated denied on private tables');
  } catch (e) {
    console.error('FAILED:', String(e.message).slice(0, 700)); throw e;
  } finally {
    await exec('postgres', `drop database if exists ${db} with (force);`);
    await exec('postgres', `drop role if exists chat_rpc;`);
    if (!rolesBefore.includes('connection_rpc')) await exec('postgres', `drop role if exists connection_rpc;`);
    await exec('postgres', `drop role if exists ${installer};`);
  }
}

try {
  await variant('inherit');
  await variant('noinherit');
  console.log(`test-chat-native: ${checks} checks passed`);
} finally {
  // Remove only roles this run created (the cluster's pre-existing roles are left alone).
  for (const r of createdRoles) await exec('postgres', `drop role if exists ${r};`).catch(() => {});
  const left = await scalar('postgres', `select string_agg(datname, ',') from pg_database where datname like 'journey_chat_test_%';`);
  assert.ok(!left, `leftover test databases: ${left}`);
}
