import { test, expect } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })}.test-signature`;
const stops = [
  { name: 'Nedumangad', latitude: 8.603315, longitude: 77.00279 },
  { name: 'Palode', latitude: 8.723348, longitude: 77.02781 },
  { name: 'Thenmala', latitude: 8.967814, longitude: 77.07016 },
  { name: 'Thenkasi', latitude: 8.955386, longitude: 77.308655 },
  { name: 'Sundarapandiapuram', latitude: 8.97222, longitude: 77.39017 },
];

test('destination OR stop discovery, distinct journey groups, bounded previews and draft privacy', async ({ page, request }, info) => {
  test.setTimeout(90000);
  const titles = Array.from({ length: 5 }, (_, i) => `Stop-aware ${info.project.name} ${i}`);
  const created: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const metadataRequests: string[] = [];
  page.on('request', r => { if (r.url().includes('/search/geocode/')) metadataRequests.push(r.url()); });
  for (const [index, title] of [...titles, `Private ${info.project.name}`].entries()) {
    const id = crypto.randomUUID(); created.push(id);
    const response = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers: { Authorization: `Bearer ${token}` }, data: { payload: { id, title, destination_slug: 'thenkasi', traveler_type: index % 2 ? 'friends' : 'couple', duration_days: 3, cover_image_path: null, status: index === 5 ? 'draft' : 'published', stops: [...stops, stops[2], { name: 'No coordinates', latitude: null, longitude: null }].map((stop, i) => ({ ...stop, id: crypto.randomUUID(), sequence: i + 1, mapbox_place_id: `fixture-${stop.name}` })) } } });
    expect(response.ok()).toBe(true);
  }
  await page.route('**/search/geocode/v6/forward?**', async route => {
    const name = new URL(route.request().url()).searchParams.get('q');
    const stop = stops.find(stop => stop.name === name)!;
    await route.fulfill({ json: { features: [{ id: `fixture-${stop.name}`, geometry: { coordinates: [stop.longitude, stop.latitude] }, properties: { name: stop.name, full_address: `${stop.name}, India`, feature_type: 'place', bbox: [stop.longitude - 0.005, stop.latitude - 0.005, stop.longitude + 0.005, stop.latitude + 0.005] } }] } });
  });
  await page.goto('/explore');
  for (const name of ['Thenkasi', 'Thenmala', 'Sundarapandiapuram']) {
    await page.getByRole('combobox').fill(name);
    await page.getByRole('option', { name: `${name}, India`, exact: true }).click();
    for (const title of titles) await expect(page.getByRole('link', { name: `Open journey: ${title}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Open journey: Private ${info.project.name}` })).toHaveCount(0);
    await expect(page.getByTestId('explore-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    if (name === 'Thenmala') {
      const marker = page.getByRole('button', { name: /Preview \d+ journeys in Thenmala/ });
      await expect(marker).toHaveCount(1);
      await expect(marker).toHaveAttribute('data-longitude', '77.07016');
      await expect(marker).toHaveAttribute('data-latitude', '8.967814');
      expect(Number((await marker.getAttribute('aria-label'))!.match(/Preview (\d+)/)![1])).toBe(await page.getByTestId('journey-card').count());
      const mapped = await page.locator('.mapboxgl-marker[data-longitude]').evaluateAll(markers => markers.map(marker => [Number((marker as HTMLElement).dataset.longitude), Number((marker as HTMLElement).dataset.latitude)]));
      for (const stop of stops) expect(mapped).toContainEqual([stop.longitude, stop.latitude]);
      await expect(page.getByRole('button', { name: /in No coordinates/ })).toHaveCount(0);
      if (info.project.name === 'mobile') await marker.tap(); else await marker.click();
      const preview = page.locator('#explore-marker-preview');
      await expect(preview).toBeFocused();
      await expect(preview.locator('article')).toHaveCount(3);
      await expect(preview.getByRole('link', { name: 'View all journeys below' })).toBeVisible();
      await page.screenshot({ path: info.outputPath('thenmala-group.png') });
      const detail = preview.getByRole('link', { name: /^View Journey/ }).first();
      await detail.scrollIntoViewIfNeeded();
      if (info.project.name === 'mobile') {
        const rect = await detail.boundingBox(); const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox();
        expect(rect!.y + rect!.height).toBeLessThan(nav!.y);
      }
      const href = await detail.getAttribute('href');
      await detail.click(); await expect(page).toHaveURL(new RegExp(href!));
      await page.goBack();
      await page.getByRole('button', { name: /Preview \d+ journeys in Thenmala/ }).click();
      await preview.getByRole('link', { name: 'View all journeys below' }).click();
      await expect(page.locator('#published-journeys')).toBeFocused();
      await expect(page.getByTestId('journey-card').filter({ hasText: titles[0] })).toContainText('Includes Thenmala');
    }
  }
  await page.getByRole('navigation', { name: 'Traveler type filters' }).getByRole('link', { name: 'Friends', exact: true }).click();
  for (const card of await page.getByTestId('journey-card').all()) await expect(card).toHaveAttribute('data-traveler', 'friends');
  await page.reload(); await expect(page.getByRole('link', { name: `Open journey: ${titles[1]}` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(metadataRequests).toHaveLength(3);
  expect(errors).toEqual([]);
  for (const id of created) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers: { Authorization: `Bearer ${token}` } });
});

test('stop searches can find a published journey older than the destination RPC limit', async ({ page, request }, info) => {
  test.setTimeout(90000);
  const created: string[] = [];
  const title = `Older stop journey ${info.project.name}`;
  try {
    for (let index = 0; index <= 100; index++) {
      const id = crypto.randomUUID(); created.push(id);
      const stop = index ? { name: 'Goa stop', latitude: 15.49, longitude: 73.83 } : stops[2];
      const response = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers: { Authorization: `Bearer ${token}` }, data: { payload: { id, title: index ? `Newer fixture ${index}` : title, destination_slug: 'goa', traveler_type: 'family', duration_days: 1, status: 'published', cover_image_path: null, stops: [{ ...stop, id: crypto.randomUUID(), sequence: 1 }] } } });
      expect(response.ok()).toBe(true);
    }
    await page.goto('/explore?destination=Thenmala&label=Thenmala%2CKerala&mapbox=older-thenmala&lat=8.967814&lng=77.07016&type=place&bbox=77.06,8.96,77.08,8.98&traveler=family');
    await expect(page.getByRole('link', { name: `Open journey: ${title}` })).toBeVisible();
    await expect(page.getByTestId('journey-card').filter({ hasText: title })).toContainText('Includes Thenmala');
  } finally {
    for (const id of created) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers: { Authorization: `Bearer ${token}` } });
  }
});
