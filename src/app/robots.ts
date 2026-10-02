import type { MetadataRoute } from 'next';
import { getSiteUrl, siteUrl } from '@/lib/seo/site';

export default function robots(): MetadataRoute.Robots {
  if (!getSiteUrl()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/login', '/create', '/saved', '/profile$', '/profile?', '/profile/edit$', '/profile/edit?', '/*?tab=drafts', '/auth/', '/api/'] },
    sitemap: siteUrl('/sitemap.xml'),
  };
}
