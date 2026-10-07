import 'server-only';
import { cache } from 'react';
import { seoClient, publicJourneySeo } from '@/lib/seo/public-data';
import { safeImage } from './detail';
import { resolveMedia } from './media';
import { isJourneyId, resolvePublicRoot, type LineageNode } from './lineage';
import type { JourneyDetail } from './types';

// The anonymous client deliberately ignores the viewer's session, even if the
// viewer owns a now-private source. No profile rows or travel data are queried.
const publicNode = cache(async (id: string): Promise<LineageNode | null> => {
  const client = seoClient();
  if (!client || !isJourneyId(id)) return null;
  const { data, error } = await client.from('journeys').select('id,title,copied_from_journey_id')
    .eq('id', id).eq('status', 'published').limit(1);
  if (error) return null;
  const row = data?.[0];
  return row && typeof row.title === 'string' && row.title.trim() ? { id: row.id, title: row.title, copiedFrom: row.copied_from_journey_id ?? null } : null;
});

export type JourneyOrigin = { id: string; title: string; creatorName: string; creatorUsername: string | null; creatorAvatar: string | null };
export type InspiredJourney = { id: string; title: string; destinationName: string | null; travelerType: string | null; durationDays: number; coverImage: string | null };

async function publicOrigin(id: string): Promise<JourneyOrigin | null> {
  try {
    const row = await publicJourneySeo(id);
    const client = seoClient();
    if (!row || !client || !isJourneyId(row.id) || row.id.toLowerCase() !== id.toLowerCase() || typeof row.title !== 'string' || !row.title.trim()) return null;
    const media = await resolveMedia(client, [row.creator_avatar]);
    return { id: row.id, title: row.title, creatorName: row.creator_name || 'Traveler', creatorUsername: row.creator_username || null,
      creatorAvatar: safeImage(media.get(row.creator_avatar || '') || row.creator_avatar) };
  } catch { return null; }
}

async function directRemixes(id: string): Promise<InspiredJourney[]> {
  const client = seoClient();
  if (!client) return [];
  // Existing copied-from index; one bounded query, no recursive tree/count or
  // per-card profile/stop queries. These are direct published remixes only.
  const { data, error } = await client.from('journeys')
    .select('id,title,destination_name,traveler_type,duration_days,cover_image_path')
    .eq('copied_from_journey_id', id).eq('status', 'published').eq('is_demo', false)
    .order('published_at', { ascending: false }).order('id').limit(3);
  if (error || !data) return [];
  const rows = data.filter(row => row.id !== id && isJourneyId(row.id) && typeof row.title === 'string' && !!row.title.trim());
  const media = await resolveMedia(client, rows.map(row => row.cover_image_path));
  return rows.map(row => ({ id: row.id, title: row.title, destinationName: row.destination_name, travelerType: row.traveler_type,
    durationDays: row.duration_days, coverImage: safeImage(media.get(row.cover_image_path || '') || row.cover_image_path) }));
}

export async function getJourneyLineage(journey: Pick<JourneyDetail, 'id' | 'status' | 'copiedFrom'>) {
  const empty = { source: null, root: null, inspired: [] };
  if (!isJourneyId(journey.id)) return empty;
  const [current, inspired] = await Promise.all([
    journey.status === 'published' ? publicNode(journey.id).catch(() => null) : null,
    journey.status === 'published' ? directRemixes(journey.id).catch(() => []) : [],
  ]);
  const parentId = current?.copiedFrom ?? (journey.status === 'draft' ? journey.copiedFrom : null);
  if (!isJourneyId(parentId) || parentId.toLowerCase() === journey.id.toLowerCase()) return { source: null, root: null, inspired };
  const source = await publicOrigin(parentId);
  if (!source) return { source: null, root: null, inspired };
  // Only metadata traverses this bounded chain; hidden/missing hops stop it.
  const resolved = current ? await resolvePublicRoot(current, publicNode).catch(() => ({ root: null })) : { root: null };
  return { source, root: resolved.root && resolved.root.id !== source.id && resolved.root.id !== journey.id ? resolved.root : null, inspired };
}
