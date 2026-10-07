import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const owner = '10000000-0000-0000-0000-000000000001', other = '10000000-0000-0000-0000-000000000002';
async function as(role, user = '') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec(`set role ${role}`); }
async function copy(id) { return (await db.query('select public.copy_journey($1) as id', [id])).rows[0].id; }
async function publicNode(id) { return (await db.query("select id,title,copied_from_journey_id from public.journeys where id=$1 and status='published' limit 1", [id])).rows[0]; }
async function children(id) { return (await db.query("select id,title from public.journeys where copied_from_journey_id=$1 and status='published' and not is_demo order by published_at desc,id limit 3", [id])).rows; }
try {
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated; grant select on storage.objects to anon; grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const migration of ['20261001000000_core_schema.sql','20261001010000_public_discovery.sql','20261001020000_journey_details.sql','20261002000000_journey_creation.sql','20261002010000_journey_media_15mb.sql','20261002020000_social_loop.sql','20261004000000_field_test_destinations.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)', [owner, other]);
  await as('authenticated', owner);
  const a = '20000000-0000-0000-0000-000000000001';
  await db.query('select public.save_journey($1::jsonb)', [JSON.stringify({ id: a, title: 'Original', description: 'Original memory', destination_slug: 'goa', traveler_type: 'solo', duration_days: 1, status: 'published', stops: [{ id: '30000000-0000-0000-0000-000000000001', name: 'Original stop', description: 'Original note', sequence: 1, latitude: 15.49, longitude: 73.83 }] })]);
  await db.query("update public.journeys set cover_image_path='/images/goa.jpg' where id=$1", [a]);
  await db.query("update public.journey_stops set photo_path='/images/goa.jpg' where journey_id=$1", [a]);
  await as('authenticated', other);
  const b = await copy(a);
  assert.notEqual(b, a);
  const bStops = (await db.query('select * from public.journey_stops where journey_id=$1', [b])).rows;
  assert.notEqual(bStops[0].id, '30000000-0000-0000-0000-000000000001');
  assert.equal(bStops[0].photo_path, '/images/goa.jpg');
  await as('anon'); assert.equal((await children(a)).length, 0, 'Draft remix is never public');
  await as('authenticated', other);
  await db.query("update public.journeys set status='published',published_at=now(),title='My remix' where id=$1", [b]);
  await db.query("update public.journey_stops set description='My note' where journey_id=$1", [b]);
  await as('authenticated', owner);
  assert.equal((await db.query('select title from public.journeys where id=$1', [a])).rows[0].title, 'Original');
  assert.equal((await db.query('select description from public.journey_stops where journey_id=$1', [a])).rows[0].description, 'Original note');
  await db.query("update public.journeys set title='Edited original' where id=$1", [a]);
  await db.query("update public.journey_stops set description='Edited source note' where journey_id=$1", [a]);
  const c = await copy(b);
  await db.query("update public.journeys set status='published',published_at=now(),title='Third generation' where id=$1", [c]);
  await as('anon');
  assert.equal((await publicNode(b)).title, 'My remix');
  assert.equal((await publicNode(b)).copied_from_journey_id, a);
  assert.equal((await publicNode(c)).copied_from_journey_id, b);
  assert.deepEqual((await children(a)).map(j => j.id), [b], 'Direct remixes do not include grandchildren');
  assert.deepEqual((await children(b)).map(j => j.id), [c]);
  assert.equal((await db.query('select description from public.journey_stops where journey_id=$1', [b])).rows[0].description, 'My note');
  assert.equal((await db.query('select * from public.get_public_journeys(null,null,$1)', [b])).rows.length, 1, 'Published remix stays in discovery');
  await assert.rejects(db.query('select * from public.profiles'), /permission denied/);
  await as('authenticated', owner);
  await db.query("update public.journeys set status='draft',published_at=null where id=$1", [a]);
  // Even an authenticated owner sees no source through the explicit public query.
  assert.equal(await publicNode(a), undefined);
  await as('anon');
  assert.equal(await publicNode(a), undefined);
  assert.equal((await db.query('select * from public.get_public_journeys(null,null,$1)', [a])).rows.length, 0);
  assert.equal((await db.query('select public.get_journey_detail($1) as result', [a])).rows[0].result, null);
  await as('authenticated', owner); await db.query('delete from public.journeys where id=$1', [a]);
  await as('anon');
  assert.equal((await publicNode(b)).copied_from_journey_id, null);
  assert.equal((await db.query('select cover_image_path,description,user_id from public.journeys where id=$1', [b])).rows[0].cover_image_path, '/images/goa.jpg');
  assert.equal((await db.query('select photo_path,description from public.journey_stops where journey_id=$1', [b])).rows[0].photo_path, '/images/goa.jpg');
  await as('authenticated', other); await db.query('delete from public.journeys where id=$1', [b]);
  await as('anon'); assert.equal((await publicNode(c)).copied_from_journey_id, null);
  assert.equal((await db.query('select * from public.journey_stops where journey_id=$1', [c])).rows.length, 1);
  assert.equal((await db.query('select * from public.journeys where id=$1', [c])).rows[0].user_id, owner);
  console.log('PASS lineage SQL: public-only parent/children, draft/private source protection, multi-generation direct edges, new IDs, bidirectional edit independence, normal discovery and delete-to-NULL preserving ownership/content/photos.');
} finally { await db.close(); }
