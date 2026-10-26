import 'server-only';
import { cache } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { getSupabaseConfig } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export type DiscoveryViewer = { id: string | null; failed: boolean };

// One auth lookup per request, shared by Home discovery and recommendations.
// failed marks an unverifiable session (anything but a missing session) so
// callers that previously bailed out on such errors can keep doing so.
export const discoveryViewer = cache(async (): Promise<DiscoveryViewer> => {
  if (!getSupabaseConfig()) return { id: null, failed: false };
  try {
    const session = await createClient();
    const { data: { user }, error } = await session.auth.getUser();
    if (error) return { id: null, failed: error.name !== 'AuthSessionMissingError' };
    return { id: user?.id || null, failed: false };
  } catch (error) {
    unstable_rethrow(error);
    return { id: null, failed: true };
  }
});

// Discovery only needs the signed-in viewer's id to hide their own journeys.
// Any missing, invalid or expired session falls back to an anonymous viewer.
export async function discoveryViewerId(): Promise<string | null> {
  return (await discoveryViewer()).id;
}
