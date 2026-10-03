import { test, expect } from '@playwright/test';
import { mockGeolocation, emitLocation, gpsCounts, type GpsMock } from '../fixtures/geolocation';
import { mockDirections, directionsResponse } from '../fixtures/directions';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const headers = { Authorization: `Bearer ${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature` };
const names = ['Nedumangad', 'Palode', 'Thenmala', 'Thenkasi', 'Sundarapandiapuram'];
const points = [[8.603315, 77.00279], [8.723348, 77.02781], [8.967814, 77.07016], [8.955386, 77.308655], [8.97222, 77.39017]];
const basemap = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e7eedf' } }] };

test('five-stop road navigation, conservative requests, follow, heading, arrival and pause/end', async ({ page, request }, info) => {
  test.setTimeout(120000);
  const id = crypto.randomUUID(), errors: string[] = [], consoleErrors: string[] = [], appWrites: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', r => { if (r.method() !== 'GET' && new URL(r.url()).hostname === 'localhost') appWrites.push(r.url()); });
  await mockGeolocation(page);
  const requests = await mockDirections(page);
  await page.route('**/styles/v1/mapbox/streets-v12*', route => route.fulfill({ json: basemap }));
  await page.route('https://events.mapbox.com/**', route => route.fulfill({ status: 204 }));
  try {
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: {
      id, title: `Road navigation ${info.project.name}`, destination_slug: 'thenkasi', traveler_type: 'couple', duration_days: 1, status: 'published', cover_image_path: null,
      stops: names.map((name, i) => ({ id: crypto.randomUUID(), name, sequence: i + 1, latitude: points[i][0], longitude: points[i][1], description: 'Existing stop', day_number: 1, photo_path: null })),
    } } })).ok()).toBe(true);
    await page.setViewportSize({ width: info.project.name === 'mobile' ? 360 : 1440, height: info.project.name === 'mobile' ? 800 : 1000 });
    await page.goto(`/travel/${id}`);
    expect(requests).toHaveLength(0); expect((await gpsCounts(page)).active).toBe(0);
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await emitLocation(page, 8.613271839, 77.012719183);
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active');
    await expect(page.getByTestId('road-distance')).toHaveText('2.4 km'); await expect(page.getByTestId('road-duration')).toHaveText('~10 min');
    await expect(page.getByTestId('next-maneuver')).toContainText('Turn left onto the destination road');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'road-route');
    await expect(page.getByTestId('route-marker')).toHaveCount(5); await expect(page.getByTestId('current-location-marker')).toHaveCount(1);
    expect(requests).toHaveLength(1); expect(new URLSearchParams(requests[0]).get('coordinates')).toContain(';77.00279,8.603315');
    const marker = await page.getByTestId('route-marker').first().getAttribute('style');
    for (let i = 1; i <= 5; i++) await emitLocation(page, 8.613271839 + i * 0.00001, 77.012719183);
    expect(requests).toHaveLength(1); expect(await page.getByTestId('route-marker').first().getAttribute('style')).toBe(marker);
    await expect(page.getByTestId('current-location-marker')).not.toHaveClass(/has-heading/);
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop following' })).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => (window as unknown as { gpsMock: GpsMock }).gpsMock.emit(8.6134, 77.012719183, 10, Date.now(), 90));
    await expect(page.getByTestId('current-location-marker')).toHaveClass(/has-heading/);
    await expect.poll(() => page.getByTestId('route-marker').first().getAttribute('style')).not.toBe(marker);
    const box = (await page.getByTestId('journey-map').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6, { steps: 10 }); await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Center on me' }).click();
    await emitLocation(page, ...points[0] as [number, number]);
    await expect(page.getByTestId('travel-progress')).toHaveText('1 / 5 stops · 20%');
    await expect(page.getByTestId('road-navigation')).toContainText('Road route to Palode');
    await expect.poll(() => requests.length).toBe(2);
    expect(new URLSearchParams(requests[1]).get('coordinates')).toContain(';77.02781,8.723348');
    await page.getByRole('button', { name: 'Pause Journey' }).click();
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'none');
    await emitLocation(page, ...points[1] as [number, number]); expect(requests).toHaveLength(2);
    await page.getByRole('button', { name: 'Resume Journey' }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await emitLocation(page, ...points[0] as [number, number]); await expect.poll(() => requests.length).toBe(3);
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active');
    await page.getByTestId('journey-map').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('navigation-map.png') });
    await page.getByRole('button', { name: 'Pause Journey' }).scrollIntoViewIfNeeded();
    const controls = (await page.getByRole('region', { name: 'Travel controls' }).boundingBox())!;
    const map = (await page.getByTestId('journey-map').boundingBox())!;
    expect(controls.y).toBeGreaterThanOrEqual(map.y + map.height);
    if (info.project.name === 'mobile') {
      const nav = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!; expect(controls.y + controls.height).toBeLessThan(nav.y);
      await page.screenshot({ path: info.outputPath('navigation-360.png'), fullPage: true }); await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('navigation-panel.png'), fullPage: true });
    for (let i = 1; i < 5; i++) { await emitLocation(page, ...points[i] as [number, number]); await expect(page.getByTestId('travel-progress')).toContainText(`${i + 1} / 5`); if (i < 4) await expect(page.getByTestId('road-navigation')).toContainText(`Road route to ${names[i + 1]}`); }
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'none'); expect((await gpsCounts(page)).active).toBe(0);
    const stored = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), `journeycreator:travel:v1:${id}`); expect(Object.keys(stored).sort()).toEqual(['completedIds', 'journeyId', 'status', 'stopIds', 'updatedAt', 'version']);
    await page.getByRole('button', { name: 'Reset journey' }).click(); await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1); await emitLocation(page, 8.613271839, 77.012719183); await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active');
    await page.getByRole('button', { name: 'End Journey' }).click(); await page.getByRole('button', { name: 'Confirm End' }).click();
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'none'); expect((await gpsCounts(page)).active).toBe(0);
    expect(errors).toEqual([]); expect(consoleErrors).toEqual([]); expect(appWrites).toEqual([]);
  } finally { await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});

test('missing coordinates, network failures, retries and offline destination changes keep manual progress', async ({ page, request }) => {
  const id = crypto.randomUUID(); let calls = 0;
  await mockGeolocation(page); await page.route('**/styles/v1/mapbox/streets-v12*', route => route.fulfill({ json: basemap }));
  await page.route('https://events.mapbox.com/**', route => route.fulfill({ status: 204 }));
  await page.route('https://api.mapbox.com/directions/v5/**', async route => { calls++; if (calls === 1) await route.abort(); else { const pairs = new URLSearchParams(route.request().postData()!).get('coordinates')!.split(';').map(p => p.split(',').map(Number)); await route.fulfill({ json: directionsResponse(pairs[0], pairs[1]) }); } });
  try {
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: { id, title: 'Navigation fallback', destination_slug: 'thenkasi', traveler_type: 'solo', duration_days: 1, status: 'published', cover_image_path: null, stops: [
      { id: crypto.randomUUID(), name: 'Missing', sequence: 1, latitude: null, longitude: null },
      { id: crypto.randomUUID(), name: 'Palode', sequence: 2, latitude: 8.723348, longitude: 77.02781 },
      { id: crypto.randomUUID(), name: 'Thenmala', sequence: 3, latitude: 8.967814, longitude: 77.07016 },
    ] } } })).ok()).toBe(true);
    await page.goto(`/travel/${id}`); await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1); await emitLocation(page, 8.603315, 77.00279);
    await expect(page.getByTestId('road-navigation')).toContainText('Navigation unavailable for this stop.'); expect(calls).toBe(0);
    await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'unavailable'); await expect(page.getByRole('button', { name: 'Retry route' })).toBeVisible();
    await page.waitForTimeout(5100); await emitLocation(page, 8.603315, 77.00279); await page.getByRole('button', { name: 'Retry route' }).click();
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active'); expect(calls).toBe(2);
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')); });
    await expect(page.getByTestId('road-navigation')).toContainText('Network unavailable'); await expect(page.getByTestId('road-distance')).toHaveText('2.4 km');
    await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await expect(page.getByTestId('road-distance')).toHaveCount(0); await expect(page.getByTestId('road-navigation')).toContainText('Thenmala'); expect(calls).toBe(2);
    await page.getByRole('button', { name: 'Mark Stop Complete' }).click(); await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'COMPLETED');
  } finally { await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});
