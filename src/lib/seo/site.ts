/** Only an explicitly configured public HTTPS origin is suitable for launch SEO. */
export function getSiteUrl(): string | null {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || '');
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null;
    if (!host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local') || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return null;
    return url.origin;
  } catch { return null; }
}

export function siteUrl(path: string): string | undefined {
  const origin = getSiteUrl();
  return origin ? new URL(path, origin).href : undefined;
}

export function shareJourneyUrl(id: string, fallbackOrigin: string): string {
  const path = `/journey/${encodeURIComponent(id)}`;
  return siteUrl(path) || new URL(path, fallbackOrigin).href;
}
