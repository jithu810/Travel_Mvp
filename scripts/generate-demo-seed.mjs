import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const coordinates = JSON.parse(readFileSync(new URL("../src/lib/journey/demo-coordinates.json", import.meta.url), "utf8"));
const descriptions = JSON.parse(readFileSync(new URL("../src/lib/journey/demo-stop-details.json", import.meta.url), "utf8"));

export function demoId(id) {
  const hash = createHash("sha256").update(`journey-sample:${id}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function generateSeed(samples, owner) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner || "")) throw new Error("Pass an existing Supabase Auth user UUID: npm run seed:demo -- <owner-uuid>");
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  let sql = `-- Journey demo data. Generated locally; review before applying in SQL Editor.\n-- Requires both migrations and an existing dedicated demo Auth user.\nbegin;\n\ndo $$ begin\n  if not exists (select 1 from public.profiles where id = '${owner}') then\n    raise exception 'Demo owner must have an existing profile';\n  end if;\nend $$;\n`;
  for (const sample of samples) {
    const id = demoId(sample.id);
    sql += `\ninsert into public.journeys (id, user_id, title, description, destination_slug, traveler_type, duration_days, status, published_at, cover_image_path, is_demo)\nvalues ('${id}', '${owner}', ${quote(sample.title)}, ${quote(sample.description)}, ${quote(sample.destination)}, ${quote(sample.traveler)}, ${sample.days}, 'published', '2026-10-01T00:00:00Z', '/images/${sample.destination}.jpg', true)\non conflict (id) do nothing;\n`;
    // Never overwrite an existing record owned by somebody else.
    for (const [sequence, name] of sample.stops.entries()) {
      const [longitude, latitude] = coordinates[name] || [null, null];
      sql += `insert into public.journey_stops (journey_id, sequence, name, description, longitude, latitude)\nselect '${id}', ${sequence}, ${quote(name)}, ${quote(descriptions[name] || "An example stop on this sample route.")}, ${longitude ?? "null"}, ${latitude ?? "null"}\nwhere exists (select 1 from public.journeys where id = '${id}' and user_id = '${owner}' and is_demo)\non conflict (journey_id, sequence) do update set longitude = coalesce(public.journey_stops.longitude, excluded.longitude), latitude = coalesce(public.journey_stops.latitude, excluded.latitude);\n`;
    }
  }
  return sql + "\ncommit;\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const samples = JSON.parse(await readFile(new URL("../src/lib/discovery/demo-journeys.json", import.meta.url), "utf8"));
  const path = new URL("../supabase/demo-seed.generated.sql", import.meta.url);
  await writeFile(path, generateSeed(samples, process.argv[2]));
  console.log("Created supabase/demo-seed.generated.sql for all three migrations. Review it, then apply it in Supabase SQL Editor. Demo coordinates are approximate. No remote database was modified.");
}
