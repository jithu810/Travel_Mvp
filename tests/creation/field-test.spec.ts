import { test, expect, type BrowserContext } from '@playwright/test';
import { mockGeolocation, emitLocation, gpsCounts } from '../fixtures/geolocation';
import { mockNavigationMap } from '../fixtures/navigation-map';
import { directionsResponse } from '../fixtures/directions';
import { selectEditorDestination } from '../fixtures/editor-destination';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const headers = { Authorization: `Bearer ${token}` };
const sizes = [[360,800],[390,844],[412,915],[844,390],[1280,900],[1440,1000]];
const streets = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e7eedf' } }] };
async function authenticate(context: BrowserContext) {
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'creator@example.com', app_metadata: { provider: 'email' }, user_metadata: {} };
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
}

test('map overlays, expand/collapse, mode changes and arrival retain a single watcher and private history', async ({ page, request }, info) => {
  test.setTimeout(120000);
  const id = crypto.randomUUID(), profiles: string[] = [];
  let release: (() => void) | undefined, hold = false, failWalk = false;
  await mockGeolocation(page); await mockNavigationMap(page);
  await page.route('**/styles/v1/mapbox/streets-v12*', route => route.fulfill({ json: streets }));
  await page.route('https://api.mapbox.com/directions/v5/**', async route => {
    profiles.push(new URL(route.request().url()).pathname);
    if (hold) await new Promise<void>(resolve => { release = resolve; });
    if (failWalk && route.request().url().includes('/walking')) { await route.fulfill({ json: { code: 'NoRoute' } }); return; }
    const pairs = new URLSearchParams(route.request().postData()!).get('coordinates')!.split(';').map(p => p.split(',').map(Number));
    await route.fulfill({ json: directionsResponse(pairs[0], pairs[1]) });
  });
  expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: { id, title: 'Field test map', destination_slug: 'thenkasi', traveler_type: 'solo', duration_days: 1, status: 'published', stops: [{ id: crypto.randomUUID(), sequence: 1, name: 'First destination', latitude: 8.603315, longitude: 77.00279 }, { id: crypto.randomUUID(), sequence: 2, name: 'Next destination', latitude: 8.723348, longitude: 77.02781 }] } } })).ok()).toBe(true);
  try {
    await page.goto(`/journey/${id}`);
    await expect(page.getByLabel('Journey controls')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start Journey' })).toBeVisible();
    for (const [width,height] of sizes) {
      await page.setViewportSize({ width,height }); await page.evaluate(() => window.scrollTo(0,0));
      const controls = (await page.getByLabel('Journey controls').boundingBox())!, start = (await page.getByRole('link', { name: 'Start Journey' }).boundingBox())!;
      expect(start.y - controls.y).toBeLessThan(90); expect(start.y).toBeGreaterThanOrEqual(0); expect(start.y + start.height).toBeLessThan(height);
    }
    await page.getByRole('link', { name: 'Start Journey' }).click();
    expect((await gpsCounts(page)).watches).toBe(0);
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await emitLocation(page, 8.613271839, 77.012719183);
    await expect(page.getByTestId('road-distance')).toHaveText('2.4 km');
    await page.waitForTimeout(1000); await emitLocation(page, 8.613371839, 77.012719183);
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-track', 'recorded');
    await page.getByRole('button', { name: 'Walking', exact: false }).click();
    await expect(page.getByRole('button', { name: 'Walking', exact: false })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active');
    expect(profiles.at(-1)).toContain('/walking'); await expect(page.getByTestId('road-navigation')).toContainText('Estimated walk');
    expect((await gpsCounts(page)).watches).toBe(1);
    await page.getByRole('button', { name: 'Driving', exact: false }).click();
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active'); expect(profiles.at(-1)).toContain('/driving');
    hold = true;
    await emitLocation(page, 8.603315, 77.00279);
    await expect(page.getByTestId('navigation-next-stop')).toHaveText('Next destination');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'none');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-track', 'recorded');
    await expect.poll(() => !!release).toBe(true); hold = false; release!();
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'road-route');
    for (const [width,height] of sizes) {
      await page.setViewportSize({ width,height });
      const frame = page.getByTestId('travel-map-frame'); await frame.scrollIntoViewIfNeeded();
      for (const expanded of [false,true]) {
        if (expanded) await page.getByRole('button', { name: 'Expand map' }).click();
        await expect(frame).toHaveAttribute('data-expanded', String(expanded));
        const map = (await frame.boundingBox())!, hud = (await page.getByTestId('road-navigation').boundingBox())!, controls = (await page.getByRole('region', { name: 'Travel controls', exact: true }).boundingBox())!;
        expect(map.height).toBeGreaterThan(height * .65); expect(hud.y).toBeGreaterThanOrEqual(map.y); expect(controls.y + controls.height).toBeLessThanOrEqual(map.y + map.height);
        if (expanded) { expect(map.y).toBe(0); expect(map.height).toBe(height); expect(controls.y + controls.height).toBeLessThan(height); }
        const follow = (await page.getByRole('button', { name: 'Center on me' }).boundingBox())!;
        expect(follow.x).toBeGreaterThanOrEqual(hud.x + hud.width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`map-${width}-${expanded ? 'expanded' : 'normal'}.png`) });
        if (expanded) { await page.getByRole('button', { name: 'Collapse map' }).click(); await expect(frame).toHaveAttribute('data-expanded', 'false'); }
      }
    }
    await page.getByRole('button', { name: /Show progress/ }).click();
    await expect(page.getByRole('region', { name: 'Map stop progress' })).toContainText('✓ Completed · First destination');
    await expect(page.getByRole('region', { name: 'Map stop progress' })).toContainText('→ Current · Next destination');
    await page.getByRole('button', { name: /Hide progress/ }).click();
    failWalk = true; await page.getByRole('button', { name: /Walking/ }).click();
    await expect(page.getByTestId('road-navigation')).toContainText('No walking route found');
    await expect(page.getByRole('button', { name: /Walking/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'none');
    await page.getByRole('button', { name: 'Expand map' }).click();
    await page.getByRole('button', { name: 'End Journey', exact: true }).click(); await page.getByRole('button', { name: 'Keep Traveling' }).click();
    await page.keyboard.press('Escape'); await expect(page.getByTestId('travel-map-frame')).toHaveAttribute('data-expanded', 'false');
    await page.getByRole('button', { name: 'Pause Journey' }).click(); expect((await gpsCounts(page)).active).toBe(0);
  } finally { release?.(); await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});

test('one-time GPS, exact map pin, editable name/location and worldwide destination survive draft and publish', async ({ page, context }, info) => {
  test.setTimeout(120000); await authenticate(context);
  let savedId: string | null = null;
  await page.route('**/styles/v1/mapbox/streets-v12*', route => route.fulfill({ json: streets }));
  await page.route('https://events.mapbox.com/**', route => route.fulfill({ status: 204 }));
  await page.addInitScript(() => {
    const state = { captures: 0, watches: 0, denied: false };
    (window as unknown as { creationGps: typeof state }).creationGps = state;
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition(success: PositionCallback, failure: PositionErrorCallback) { state.captures++; if (state.denied) failure({ code: 1 } as GeolocationPositionError); else success({ coords: { latitude: 48.85661, longitude: 2.35221, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition); },
      watchPosition() { state.watches++; throw new Error('Create must never watch GPS'); },
    } });
  });
  try {
  await page.goto('/create');
  expect(await page.evaluate(() => (window as unknown as { creationGps: { captures: number } }).creationGps.captures)).toBe(0);
  await page.getByLabel('Journey title', { exact: true }).fill(`Paris field test ${info.project.name}`);
  await selectEditorDestination(page, 'varkala');
  await page.route(url => url.pathname.endsWith('/search/geocode/v6/forward') && !!url.searchParams.get('types'), route => route.fulfill({ json: { features: [{ id: 'paris-france', geometry: { coordinates: [2.3522,48.8566] }, properties: { name: 'Paris', full_address: 'Paris, France', feature_type: 'place' } }] } }));
  await page.getByRole('combobox', { name: 'Destination', exact: true }).fill('Paris'); await page.getByRole('option', { name: 'Paris, France' }).click();
  await page.getByRole('button', { name: /Family/ }).click(); await expect(page.getByRole('button', { name: /Family/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Use my current location/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose stop location' });
  await expect(dialog.getByLabel('Stop name')).toHaveValue(''); await expect(dialog.getByLabel('Pin latitude')).toHaveValue('48.85661');
  await dialog.getByRole('button', { name: 'Save stop location' }).click(); await expect(dialog.getByRole('alert')).toContainText('Enter a stop name');
  await dialog.getByLabel('Stop name').fill('Our hotel');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  for (const [width,height] of sizes) {
    await page.setViewportSize({ width,height });
    const box = (await dialog.boundingBox())!; expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`pin-${width}.png`) });
  }
  await dialog.getByRole('button', { name: 'Save stop location' }).click();
  await page.getByRole('button', { name: '🗺️ Pick on map', exact: true }).click();
  await dialog.getByLabel('Stop name').fill('Exact viewpoint');
  await expect(dialog.locator('.mapboxgl-canvas')).toBeVisible();
  await dialog.getByTestId('stop-pin-map').click({ position: { x: 80, y: 80 } });
  const latitude = await dialog.getByLabel('Pin latitude').inputValue(), longitude = await dialog.getByLabel('Pin longitude').inputValue();
  await dialog.getByRole('button', { name: 'Save stop location' }).click();
  await expect(page.getByTestId('editor-stop')).toHaveCount(2);
  const first = page.getByTestId('editor-stop').first(); await first.getByRole('button', { name: 'Edit location / Pick on map' }).click();
  await dialog.getByLabel('Pin latitude').fill('48.857'); await dialog.getByLabel('Pin longitude').fill('2.353'); await dialog.getByLabel('Stop name').fill('Hotel entrance'); await dialog.getByRole('button', { name: 'Save stop location' }).click();
  await first.getByLabel('Stop name').fill('Our hotel entrance');
  await page.getByRole('button', { name: 'Move Exact viewpoint up' }).click();
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  savedId = new URL(page.url()).searchParams.get('draft');
  await page.reload(); await expect(page.getByText('Selected destination: Paris', { exact: false })).toBeVisible();
  await expect(page.getByTestId('editor-stop').getByRole('heading')).toHaveText(['1. Exact viewpoint','2. Our hotel entrance']);
  await page.getByTestId('editor-stop').first().getByRole('button', { name: 'Edit location / Pick on map' }).click();
  await expect(dialog.getByLabel('Pin latitude')).toHaveValue(latitude); await expect(dialog.getByLabel('Pin longitude')).toHaveValue(longitude); await page.keyboard.press('Escape');
  for (const [width,height] of sizes) { await page.setViewportSize({ width,height }); await page.getByRole('combobox', { name: 'Destination', exact: true }).scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`create-${width}.png`) }); }
  await page.evaluate(() => { (window as unknown as { creationGps: { denied: boolean } }).creationGps.denied = true; });
  await page.getByRole('button', { name: /Use my current location/ }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Location permission denied' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { creationGps: { watches: number } }).creationGps.watches)).toBe(0);
  await page.getByRole('button', { name: 'Publish Journey', exact: true }).click(); await expect(page.getByText('Journey published', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View Journey', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Paris field test ${info.project.name}`);
  } finally { if (savedId) await page.request.delete(`/api/journeys/${savedId}`, { headers: { Origin: 'http://localhost:3200' } }); }
});

test('live Standard map remains usable in normal and expanded layouts at every field-test viewport', async ({ page, request }, info) => {
  test.setTimeout(120000);
  const id = crypto.randomUUID(); await mockGeolocation(page);
  await page.route('https://events.mapbox.com/**', route => route.fulfill({ status: 204 }));
  await page.route('https://api.mapbox.com/directions/v5/**', route => route.fulfill({ json: directionsResponse() }));
  expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: { id, title: 'Live map viewport QA', destination_slug: 'thenkasi', traveler_type: 'couple', duration_days: 1, status: 'published', stops: [{ id: crypto.randomUUID(), sequence: 1, name: 'Nedumangad', latitude: 8.603315, longitude: 77.00279 }, { id: crypto.randomUUID(), sequence: 2, name: 'Palode', latitude: 8.723348, longitude: 77.02781 }] } } })).ok()).toBe(true);
  try {
    await page.goto(`/travel/${id}`);
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click(); await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await emitLocation(page, 8.613271839, 77.012719183); await expect(page.getByTestId('road-distance')).toHaveText('2.4 km');
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    for (const [width,height] of sizes) {
      await page.setViewportSize({ width,height }); await page.getByTestId('travel-map-frame').scrollIntoViewIfNeeded();
      await emitLocation(page, 8.613271839, 77.012719183);
      for (const expanded of [false,true]) {
        if (expanded) await page.getByRole('button', { name: 'Expand map' }).click();
        await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready');
        await page.waitForTimeout(500);
        const instruction = page.getByTestId('next-maneuver'); await expect(instruction).toContainText('Turn left');
        expect(await page.getByRole('button', { name: 'Pause Journey' }).evaluate(button => { const r = button.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button') === button; })).toBe(true);
        await page.screenshot({ path: info.outputPath(`live-${width}-${expanded ? 'expanded' : 'normal'}.png`) });
        if (expanded) { await page.keyboard.press('Tab'); expect(await page.getByTestId('travel-map-frame').evaluate(frame => frame.contains(document.activeElement))).toBe(true); await page.getByRole('button', { name: 'Collapse map' }).click(); }
      }
    }
  } finally { await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});
