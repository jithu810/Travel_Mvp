import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { demoJourneys } from "./demo";
import { getDestination } from "./destinations";
import type { DiscoveryResult, Journey, TravelerFilter } from "./types";
import { resolveMedia } from '@/lib/journey/media';

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

async function fetchPublished(destination?: string, traveler: TravelerFilter = "all", id?: string) {
  const config = getSupabaseConfig();
  if (!config) return null;
  // Public discovery intentionally uses the anon/publishable key and no session.
  const client = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) }) },
  });
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

export async function getJourney(id: string): Promise<{ journey: Journey | null; error?: string }> {
  const demo = demoJourneys.find((journey) => journey.id === id);
  if (demo) return { journey: demo };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { journey: null };
  try { return { journey: (await fetchPublished(undefined, "all", id))?.[0] || null }; }
  catch { return { journey: null, error: "We couldn't load this journey. Please try again." }; }
}
