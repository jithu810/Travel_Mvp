import 'server-only';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';
import { demoJourneys } from '@/lib/discovery/demo';
import type { PublicRow } from '@/lib/discovery/queries';

export function seoClient() {
  const config = getSupabaseConfig();
  return config ? createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(8000) }) },
  }) : null;
}

// No cookie/session client: even the owner's draft must never get public metadata.
export const publicJourneySeo = cache(async (id: string): Promise<PublicRow | null> => {
  const demo = demoJourneys.find(journey => journey.id === id);
  if (demo) return {
    id, title: demo.title, description: demo.description, destination_slug: demo.destinationSlug,
    traveler_type: demo.travelerType, duration_days: demo.durationDays, cover_image_path: demo.coverImage,
    creator_name: demo.creatorName, creator_avatar: null, likes_count: 0, is_demo: true, stops: [],
  };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const client = seoClient();
  if (!client) return null;
  const { data, error } = await client.rpc('get_public_journeys', { journey_filter: id });
  if (error) throw new Error('Public journey metadata is temporarily unavailable.');
  return (data as unknown as PublicRow[])?.[0] || null;
});

export type ProfileSeo = { username: string; display_name: string | null; bio: string | null };
export const publicProfileSeo = cache(async (username: string): Promise<ProfileSeo | null> => {
  const client = seoClient();
  if (!client) return null;
  const { data, error } = await client.rpc('get_public_profile', { handle: username });
  if (error) throw new Error('Public profile metadata is temporarily unavailable.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  return { username: String(row.username), display_name: typeof row.display_name === 'string' ? row.display_name : null, bio: typeof row.bio === 'string' ? row.bio : null };
});
