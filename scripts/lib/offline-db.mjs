import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// No environment files, sockets, hosted credentials or persistent database files.
export const fixtureSql = `create role anon nologin; create role authenticated nologin;
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
    grant select,insert,update,delete on storage.objects to authenticated;`;
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
