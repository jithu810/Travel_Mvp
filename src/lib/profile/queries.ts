import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { normalize, type PublicRow } from '@/lib/discovery/queries';
import { resolveMedia } from '@/lib/journey/media';
import { safeImage } from '@/lib/journey/detail';
export type PublicProfile = { id: string; username: string; display_name: string | null; bio: string | null; avatar_path: string | null; published_count: number };
export async function accountJourneys(client: SupabaseClient<Database>,collection: 'published' | 'drafts' | 'saved',ownerId?: string) {
  const { data,error } = await client.rpc('get_account_journeys',{ collection,...(ownerId ? { owner_id: ownerId } : {}) });
  if (error) throw new Error('Journeys could not be loaded. Please try again.');
  const rows = data as unknown as PublicRow[];
  const media = await resolveMedia(client,rows.flatMap(row => [row.cover_image_path,row.creator_avatar]));
  return rows.map(row => normalize({ ...row,cover_image_path: media.get(row.cover_image_path || '') || row.cover_image_path,creator_avatar: media.get(row.creator_avatar || '') || row.creator_avatar }));
}
export async function publicProfile(client: SupabaseClient<Database>,username: string) {
  const { data,error } = await client.rpc('get_public_profile',{ handle: username });
  if (error) throw new Error('Profile could not be loaded. Please try again.');
  if (!data) return null;
  const profile = data as unknown as PublicProfile;
  const media = await resolveMedia(client,[profile.avatar_path]);
  return { ...profile,avatar_path: safeImage(media.get(profile.avatar_path || '') || profile.avatar_path) };
}
