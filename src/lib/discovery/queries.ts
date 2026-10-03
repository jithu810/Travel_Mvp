import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { demoJourneys } from "./demo";
import { getDestination } from "./destinations";
import type { DiscoveryResult, Journey, TravelerFilter } from "./types";
import { resolveMedia } from '@/lib/journey/media';
import { matchesDestination, type SelectedDestination } from './selected-destination';
import type { ExploreResult } from './explore-types';
import { matchesStop, storedCoordinates } from './explore-geography';

export type PublicRow = {
  id: string; title: string; description: string | null; destination_slug: string;
  traveler_type: Journey["travelerType"]; duration_days: number; cover_image_path: string | null;
  creator_id?: string; creator_username?: string; status?: string; saved?: boolean; creator_name: string; creator_avatar: string | null; likes_count: number; is_demo: boolean;
  stops: { id: string; name: string; description: string | null; position: number }[];
};

function publicImage(value: string | null, fallback: string) {
  if (value?.startsWith("/images/")) return value;
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? url.toString() : fallback;
  } catch { return fallback; }
}

export function normalize(row: PublicRow): Journey {
  return {
    id: row.id, title: row.title, description: row.description || "Explore the stops along this journey.",
    destinationSlug: row.destination_slug, travelerType: row.traveler_type,
    durationDays: row.duration_days, coverImage: publicImage(row.cover_image_path, getDestination(row.destination_slug)?.image || "/images/goa.jpg"),
    creatorId: row.creator_id, creatorUsername: row.creator_username, status: row.status === 'draft' ? 'draft' : 'published', saved: row.saved,
    creatorName: row.creator_name || "Traveler", creatorAvatar: row.creator_avatar ? publicImage(row.creator_avatar, "") || null : null,
    likes: Number(row.likes_count), isDemo: row.is_demo,
    stops: row.stops.map((stop) => ({ ...stop, description: stop.description || "A stop along this journey." })),
  };
}

function publicClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  // Public discovery intentionally uses the anon/publishable key and no session.
  return createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) }) },
  });
}

async function fetchPublished(destination?: string, traveler: TravelerFilter = "all", id?: string) {
  const client = publicClient();
  if (!client) return null;
  const { data, error } = await client.rpc("get_public_journeys", {
    ...(destination ? { destination_filter: destination } : {}),
    ...(traveler !== "all" ? { traveler_filter: traveler } : {}),
    ...(id ? { journey_filter: id } : {}),
  });
  if (error) throw error;
  const rows = data as unknown as PublicRow[];
  const media = await resolveMedia(client, rows.flatMap(row => [row.cover_image_path,row.creator_avatar]));
  return rows.map(row => normalize({ ...row, cover_image_path: media.get(row.cover_image_path || '') || row.cover_image_path,creator_avatar: media.get(row.creator_avatar || '') || row.creator_avatar }));
}

// Keep the existing destination-query entry point compatible with Explore.
export async function getDestinationJourneys(selected: SelectedDestination, traveler: TravelerFilter): Promise<DiscoveryResult> {
  return getExploreJourneys(selected, traveler);
}

export async function getJourneys(destination?: string, traveler: TravelerFilter = "all"): Promise<DiscoveryResult> {
  const demo = demoJourneys.filter((journey) => (!destination || journey.destinationSlug === destination) && (traveler === "all" || journey.travelerType === traveler));
  try {
    // First check the unfiltered destination so an empty live filter stays empty.
    const published = await fetchPublished(destination);
    if (published?.length) {
      return { journeys: traveler === "all" ? published : (await fetchPublished(destination, traveler)) || [], source: "supabase" };
    }
    return { journeys: demo, source: "demo" };
  } catch {
    return { journeys: demo, source: "demo", error: "Published journeys couldn't be loaded. Showing demo journeys while you explore." };
  }
}

// Public-only parent filtering and anonymous RLS also protect embedded stops.
// Fetch stops with their journeys, never once per stop or once per journey.
export async function getExploreJourneys(selected: SelectedDestination | null, traveler: TravelerFilter): Promise<ExploreResult> {
  const empty: ExploreResult = { journeys: [], source: 'supabase', loaded: false };
  const client = publicClient();
  if (!client) return empty;
  try {
    const query = () => {
      let request = client.from('journeys')
        .select('id,destination_slug,destination_name,destination_latitude,destination_longitude,published_at,journey_stops(id,name,sequence,latitude,longitude,mapbox_place_id)')
        .eq('status', 'published').eq('is_demo', false).order('published_at', { ascending: false }).order('id');
      if (traveler !== 'all') request = request.eq('traveler_type', traveler);
      return request;
    };
    type Row = NonNullable<Awaited<ReturnType<typeof query>>['data']>[number];
    const matches: Row[] = [];
    for (let offset = 0; matches.length < 100; offset += 100) {
      const { data, error } = await query().range(offset, offset + 99);
      if (error) throw error;
      for (const row of data) if (row.destination_slug && (!selected || matchesDestination(selected, row) || row.journey_stops.some(stop => matchesStop(selected, stop)))) matches.push(row);
      if (!selected || data.length < 100) break;
    }
    const rows = matches.slice(0, 100);
    if (!rows.length) return { ...empty, loaded: true };
    const slugs = [...new Set(rows.map(row => row.destination_slug!))];
    const cards = new Map<string, Journey>();
    for (let index = 0; index < slugs.length; index += 5) {
      const batches = await Promise.all(slugs.slice(index, index + 5).map(slug => fetchPublished(slug, traveler)));
      for (const journey of batches.flatMap(batch => batch || [])) if (!journey.isDemo) cards.set(journey.id, journey);
    }
    // The existing RPC caps each destination at its newest 100. A stop search
    // can match an older journey; use its existing ID filter only when needed.
    const missing = rows.filter(row => !cards.has(row.id));
    for (let index = 0; index < missing.length; index += 5) {
      const batches = await Promise.all(missing.slice(index, index + 5).map(row => fetchPublished(undefined, traveler, row.id)));
      for (const journey of batches.flatMap(batch => batch || [])) if (!journey.isDemo) cards.set(journey.id, journey);
    }
    return { ...empty, loaded: true, journeys: rows.flatMap(row => {
      const journey = cards.get(row.id);
      if (!journey) return [];
      const stops = [...row.journey_stops].sort((a, b) => a.sequence - b.sequence);
      return [{ ...journey, destinationName: row.destination_name || getDestination(journey.destinationSlug)?.name || journey.destinationSlug,
        coordinates: storedCoordinates(row.destination_latitude, row.destination_longitude),
        mapStops: stops.map(stop => ({ id: stop.id, name: stop.name, position: stop.sequence, coordinates: storedCoordinates(stop.latitude, stop.longitude) })),
        matchingStops: selected ? [...new Set(stops.filter(stop => matchesStop(selected, stop)).map(stop => stop.name))] : [],
      }];
    }) };
  } catch { return { ...empty, error: 'Published journeys could not be loaded. Please try again.' }; }
}

export async function getJourney(id: string): Promise<{ journey: Journey | null; error?: string }> {
  const demo = demoJourneys.find((journey) => journey.id === id);
  if (demo) return { journey: demo };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { journey: null };
  try { return { journey: (await fetchPublished(undefined, "all", id))?.[0] || null }; }
  catch { return { journey: null, error: "We couldn't load this journey. Please try again." }; }
}
