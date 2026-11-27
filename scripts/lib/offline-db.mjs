import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// No environment files, sockets, hosted credentials or persistent database files.
export const fixtureSql = `create role anon nologin; create role authenticated nologin;
    create role service_role nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select on storage.objects to anon;
    grant select,insert,update,delete on storage.objects to authenticated;
    -- Realtime stub mirroring the hosted evidence (chat_v1 creates policies on realtime.messages and calls realtime.send).
    create schema realtime;
    create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic',true),'') $$;
    create table realtime.messages(topic text not null,extension text not null,payload jsonb,event text,private boolean default false,
      updated_at timestamp not null default now(),inserted_at timestamp not null default now(),id uuid not null default gen_random_uuid(),
      binary_payload bytea,skip_broadcast boolean default false,expires_at timestamptz,primary key(id,inserted_at)) partition by range(inserted_at);
    create table realtime.messages_all partition of realtime.messages for values from ('2000-01-01') to ('2100-01-01');
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to anon,authenticated,service_role;
    grant select,insert,update on realtime.messages to anon,authenticated,service_role;
    create function realtime.send(payload jsonb,event text,topic text,private boolean default true) returns void language plpgsql as $$
    begin
      begin
        perform set_config('realtime.topic',topic,true);
        insert into realtime.messages(payload,event,topic,private,extension) values(payload,event,topic,private,'broadcast');
      exception when others then raise warning 'ErrorSendingBroadcastMessage';
      end;
    end $$;`;
export async function offlineDb() {
  const db = new PGlite();
  await db.exec(fixtureSql);
  return db;
}
export const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url);
export async function migrations(db, predicate = () => true) {
  for (const name of (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort()) {
    if (predicate(name)) await db.exec(await readFile(new URL(name, migrationDirectory), 'utf8'));
  }
}
export async function as(db, role, user = '') {
  if (!['anon', 'authenticated', 'journey_rpc'].includes(role)) throw new Error('Unsupported test role');
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${role}`);
}
