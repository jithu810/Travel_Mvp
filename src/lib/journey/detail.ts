import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/env";
import { demoJourneys } from "@/lib/discovery/demo";
import { getDestination } from "@/lib/discovery/destinations";
import { demoCoordinates } from "./demo-coordinates";
import { orderedStops } from "./map-data";
import type { JourneyDetail } from "./types";
import descriptions from "./demo-stop-details.json";
import { resolveMedia } from "./media";

export function safeImage(value: unknown, fallback: string | null = null) {
  if (typeof value !== "string") return fallback;
  if (value.startsWith("/images/")) return value;
  try { return new URL(value).protocol === "https:" ? value : fallback; } catch { return fallback; }
}

export function normalizeDetail(row: Record<string, unknown>, viewerId: string | null): JourneyDetail {
  const rawStops = Array.isArray(row.stops) ? row.stops as Record<string, unknown>[] : [];
  const slug = typeof row.destination_slug === "string" ? row.destination_slug : "";
  return {
    id: String(row.id), title: typeof row.title === "string" ? row.title : "Untitled journey",
    description: typeof row.description === "string" ? row.description : "",
    destinationSlug: slug, travelerType: row.traveler_type as JourneyDetail["travelerType"],
    durationDays: typeof row.duration_days === "number" ? row.duration_days : 1,
    coverImage: safeImage(row.cover_image_path, getDestination(slug)?.image || "/images/goa.jpg")!,
    creatorId: typeof row.creator_id === "string" ? row.creator_id : null,
    creatorName: typeof row.creator_name === "string" ? row.creator_name : "Traveler",
    creatorUsername: typeof row.creator_username === "string" ? row.creator_username : null,
    creatorAvatar: safeImage(row.creator_avatar), likes: Number(row.likes_count) || 0, isDemo: row.is_demo === true,
    status: row.status === "draft" ? "draft" : "published", copiedFrom: typeof row.copied_from_journey_id === "string" ? row.copied_from_journey_id : null,
    liked: row.liked === true, saved: row.saved === true, viewerId,
    stops: orderedStops(rawStops.map((stop) => ({
      id: String(stop.id), name: typeof stop.name === "string" ? stop.name : "Unnamed stop",
      description: typeof stop.description === "string" ? stop.description : "",
      sequence: Number(stop.sequence), latitude: typeof stop.latitude === "number" ? stop.latitude : null,
      longitude: typeof stop.longitude === "number" ? stop.longitude : null,
      photo: safeImage(stop.photo_path), rating: stop.rating == null ? null : Number(stop.rating),
      dayNumber: typeof stop.day_number === "number" ? stop.day_number : null,
    }))),
  };
}

export async function getJourneyDetail(id: string): Promise<JourneyDetail | null> {
  const config = getSupabaseConfig();
  let viewerId: string | null = null;
  const client = config ? await createClient() : null;
  if (client) {
    const { data: { user }, error } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") throw new Error("Unable to verify your session. Please try again.");
    viewerId = user?.id || null;
  }
  const demo = demoJourneys.find((journey) => journey.id === id);
  if (demo) return {
    ...demo, creatorId: null, creatorUsername: null, status: "published", copiedFrom: null,
    viewerId, liked: false, saved: false,
    stops: demo.stops.map((stop) => ({
      id: stop.id, name: stop.name, description: (descriptions as Record<string, string>)[stop.name] || stop.description, sequence: stop.position,
      longitude: demoCoordinates[stop.name]?.[0] ?? null, latitude: demoCoordinates[stop.name]?.[1] ?? null,
      photo: null, rating: null, dayNumber: null,
    })),
  };
  if (!client || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const { data, error } = await client.rpc("get_journey_detail", { target_id: id });
  if (error) throw new Error("Unable to load this journey. Please try again.");
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const stops = Array.isArray(row.stops) ? row.stops as Record<string,unknown>[] : [];
  const paths = [row.creator_avatar,row.cover_image_path, ...stops.map(stop => stop.photo_path)].map(path => typeof path === 'string' ? path : null);
  const media = await resolveMedia(client, paths);
  return normalizeDetail({ ...row, creator_avatar: media.get(String(row.creator_avatar)) || row.creator_avatar, cover_image_path: media.get(String(row.cover_image_path)) || row.cover_image_path, stops: stops.map(stop => ({ ...stop, photo_path: media.get(String(stop.photo_path)) || stop.photo_path })) }, viewerId);
}
