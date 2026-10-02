import type { MetadataRoute } from 'next';
import { destinations } from '@/lib/discovery/destinations';
import { getSiteUrl, siteUrl } from '@/lib/seo/site';
import { seoClient } from '@/lib/seo/public-data';
import type { PublicRow } from '@/lib/discovery/queries';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!getSiteUrl()) return [];
  const entries: MetadataRoute.Sitemap = ['/', '/explore', ...destinations.map(destination => `/destination/${destination.slug}`)].map(path => ({ url: siteUrl(path)! }));
  const client = seoClient();
  if (!client) return entries;
  // Existing anonymous SELECT grants/RLS expose only published journeys.
  // Keyset pagination avoids the public discovery RPC's latest-100 limit.
  let cursor: string | undefined;
  while (true) {
    let query = client.from('journeys').select('id,updated_at').eq('status', 'published').eq('is_demo', false).order('id').limit(1000);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw new Error('Published journey sitemap is temporarily unavailable.');
    if (!data?.length) break;
    for (const row of data) entries.push({ url: siteUrl(`/journey/${row.id}`)!, lastModified: row.updated_at });
    cursor = data[data.length - 1].id;
  }
  // Public profiles of creators surfaced by the existing discovery projection.
  const { data, error } = await client.rpc('get_public_journeys', {});
  if (error) throw new Error('Public profile sitemap is temporarily unavailable.');
  const usernames = new Set((data as unknown as PublicRow[]).filter(row => !row.is_demo).map(row => row.creator_username).filter((value): value is string => !!value && value.toLowerCase() !== 'edit'));
  for (const username of usernames) entries.push({ url: siteUrl(`/profile/${encodeURIComponent(username)}`)! });
  return entries;
}
