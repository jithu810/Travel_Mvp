import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { demoId, generateSeed } from "./generate-demo-seed.mjs";

// Only Supabase's auth schema/uid function are simulated. Actual migration runs
// against isolated in-memory PostgreSQL; no remote project is contacted.
const db = new PGlite();
const owner = "10000000-0000-0000-0000-000000000001";
const other = "10000000-0000-0000-0000-000000000002";
const published = "20000000-0000-0000-0000-000000000001";
const draft = "20000000-0000-0000-0000-000000000002";
const otherDraft = "20000000-0000-0000-0000-000000000003";

async function as(role, user = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec(`set role ${role}`);
}
async function count(table) {
  return (await db.query(`select count(*)::int as count from public.${table}`)).rows[0].count;
}
async function denied(sql, args = []) {
  await assert.rejects(db.query(sql, args), /row-level security|permission denied/);
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.query("insert into auth.users (id) values ($1)", [other]);
  await db.exec(await readFile(new URL("../supabase/migrations/20261001000000_core_schema.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261001010000_public_discovery.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261001020000_journey_details.sql", import.meta.url), "utf8"));
  await db.query("insert into auth.users (id) values ($1)", [owner]);
  assert.equal(await count("profiles"), 2, "Profile trigger and existing-user backfill");

  await as("authenticated", owner);
  assert.equal(await count("profiles"), 1);
  await db.query("update public.profiles set username = 'Traveller' where id = $1", [owner]);
  await db.query("insert into public.journeys (id, user_id, title, status, published_at) values ($1, $2, 'Published route', 'published', now())", [published, owner]);
  await db.query("insert into public.journeys (id, user_id, title) values ($1, $2, 'Private draft')", [draft, owner]);
  await db.query("insert into public.journey_stops (journey_id, sequence, name, latitude, longitude) values ($1, 0, 'First stop', 10, 76), ($2, 0, 'Private stop', null, null)", [published, draft]);
  await assert.rejects(db.query("insert into public.journey_stops (journey_id, sequence, name) values ($1, 0, 'Duplicate')", [published]), /unique constraint/);
  await assert.rejects(db.query("insert into public.journey_stops (journey_id, sequence, name, latitude, longitude) values ($1, 1, 'Invalid coordinates', 91, 76)", [published]), /check constraint/);
  await assert.rejects(db.query("insert into public.journeys (user_id, title, status) values ($1, 'Missing timestamp', 'published')", [owner]), /check constraint/);
  await denied("update public.journeys set user_id = $1 where id = $2", [other, published]);

  await as("anon");
  assert.equal(await count("journeys"), 1, "Only published journeys are public");
  assert.equal(await count("journey_stops"), 1, "Draft stops are private");
  await denied("select * from public.saved_journeys");
  await denied("update public.journeys set title = 'Tampered'");

  await as("authenticated", other);
  assert.equal(await count("journeys"), 1);
  assert.equal(await count("journey_stops"), 1);
  assert.equal((await db.query("update public.journeys set title = 'Tampered' where id = $1 returning id", [published])).rows.length, 0);
  assert.equal((await db.query("delete from public.journeys where id = $1 returning id", [published])).rows.length, 0);
  assert.equal((await db.query("update public.profiles set bio = 'Tampered' where id = $1 returning id", [owner])).rows.length, 0);
  await denied("insert into public.journeys (user_id, title) values ($1, 'Forged owner')", [owner]);
  await denied("insert into public.journey_stops (journey_id, sequence, name) values ($1, 1, 'Tampered')", [published]);
  await db.query("insert into public.journeys (id, user_id, title) values ($1, $2, 'Other draft')", [otherDraft, other]);
  await assert.rejects(db.query("update public.profiles set username = 'traveller' where id = $1", [other]), /unique constraint/);
  for (const table of ["journey_likes", "saved_journeys"]) {
    await denied(`insert into public.${table} (user_id, journey_id) values ($1, $2)`, [owner, published]);
    await denied(`insert into public.${table} (user_id, journey_id) values ($1, $2)`, [other, draft]);
    await db.query(`insert into public.${table} (user_id, journey_id) values ($1, $2)`, [other, published]);
    await assert.rejects(db.query(`insert into public.${table} (user_id, journey_id) values ($1, $2)`, [other, published]), /unique constraint/);
    await denied(`update public.${table} set user_id = $1`, [owner]);
  }

  await as("authenticated", owner);
  assert.equal(await count("journeys"), 2);
  await denied("update public.journey_stops set journey_id = $1 where journey_id = $2", [otherDraft, published]);
  assert.equal(await count("journey_likes"), 0);
  assert.equal(await count("saved_journeys"), 0);
  assert.equal((await db.query("delete from public.saved_journeys returning user_id")).rows.length, 0);
  const before = (await db.query("select updated_at from public.journeys where id = $1", [draft])).rows[0].updated_at;
  await db.query("update public.journeys set title = 'Updated draft' where id = $1", [draft]);
  const after = (await db.query("select updated_at from public.journeys where id = $1", [draft])).rows[0].updated_at;
  assert.ok(new Date(after) > new Date(before), "Updated timestamp advances");
  await db.query("update public.journeys set status = 'draft', published_at = null where id = $1", [published]);

  await as("authenticated", other);
  for (const table of ["journey_likes", "saved_journeys"]) {
    assert.equal(await count(table), 1, "Users can remove interactions after unpublishing");
    await db.query(`delete from public.${table} where journey_id = $1`, [published]);
    assert.equal(await count(table), 0);
  }
  await as("authenticated", owner);
  for (const table of ["journey_likes", "saved_journeys"]) {
    await db.query(`insert into public.${table} (user_id, journey_id) values ($1, $2)`, [owner, draft]);
  }
  await db.query("delete from public.journeys where id = $1", [published]);
  assert.equal(await count("journey_stops"), 1);
  await db.exec("reset role");
  await db.query("delete from auth.users where id = $1", [owner]);
  assert.equal(await count("profiles"), 1);
  assert.equal(await count("journeys"), 1);
  assert.equal(await count("journey_stops"), 0);
  assert.equal(await count("journey_likes"), 0);
  assert.equal(await count("saved_journeys"), 0);
  const samples = JSON.parse(await readFile(new URL("../src/lib/discovery/demo-journeys.json", import.meta.url), "utf8"));
  const seed = generateSeed(samples, other);
  await db.exec(seed);
  await db.exec(seed);
  assert.equal(await count("journeys"), 17, "Seed reruns do not duplicate records");
  await as("anon");
  const allPublic = (await db.query("select * from public.get_public_journeys()" )).rows.map((row) => row.get_public_journeys);
  assert.equal(allPublic.length, 16);
  assert.ok(allPublic.every((journey) => journey.is_demo && journey.creator_name === "Journey demo studio"));
  const couple = (await db.query("select * from public.get_public_journeys('goa', 'couple')")).rows.map((row) => row.get_public_journeys);
  assert.equal(couple.length, 1);
  assert.equal(couple[0].traveler_type, "couple");
  assert.equal(couple[0].stops.length, 4);
  assert.equal(couple[0].stops[0].name, "Candolim Beach");
  assert.equal((await db.query("select * from public.get_public_journeys('munnar', 'solo')")).rows.length, 0);
  assert.equal((await db.query("select * from public.get_public_journeys(null, null, $1)", [otherDraft])).rows.length, 0, "Public RPC never exposes drafts");
  await denied("select * from public.profiles");
  await denied("select * from public.journey_likes");
  await as("authenticated", other);
  await db.query("insert into public.journey_likes (user_id, journey_id) values ($1, $2)", [other, demoId("demo-goa-couple")]);
  await db.query("update public.journeys set status = 'draft', published_at = null where id = $1", [demoId("demo-goa-solo")]);
  await assert.rejects(db.query("update public.journeys set traveler_type = 'invalid' where id = $1", [demoId("demo-goa-couple")]), /check constraint/);
  await as("anon");
  const counted = (await db.query("select * from public.get_public_journeys('goa', 'couple')")).rows[0].get_public_journeys;
  assert.equal(counted.likes_count, 1, "Public counts aggregate private likes without identities");
  assert.equal((await db.query("select * from public.get_public_journeys(null, null, $1)", [demoId("demo-goa-solo")])).rows.length, 0);
  console.log("PASS: migration, profile provisioning, publication, RLS privacy/ownership, uniqueness, coordinates, timestamps, and cascades.");
  console.log("PASS: public discovery filtering, draft protection, private profiles/likes, aggregated counts, ordered stops, and idempotent 16-journey demo seed.");
  const viewer = "10000000-0000-0000-0000-000000000003";
  const sourceId = demoId("demo-goa-couple");
  await db.exec("reset role");
  await db.query("insert into auth.users (id) values ($1)", [viewer]);
  await as("authenticated", other);
  await db.query("update public.journeys set is_demo = false where id = $1", [sourceId]);
  await db.query("update public.profiles set display_name = 'Asha', username = 'asha', bio = 'Private bio' where id = $1", [other]);
  await db.query("update public.journey_stops set day_number = 2, rating = 4.5, photo_path = '/images/goa.jpg' where journey_id = $1 and sequence = 1", [sourceId]);
  await as("anon");
  const detail = (await db.query("select public.get_journey_detail($1) as detail", [sourceId])).rows[0].detail;
  assert.equal(detail.creator_name, "Asha");
  assert.equal(detail.creator_username, "asha");
  assert.equal(detail.bio, undefined);
  assert.deepEqual(detail.stops.map((stop) => stop.sequence), [0, 1, 2, 3]);
  assert.equal(detail.stops[1].day_number, 2);
  assert.equal(detail.stops[1].rating, 4.5);
  assert.equal((await db.query("select public.get_journey_detail($1) as detail", [otherDraft])).rows[0].detail, null);
  await denied("select public.copy_journey($1)", [sourceId]);

  await as("authenticated", viewer);
  assert.equal((await db.query("select public.get_journey_detail($1) as detail", [otherDraft])).rows[0].detail, null);
  await assert.rejects(db.query("select public.copy_journey($1)", [otherDraft]), /Journey not found/);
  const copyId = (await db.query("select public.copy_journey($1) as id", [sourceId])).rows[0].id;
  const copy = (await db.query("select * from public.journeys where id = $1", [copyId])).rows[0];
  assert.equal(copy.user_id, viewer);
  assert.equal(copy.status, "draft");
  assert.equal(copy.published_at, null);
  assert.equal(copy.copied_from_journey_id, sourceId);
  assert.equal(copy.is_demo, false);
  const copyDetail = (await db.query("select public.get_journey_detail($1) as detail", [copyId])).rows[0].detail;
  const withoutIds = (stops) => stops.map((stop) => Object.fromEntries(Object.entries(stop).filter(([key]) => key !== "id")));
  assert.deepEqual(withoutIds(copyDetail.stops), withoutIds(detail.stops));
  for (const table of ["journey_likes", "saved_journeys"]) {
    const insert = `insert into public.${table} (user_id, journey_id) values ($1, $2) on conflict (user_id, journey_id) do nothing`;
    await db.query(insert, [viewer, sourceId]); await db.query(insert, [viewer, sourceId]);
    assert.equal((await db.query(`select count(*)::int as count from public.${table} where journey_id = $1`, [sourceId])).rows[0].count, 1);
  }
  const liked = (await db.query("select public.get_journey_detail($1) as detail", [sourceId])).rows[0].detail;
  assert.equal(liked.liked, true); assert.equal(liked.saved, true); assert.equal(liked.likes_count, 2);
  for (const table of ["journey_likes", "saved_journeys"]) await db.query(`delete from public.${table} where user_id = $1 and journey_id = $2`, [viewer, sourceId]);
  const unliked = (await db.query("select public.get_journey_detail($1) as detail", [sourceId])).rows[0].detail;
  assert.equal(unliked.liked, false); assert.equal(unliked.saved, false); assert.equal(unliked.likes_count, 1);
  await as("anon");
  assert.equal((await db.query("select public.get_journey_detail($1) as detail", [copyId])).rows[0].detail, null);
  assert.equal((await db.query("select * from public.journey_stops where journey_id = $1", [copyId])).rows.length, 0);
  await as("authenticated", other);
  assert.equal((await db.query("select public.get_journey_detail($1) as detail", [copyId])).rows[0].detail, null);
  assert.equal((await db.query("update public.journey_stops set name = 'Tampered' where journey_id = $1 returning id", [copyId])).rows.length, 0);
  await db.exec("reset role");
  await db.exec(`create function public.reject_test_copy() returns trigger language plpgsql as $$ begin raise exception 'Test copy failure'; end; $$;
    create trigger reject_test_copy before insert on public.journey_stops for each row execute function public.reject_test_copy();`);
  await as("authenticated", viewer);
  const beforeCopy = await count("journeys");
  await assert.rejects(db.query("select public.copy_journey($1)", [sourceId]), /Test copy failure/);
  assert.equal(await count("journeys"), beforeCopy, "Failed copy rolls back its draft as well as stops");
  console.log("PASS: owner-only detail, public creator projection, optional fields, like/unlike, save/unsave, duplicate prevention, ordered private copies and transactional rollback.");
} finally {
  await db.close();
}
