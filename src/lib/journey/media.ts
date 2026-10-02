import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
export async function resolveMedia(client: SupabaseClient<Database>, paths: (string | null)[]) {
  const resolved = new Map<string,string>();
  for (const bucket of ['journey-media','profile-avatars']) {
    const objects = [...new Set(paths.filter((path): path is string => !!path?.startsWith(`${bucket}/`)))];
    if (!objects.length) continue;
    const { data } = await client.storage.from(bucket).createSignedUrls(objects.map(path => path.slice(bucket.length + 1)),3600);
    data?.forEach((item,index) => { if (item.signedUrl && !item.error) resolved.set(objects[index],item.signedUrl); });
  }
  return resolved;
}
