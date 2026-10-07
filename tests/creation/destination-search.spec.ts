import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'creator@example.com', app_metadata: { provider: 'email' }, user_metadata: { display_name: 'Test Creator' } };
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;

// Deterministic API fixtures for interaction tests, never application data.
const places = [
  { name: 'Goa', label: 'Goa, India', type: 'region', lng: 74.05, lat: 15.32, country: 'India', bbox: [73.6, 14.85, 74.34, 15.8] },
  { name: 'Varkala', label: 'Varkala, Kerala, India', type: 'place', lng: 76.72, lat: 8.74, country: 'India', bbox: [76.6, 8.6, 76.85, 8.9] },
  { name: 'Paris', label: 'Paris, France', type: 'place', lng: 2.35, lat: 48.85, country: 'France', bbox: [2.22, 48.81, 2.47, 48.91] },
  { name: 'Tokyo', label: 'Tokyo, Japan', type: 'place', lng: 139.76, lat: 35.68, country: 'Japan', bbox: [139, 35, 140, 36] },
  { name: 'London', label: 'London, England, United Kingdom', type: 'place', lng: -0.12, lat: 51.5, country: 'United Kingdom', bbox: [-0.5, 51.2, 0.2, 51.7] },
  { name: 'New York', label: 'New York, New York, United States', type: 'place', lng: -74, lat: 40.71, country: 'United States', bbox: [-74.3, 40.4, -73.7, 40.95] },
  { name: 'Kerala', label: 'Kerala, India', type: 'region', lng: 76.57, lat: 10.2, country: 'India', bbox: [74.77, 8.21, 77.42, 12.8] },
];
function feature(place: typeof places[number], suffix = '') {
  return { id: `mapbox-${place.name}${suffix}`, geometry: { coordinates: [place.lng, place.lat] }, properties: { name: place.name, mapbox_id: `mapbox-${place.name}${suffix}`, full_address: place.label, feature_type: place.type, bbox: place.bbox, context: { country: { name: place.country }, ...(place.name === 'Varkala' ? { region: { name: 'Kerala' } } : {}) } } };
}
async function authenticate(context: BrowserContext) {
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
}
async function mockSearch(page: Page) {
  const calls: string[] = [];
  await page.route('**/search/geocode/v6/forward?**', async route => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('q')!;
    calls.push(query);
    expect(url.searchParams.has('country')).toBe(false);
    expect(url.searchParams.has('proximity')).toBe(false);
    expect(url.searchParams.get('types')).toBe('country,region,district,place,locality,neighborhood');
    expect(url.searchParams.get('permanent')).toBe('true');
    const match = places.find(place => place.name.toLowerCase() === query.toLowerCase());
    const features = match ? [feature(match)] : [];
    if (query === 'Goa') features.push(feature({ ...places[0], label: 'Goa, Philippines', country: 'Philippines', lng: 123.5, lat: 13.7, bbox: [123, 13, 124, 14] }, '-ph'));
    await route.fulfill({ json: { features } });
  });
  return calls;
}

test('worldwide suggestions, keyboard/touch selection, empty destination and preserved traveler filters', async ({ page, request, context }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const titles: string[] = [];
  for (const [slug, traveler] of [['goa', 'couple'], ['goa', 'friends'], ['varkala', 'solo'], ['munnar', 'family'], ['thenkasi', 'friends']]) {
    const coordinates = { goa: [15.49, 73.83], varkala: [8.74, 76.72], munnar: [10.09, 77.06], thenkasi: [8.967814, 77.07016] }[slug]!;
    const title = `Search fixture ${slug} ${traveler} ${testInfo.project.name}`;
    const result = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers: { Authorization: `Bearer ${token}` }, data: { payload: { id: crypto.randomUUID(), title, destination_slug: slug, traveler_type: traveler, duration_days: 2, description: '', cover_image_path: null, status: 'published', updated_at: null, stops: [{ id: crypto.randomUUID(), sequence: 1, name: slug === 'thenkasi' ? 'Thenmala' : 'Fixture stop', latitude: coordinates[0], longitude: coordinates[1], description: '', photo_path: null, rating: null, day_number: 1 }] } } });
    expect(result.ok()).toBe(true); titles.push(title);
  }
  const calls = await mockSearch(page);
  await page.goto('/');
  const input = page.getByRole('combobox');
  for (const place of places) {
    await input.fill(place.name);
    await expect(page.getByRole('option', { name: place.label, exact: true })).toBeVisible();
  }
  expect(calls).toEqual(places.map(place => place.name));
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue('Kerala');
  await input.fill('Paris');
  const paris = page.getByRole('option', { name: 'Paris, France', exact: true });
  await expect(paris).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('destination-dropdown.png') });
  const rect = await paris.boundingBox();
  const bottomNav = testInfo.project.name === 'mobile' ? await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox() : null;
  if (bottomNav) expect(rect!.y + rect!.height).toBeLessThan(bottomNav.y);
  if (testInfo.project.name === 'mobile') await paris.tap(); else await paris.click();
  await expect(page).toHaveURL(/\/explore\?destination=Paris/);
  const selected = new URL(page.url());
  expect(selected.searchParams.get('mapbox')).toBe('mapbox-Paris');
  expect(selected.searchParams.get('lat')).toBe('48.85');
  expect(selected.searchParams.get('lng')).toBe('2.35');
  await expect(page.getByText('No journeys here yet.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('journey-card')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Login / Profile', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('No journeys here yet.', { exact: true })).toBeVisible();
  await input.fill('Goa');
  await expect(page.getByRole('option', { name: 'Goa, India', exact: true })).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page).toHaveURL(/destination=Goa/);
  await expect(page.getByRole('link', { name: `Open journey: ${titles[0]}` })).toBeVisible();
  const before = new URL(page.url());
  await page.getByRole('navigation', { name: 'Traveler type filters' }).getByRole('link', { name: 'Couple', exact: true }).click();
  await expect(page).toHaveURL(/traveler=couple/);
  const after = new URL(page.url());
  for (const key of ['destination', 'mapbox', 'lat', 'lng', 'bbox', 'country']) expect(after.searchParams.get(key)).toBe(before.searchParams.get(key));
  expect(after.searchParams.get('traveler')).toBe('couple');
  for (const card of await page.getByTestId('journey-card').all()) await expect(card).toHaveAttribute('data-traveler', 'couple');
  await page.getByRole('navigation', { name: 'Traveler type filters' }).getByRole('link', { name: 'All', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Traveler type filters' }).getByRole('link', { name: 'All', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(new URL(page.url()).searchParams.has('traveler')).toBe(false);
  await input.click(); await input.fill('Goa');
  await page.getByRole('option', { name: 'Goa, Philippines', exact: true }).click();
  await expect(page.getByTestId('journey-card')).toHaveCount(0);
  await input.fill('Kerala');
  await page.getByRole('option', { name: 'Kerala, India', exact: true }).click();
  await expect(page.getByRole('link', { name: `Open journey: ${titles[2]}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Open journey: ${titles[3]}` })).toBeVisible();
  // A Thenkasi journey with a real Kerala stop now belongs in this view.
  await expect(page.getByRole('link', { name: `Open journey: ${titles[4]}` })).toBeVisible();
  await authenticate(context);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Your profile' })).toContainText('Test Creator');
  await input.fill('Tokyo');
  await page.getByRole('option', { name: 'Tokyo, Japan', exact: true }).click();
  await expect(page).toHaveURL(/destination=Tokyo/);
  await expect(page.getByTestId('journey-card')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('search debounces, closes outside, recovers from failures, and ignores stale responses', async ({ page }) => {
  await page.goto('/');
  let calls = 0;
  let fail = true;
  await page.route('**/search/geocode/v6/forward?**', async route => { calls++; await route.fulfill(fail ? { status: 503, json: { message: 'Unavailable' } } : { json: { features: [feature(places[3])] } }); });
  const input = page.getByRole('combobox', { name: 'Search destinations' });
  await input.fill('To'); await input.fill('Tok'); await input.fill('Tokyo');
  await expect(page.locator('main').getByRole('alert')).toHaveText('Destination search is unavailable. Please try again in a moment.');
  expect(calls).toBe(1);
  fail = false;
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Tokyo, Japan', exact: true })).toBeVisible();
  expect(calls).toBe(2);
  await page.getByRole('heading', { level: 1 }).click();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await page.unroute('**/search/geocode/v6/forward?**');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/search/geocode/v6/forward?**', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'Goa') { await gate; try { await route.fulfill({ json: { features: [feature(places[0])] } }); } catch { /* Request was intentionally aborted. */ } finally { finish(); } }
    else await route.fulfill({ json: { features: q === 'Paris' ? [feature(places[2])] : [] } });
  });
  const pending = page.waitForRequest(request => new URL(request.url()).searchParams.get('q') === 'Goa');
  await input.fill('Goa'); await pending;
  await input.fill('Paris');
  await expect(page.getByRole('option', { name: 'Paris, France' })).toBeVisible();
  release(); await finished;
  await expect(page.getByRole('option', { name: 'Goa, India' })).toHaveCount(0);
  await input.fill('zz-no-destination');
  await expect(page.getByRole('status')).toContainText('No destinations found');
  await page.goto('/explore?destination=Paris&lat=NaN');
  await expect(page.locator('main').getByRole('alert')).toContainText('That destination link is incomplete');
  await expect(page.getByTestId('journey-card')).toHaveCount(0);
});

test('live Mapbox returns worldwide destinations with the configured token', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Search destinations' });
  await input.focus();
  test.skip(await page.getByText('Destination search is not connected yet.', { exact: false }).count() > 0, 'No Mapbox token configured for this environment.');
  for (const query of ['Goa', 'Varkala', 'Paris', 'Tokyo', 'London', 'New York', 'Kerala']) {
    await input.fill(query);
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('option').first()).toContainText(new RegExp(query, 'i'));
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  }
});
