import { expect, test } from '@playwright/test';
import { getSiteUrl, shareJourneyUrl } from '../src/lib/seo/site';
import { publicMetadata, seoImage } from '../src/lib/seo/metadata';

test('production URLs are explicit and signed/private OG images use a stable fallback', () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    for (const value of ['', 'http://localhost:3000', 'http://192.168.1.4:3000', 'https://192.168.1.4', 'https://example.com/path', 'https://user:password@example.com', 'https://example.com?token=secret']) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      expect(getSiteUrl()).toBeNull();
      expect(publicMetadata('Title', 'Description', '/').alternates).toBeUndefined();
      expect(publicMetadata('Title', 'Description', '/').robots).toMatchObject({ index: false });
    }
    process.env.NEXT_PUBLIC_SITE_URL = 'https://journey.example/';
    expect(getSiteUrl()).toBe('https://journey.example');
    expect(shareJourneyUrl('id', 'http://192.168.1.4:3000')).toBe('https://journey.example/journey/id');
    for (const cover of [null, 'journey-media/private.jpg', 'https://project.supabase.co/storage/v1/object/sign/journey-media/private.jpg?token=secret', 'https://cdn.example/photo.jpg?expires=123', 'http://private.example/photo.jpg']) {
      expect(seoImage(cover)).toBe('https://journey.example/images/goa.jpg');
    }
    expect(seoImage('https://cdn.example/photo.jpg')).toBe('https://cdn.example/photo.jpg');
  } finally {
    if (original === undefined) Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_SITE_URL');
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  }
});

test('unconfigured preview blocks crawling and exposes no fabricated site domain', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /');
  expect(await robots.text()).not.toContain('Sitemap:');
  const sitemap = await request.get('/sitemap.xml');
  expect(await sitemap.text()).not.toContain('<loc>');
  const response = await request.get('/api/journeys/demo-goa-couple/actions');
  expect(response.headers()['x-robots-tag']).toContain('noindex');
});
