import { test, expect } from '@playwright/test';
const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const headers = { Authorization: `Bearer ${token}` };

test('snapshot is public, compact and preserves Story actions at six viewports', async ({ page, request }, info) => {
  test.setTimeout(180000);
  const id = crypto.randomUUID(), draft = crypto.randomUUID();
  const payload = { id, title: 'Coastal'.repeat(25), destination_slug: 'goa', traveler_type: 'couple', duration_days: 5, status: 'published', stops: Array.from({ length: 6 }, (_, i) => ({ id: crypto.randomUUID(), name: `Coast ${i + 1}`, sequence: i + 1, latitude: 15.49, longitude: 73.83 + i / 100, description: 'A quiet afternoon by the sea.', photo_path: '/images/goa.jpg', rating: 4, day_number: i < 3 ? 1 : 5 })) };
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { navigator.geolocation.watchPosition = () => { throw new Error('Story GPS requested'); }; navigator.geolocation.getCurrentPosition = () => { throw new Error('Story GPS requested'); }; });
  try {
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload } })).ok()).toBe(true);
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: { ...payload, id: draft, title: 'Private snapshot secret', status: 'draft', stops: payload.stops.map(s => ({ ...s, id: crypto.randomUUID() })) } } })).ok()).toBe(true);
    for (const [width, height] of [[360,800],[390,844],[412,915],[844,390],[1280,900],[1440,1000]]) {
      await page.setViewportSize({ width, height }); await page.goto(`/journey/${id}`);
      const snapshot = page.getByRole('region', { name: 'Journey snapshot' });
      await expect(snapshot).toContainText('6 stops · 2 active days · Balanced pace');
      await expect(snapshot).toContainText('About 3 stops/day');
      await expect(snapshot).toContainText('Compact journey · Photo-rich · Detailed stops');
      await expect(snapshot).toContainText('straight line');
      await expect(page.getByTestId('journey-stop')).toHaveCount(6);
      await expect(page.getByTestId('story-day')).toHaveText(['Day 1', 'Day 5']);
      await expect(page.getByRole('link', { name: 'Start Journey', exact: false })).toHaveAttribute('href', `/travel/${id}`);
      await expect(page.getByRole('link', { name: 'Use This Journey', exact: true })).toHaveAttribute('href', '#journey-route');
      await expect(page.getByRole('button', { name: 'Remix This Journey', exact: true })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await snapshot.scrollIntoViewIfNeeded(); await snapshot.screenshot({ path: info.outputPath(`snapshot-${width}.png`) });
      expect((await snapshot.boundingBox())!.height).toBeLessThan(240);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://journey.example/journey/${id}`);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Coastal/);
    }
    const html = await (await request.get(`/journey/${id}`)).text();
    expect(html).toContain('Journey snapshot'); expect(html).not.toContain('Private snapshot secret');
    await page.goto(`/journey/${draft}`); await expect(page.getByRole('region', { name: 'Journey snapshot' })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    for (const target of [id, draft]) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${target}`, { headers });
  }
});
