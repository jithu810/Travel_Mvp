import 'server-only';
import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { seoClient } from '@/lib/seo/public-data';
import { getSupabaseConfig } from '@/lib/env';
import { journeyIntelligence } from '@/lib/journey/journey-intelligence';
import { isJourneyId } from '@/lib/journey/lineage';
import { getDestination } from './destinations';
import { recommendJourneys, type RecommendationFeatures } from './recommendations';
import type { Journey } from './types';

export async function homeRecommendations(journeys: readonly Journey[], alreadyVisible: readonly string[] = []) {
  const empty = { results: [], personalized: false };
  const client = seoClient();
  if (!client || !getSupabaseConfig() || !journeys.length) return empty;
  let viewerId: string | null = null, savedIds: string[] = [], likedIds: string[] = [];
  try {
    const session = await createClient();
    const { data: { user }, error } = await session.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') return empty;
    viewerId = user?.id || null;
    if (viewerId) {
      const [saved, liked] = await Promise.all([
        session.from('saved_journeys').select('journey_id').eq('user_id', viewerId).order('created_at', { ascending: false }).order('journey_id').limit(20),
        session.from('journey_likes').select('journey_id').eq('user_id', viewerId).order('created_at', { ascending: false }).order('journey_id').limit(20),
      ]);
      savedIds = saved.error ? [] : (saved.data || []).map(row => row.journey_id).filter(isJourneyId).slice(0, 20);
      likedIds = liked.error ? [] : (liked.data || []).map(row => row.journey_id).filter(isJourneyId).slice(0, 20);
    }
    const ids = [...new Set([...journeys.slice(0, 100).map(j => j.id), ...savedIds, ...likedIds].filter(isJourneyId))];
    if (!ids.length) return empty;
    // One anonymous, published-only batch for <=140 journeys. No profile,
    // private note, track, session or signed-image queries are needed here.
    const { data, error: queryError } = await client.from('journeys')
      .select('id,user_id,status,destination_slug,destination_name,destination_latitude,destination_longitude,traveler_type,duration_days,published_at,copied_from_journey_id,journey_stops(id,name,sequence,latitude,longitude,day_number,description,photo_path,rating)')
      .in('id', ids).eq('status', 'published').eq('is_demo', false).limit(140);
    if (queryError || !data) return empty;
    const features = new Map<string, RecommendationFeatures>();
    for (const row of data) {
      const stops = [...row.journey_stops].sort((a, b) => a.sequence - b.sequence);
      const knownDestination = getDestination(row.destination_slug || '');
      const intelligence = journeyIntelligence({ travelerType: row.traveler_type, stops: stops.map(s => ({ id: s.id, name: s.name, sequence: s.sequence,
        latitude: s.latitude, longitude: s.longitude, dayNumber: s.day_number, description: s.description || '', photo: s.photo_path, rating: s.rating })) });
      features.set(row.id, { id: row.id, creatorId: row.user_id, status: 'published', destinationSlug: row.destination_slug || '', destinationName: row.destination_name,
        latitude: row.destination_latitude ?? knownDestination?.latitude ?? null, longitude: row.destination_longitude ?? knownDestination?.longitude ?? null,
        durationDays: row.duration_days > 0 ? row.duration_days : null, publishedAt: row.published_at, copiedFrom: row.copied_from_journey_id, intelligence,
        contentKey: createHash('sha256').update(JSON.stringify([row.traveler_type, row.duration_days, stops.map(s => [s.name, s.latitude, s.longitude, s.day_number, s.description, s.photo_path, s.rating])])).digest('hex') });
    }
    const candidates = journeys.slice(0, 100).flatMap(journey => {
      const feature = features.get(journey.id); return feature ? [{ journey: { ...journey, status: 'published' as const, saved: savedIds.includes(journey.id) }, features: feature }] : [];
    });
    const input = { candidates, saved: savedIds.flatMap(id => features.get(id) || []), liked: likedIds.flatMap(id => features.get(id) || []), viewerId, now: Date.now() };
    const ranked = recommendJourneys(input);
    // With little data the existing Popular/Recent sections already provide
    // cold-start discovery. Add fallback cards only when they offer other stories.
    return ranked.personalized ? ranked : recommendJourneys({ ...input, candidates: candidates.filter(c => !alreadyVisible.includes(c.journey.id)) });
  } catch { return empty; }
}
