import { test, expect } from '@playwright/test';
import { mockGeolocation, emitLocation, gpsCounts, type GpsMock } from '../fixtures/geolocation';
import { mockDirections } from '../fixtures/directions';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const headers = { Authorization: `Bearer ${token}` };
const names = ['Nedumangad', 'Palode', 'Thenmala', 'Thenkasi', 'Sundarapandiapuram'];
const points = [[8.603315, 77.00279], [8.723348, 77.02781], [8.967814, 77.07016], [8.955386, 77.308655], [8.97222, 77.39017]];

test('GPS five-stop journey lifecycle, ordered arrivals, fresh refresh and map privacy', async ({ page, request }, info) => {
  test.setTimeout(120000);
  const id = crypto.randomUUID();
  const errors: string[] = [], consoleErrors: string[] = [], outbound: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', request => outbound.push(request.url() + (request.postData() || '')));
  await mockGeolocation(page);
  await mockDirections(page);
  // Keep GPS tests deterministic while exercising the real Mapbox renderer/markers/line.
  // The separately performed live visual QA uses the configured real basemap.
  await page.route('**/styles/v1/mapbox/streets-v12*', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e7eedf' } }] } }));
  await page.route('https://events.mapbox.com/**', route => route.fulfill({ status: 204 }));
  try {
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: {
      id, title: `Real GPS journey ${info.project.name}`, destination_slug: 'thenkasi', traveler_type: 'couple', duration_days: 1, status: 'published', cover_image_path: null,
      stops: names.map((name, i) => ({ id: crypto.randomUUID(), name, sequence: i + 1, latitude: points[i][0], longitude: points[i][1], description: `${name} existing stop`, day_number: 1, photo_path: null })),
    } } })).ok()).toBe(true);
    await page.setViewportSize({ width: info.project.name === 'mobile' ? 360 : 1440, height: info.project.name === 'mobile' ? 800 : 1000 });
    await page.goto('/explore');
    expect((await gpsCounts(page)).watches).toBe(0);
    await page.goto(`/journey/${id}`);
    expect((await gpsCounts(page)).watches).toBe(0);
    await page.getByRole('link', { name: 'Use This Journey', exact: true }).click();
    await page.getByRole('link', { name: 'Preview Travel Mode' }).click();
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'NOT_REQUESTED');
    expect((await gpsCounts(page)).watches).toBe(0);
    await expect(page.getByText('Journey Creator uses your location', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'REQUESTING');
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    // Private position may go only to the routing provider's POST body, never app APIs/URLs.
    const privatePoint = [8.613271839, 77.012719183];
    await emitLocation(page, privatePoint[0], privatePoint[1]);
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'AVAILABLE');
    await expect(page.getByTestId('current-location-marker')).toHaveCount(1);
    await expect(page.getByTestId('next-stop-distance')).toContainText('Straight-line geographic distance');
    const oldDistance = await page.getByTestId('next-stop-distance').textContent();
    const oldMarker = await page.getByTestId('current-location-marker').getAttribute('style');
    const plannedMarker = await page.getByTestId('route-marker').first().getAttribute('style');
    await emitLocation(page, 8.608, 77.008);
    await expect.poll(() => page.getByTestId('current-location-marker').getAttribute('style')).not.toBe(oldMarker);
    await expect.poll(() => page.getByTestId('next-stop-distance').textContent()).not.toBe(oldDistance);
    expect(await page.getByTestId('route-marker').first().getAttribute('style')).toBe(plannedMarker);
    await expect(page.getByTestId('travel-progress')).toHaveText('0 / 5 stops · 0%');
    await page.getByRole('button', { name: 'Center on me' }).click();
    await expect(page.locator('.mapboxgl-improve-map')).toHaveCount(0);
    await emitLocation(page, ...points[3] as [number, number]);
    await expect(page.getByTestId('travel-progress')).toHaveText('0 / 5 stops · 0%');
    await emitLocation(page, ...points[0] as [number, number], 200);
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'INACCURATE');
    await expect(page.getByTestId('travel-progress')).toHaveText('0 / 5 stops · 0%');
    await emitLocation(page, ...points[0] as [number, number], 10, 20000);
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'STALE');
    await expect(page.getByTestId('current-location-marker')).toHaveCount(0);
    await emitLocation(page, ...points[0] as [number, number]);
    await expect(page.getByTestId('travel-progress')).toHaveText('1 / 5 stops · 20%');
    await expect(page.getByRole('region', { name: 'Current stop', exact: true })).toContainText('Palode');
    await page.getByRole('button', { name: 'Pause Journey', exact: true }).click();
    expect((await gpsCounts(page)).active).toBe(0);
    await page.evaluate(() => (window as unknown as { gpsMock: GpsMock }).gpsMock.late());
    await expect(page.getByTestId('travel-progress')).toHaveText('1 / 5 stops · 20%');
    await expect(page.getByTestId('current-location-marker')).toHaveCount(0);
    await page.getByRole('button', { name: 'Resume Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await expect(page.getByTestId('next-stop-distance')).toHaveCount(0);
    await emitLocation(page, ...points[1] as [number, number]);
    await expect(page.getByTestId('travel-progress')).toHaveText('2 / 5 stops · 40%');
    await page.reload();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'ACTIVE');
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'REQUESTING');
    await expect(page.getByTestId('current-location-marker')).toHaveCount(0);
    await expect(page.getByTestId('next-stop-distance')).toHaveCount(0);
    await emitLocation(page, ...points[2] as [number, number]);
    await expect(page.getByTestId('travel-progress')).toHaveText('3 / 5 stops · 60%');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await page.getByRole('button', { name: 'Pause Journey', exact: true }).scrollIntoViewIfNeeded();
    const controls = (await page.getByRole('region', { name: 'Travel controls' }).boundingBox())!;
    const map = (await page.getByTestId('journey-map').boundingBox())!;
    expect(controls.y).toBeGreaterThanOrEqual(map.y + map.height);
    if (info.project.name === 'mobile') {
      const nav = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!;
      expect(controls.y + controls.height).toBeLessThan(nav.y);
      await page.screenshot({ path: info.outputPath('gps-360.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('gps-active.png'), fullPage: true });
    await emitLocation(page, ...points[3] as [number, number]);
    await emitLocation(page, ...points[4] as [number, number]);
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'COMPLETED');
    expect((await gpsCounts(page)).active).toBe(0);
    await expect(page.getByTestId('current-location-marker')).toHaveCount(0);
    const stored = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), `journeycreator:travel:v1:${id}`);
    expect(Object.keys(stored).sort()).toEqual(['completedIds', 'journeyId', 'status', 'stopIds', 'updatedAt', 'version']);
    await page.getByRole('button', { name: 'Reset journey', exact: true }).click();
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await page.getByRole('button', { name: 'End Journey', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm End', exact: true }).click();
    expect((await gpsCounts(page)).active).toBe(0);
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'CANCELLED');
    await page.getByRole('button', { name: 'Reset journey', exact: true }).click();
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await page.getByRole('link', { name: 'Back to Journey', exact: false }).click();
    await expect(page).toHaveURL(`/journey/${id}`);
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(0);
    const nonRouting = outbound.filter(text => !text.startsWith('https://api.mapbox.com/directions/v5/mapbox/driving?'));
    expect(nonRouting.some(text => /navigation\/|optimization\//.test(text))).toBe(false);
    expect(nonRouting.some(text => privatePoint.some(coordinate => text.includes(String(coordinate))))).toBe(false);
    expect(errors).toEqual([]); expect(consoleErrors).toEqual([]);
  } finally { await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});

test('expired current location disappears even without a new reading and map failure does not block progress', async ({ page }) => {
  await mockGeolocation(page, 'granted');
  await mockDirections(page);
  await page.clock.install();
  await page.route('**/styles/v1/**', route => route.abort());
  await page.goto('/travel/demo-goa-couple');
  await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
  await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
  await emitLocation(page, 8.6, 77.0);
  await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'AVAILABLE');
  await expect(page.getByTestId('next-stop-distance')).toBeVisible();
  await page.clock.fastForward(16001);
  await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'STALE');
  await expect(page.getByTestId('next-stop-distance')).toHaveCount(0);
  await expect(page.getByText('Route overview · Geographic map unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
  await expect(page.getByTestId('travel-progress')).toHaveText('1 / 4 stops · 25%');
});

test('denied permission is not repeatedly requested and manual fallback remains complete', async ({ page }) => {
  await mockGeolocation(page);
  await page.goto('/travel/demo-goa-couple');
  await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
  await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
  await page.evaluate(() => { const mock = (window as unknown as { gpsMock: GpsMock }).gpsMock; mock.permission = 'denied'; mock.fail(1); });
  await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'DENIED');
  expect((await gpsCounts(page)).active).toBe(0);
  await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
  await page.getByRole('button', { name: 'Pause Journey' }).click();
  await page.getByRole('button', { name: 'Resume Journey' }).click();
  await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'DENIED');
  await page.getByRole('button', { name: 'Check location permission' }).click();
  await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'DENIED');
  expect((await gpsCounts(page)).watches).toBe(1);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
  await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'COMPLETED');
});

test('GPS errors, insecure context and missing-coordinate stops degrade safely', async ({ page, request }) => {
  const id = crypto.randomUUID();
  await mockGeolocation(page, 'granted');
  await mockDirections(page);
  try {
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: {
      id, title: 'Missing GPS coordinates', destination_slug: 'goa', traveler_type: 'solo', duration_days: 1, status: 'published', cover_image_path: null,
      stops: [{ id: crypto.randomUUID(), name: 'Stop without coordinates', sequence: 1, latitude: null, longitude: null }, { id: crypto.randomUUID(), name: 'GPS stop', sequence: 2, latitude: 8.6, longitude: 77.0 }],
    } } })).ok()).toBe(true);
    await page.goto(`/travel/${id}`);
    await expect(page.getByText('GPS arrival detection unavailable for this stop.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await emitLocation(page, 8.6, 77.0);
    await expect(page.getByTestId('travel-progress')).toHaveText('0 / 2 stops · 0%');
    await page.evaluate(() => (window as unknown as { gpsMock: GpsMock }).gpsMock.fail(2));
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'UNAVAILABLE');
    await page.evaluate(() => (window as unknown as { gpsMock: GpsMock }).gpsMock.fail(3));
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'TIMEOUT');
    await emitLocation(page, 999, 0);
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'INVALID');
    await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await emitLocation(page, 8.6, 77.0);
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'COMPLETED');
    await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false }));
    await page.goto('/travel/demo-goa-couple');
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status', 'INSECURE');
    expect((await gpsCounts(page)).watches).toBe(0);
    await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await expect(page.getByTestId('travel-progress')).toHaveText('1 / 4 stops · 25%');
  } finally { await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});
