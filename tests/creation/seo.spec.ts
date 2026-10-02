import { expect, test, type APIRequestContext } from '@playwright/test';

const site = 'https://journey.example';
const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'creator@example.com', app_metadata: { provider: 'email' }, user_metadata: { display_name: 'Test Creator' } };
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;

async function seed(request: APIRequestContext, status: 'published' | 'draft', title: string, description = 'Follow the coast in the creator’s ordered route.') {
  const id = crypto.randomUUID();
  const response = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { payload: { id, title, description, destination_slug: 'varkala', traveler_type: 'couple', duration_days: 3, status, updated_at: null,
      cover_image_path: `journey-media/${owner}/${id}/cover/private.jpg`,
      stops: [{ id: crypto.randomUUID(), sequence: 1, name: 'Varkala Cliff', description: 'Sunset stop', latitude: 8.74, longitude: 76.7, photo_path: null, rating: null, day_number: 1 }],
    } },
  });
  expect(response.ok()).toBe(true);
  return id;
}

test('home and destination metadata use canonical production URLs', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Discover & Share Travel Journeys | Journey');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\/journey\.example\/?$/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /remix/i);
  for (const [slug, name] of [['goa', 'Goa'], ['varkala', 'Varkala'], ['munnar', 'Munnar'], ['kochi', 'Kochi'], ['thenkasi', 'Thenkasi']]) {
    await page.goto(`/destination/${slug}?traveler=couple`);
    await expect(page).toHaveTitle(`${name} Travel Journeys & Itineraries | Journey`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${site}/destination/${slug}`);
    const data = await page.locator('script[type="application/ld+json"]').evaluateAll(elements => elements.map(element => JSON.parse(element.textContent!)));
    expect(data[0]['@type']).toBe('BreadcrumbList');
    await page.reload();
    await expect(page.locator('h1')).toHaveText(name);
  }
});

test('published journeys have distinct metadata, safe OG images, JSON-LD and canonical sharing', async ({ page, request }) => {
  const first = await seed(request, 'published', 'Three Days Along Varkala');
  const second = await seed(request, 'published', 'Another Coastal Journey', 'Public notes </script><script>window.seoInjected=true</script>');
  for (const [id, title] of [[first, 'Three Days Along Varkala'], [second, 'Another Coastal Journey']]) {
    const botResponse = await request.get(`/journey/${id}`, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
    const head = (await botResponse.text()).match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
    expect(head).toContain(title);
    expect(head).toContain(`${site}/journey/${id}`);
    expect(head).not.toMatch(/token=|journey-media|creator@example/);
    await page.goto(`/journey/${id}`);
    await expect(page).toHaveTitle(`${title} — Couple Journey in Varkala | Journey`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${site}/journey/${id}`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${site}/journey/${id}`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', new RegExp(title));
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${site}/images/goa.jpg`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
    expect(data['@type']).toBe('CreativeWork');
    expect(data.author).toMatchObject({ '@type': 'Person', name: 'Test Creator' });
    expect(JSON.stringify(data)).not.toMatch(/auth-token|saved|liked|creator@example|journey-media/);
    expect(await page.evaluate(() => (window as Window & { seoInjected?: boolean }).seoInjected)).toBeUndefined();
    await page.reload();
    await expect(page.locator('h1')).toHaveText(title);
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (url: string) => { (window as Window & { sharedUrl?: string }).sharedUrl = url; } }, configurable: true });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Share ↗', exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { sharedUrl?: string }).sharedUrl)).toBe(`${site}/journey/${second}`);
});

test('drafts are absent from metadata and sitemap even for their owner; public profiles stay public', async ({ page, request, context }) => {
  const published = await seed(request, 'published', 'SEO Public Fixture');
  const draft = await seed(request, 'draft', 'PRIVATE_DRAFT_TITLE', 'PRIVATE_DRAFT_NOTE');
  await page.goto(`/journey/${draft}`);
  // Next.js adds its own noindex tag to not-found responses as well.
  expect(await page.locator('meta[name="robots"]').evaluateAll(elements => elements.every(element => element.getAttribute('content')?.includes('noindex')))).toBe(true);
  await expect(page.locator('h1')).toHaveText('This path ends here.');
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: accessToken, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
  await page.goto(`/journey/${draft}`);
  await expect(page.locator('h1')).toHaveText('PRIVATE_DRAFT_TITLE');
  await expect(page).toHaveTitle('Private journey | Journey');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await page.goto('/profile/creator_a');
  await expect(page).toHaveTitle('Travel Journeys by @creator_a | Journey');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${site}/profile/creator_a`);
  expect(await page.locator('script[type="application/ld+json"]').innerText()).not.toContain('creator@example.com');
  await page.goto('/profile/creator_a?tab=drafts');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  for (const path of ['/login', '/create', '/saved', '/profile/edit']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(`${site}/journey/${published}`);
  expect(sitemap).toContain(`${site}/profile/creator_a`);
  expect(sitemap).not.toContain(draft);
  expect(sitemap).not.toMatch(/\/create|\/saved|\/login|\/api\/|PRIVATE_DRAFT|creator@example/);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain(`Sitemap: ${site}/sitemap.xml`);
  expect(robots).toContain('Disallow: /api/');
  expect(robots).not.toContain('Disallow: /journey');
  expect(robots).not.toContain('Disallow: /destination');
  const api = await request.get(`/api/journeys/${published}/actions`);
  expect(api.headers()['x-robots-tag']).toContain('noindex');
});
