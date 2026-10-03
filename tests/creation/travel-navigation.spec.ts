import { mockNavigationMap } from '../fixtures/navigation-map';
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
  await mockNavigationMap(page);
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
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-map-style', 'standard');
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
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-pitch', '45');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-bearing', '90');
    await expect.poll(() => page.getByTestId('route-marker').first().getAttribute('style')).not.toBe(marker);
    const box = (await page.getByTestId('journey-map').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6, { steps: 10 }); await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Center on me' }).click();
    await expect(page.getByRole('button', { name: 'Stop following' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-camera', 'FOLLOWING');
    await emitLocation(page, ...points[0] as [number, number]);
    await expect(page.getByTestId('travel-progress')).toHaveText('1 / 5 stops · 20%');
    await expect(page.getByTestId('navigation-next-stop')).toHaveText('Palode');
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
    for (let i = 1; i < 5; i++) { await emitLocation(page, ...points[i] as [number, number]); await expect(page.getByTestId('travel-progress')).toContainText(`${i + 1} / 5`); if (i < 4) await expect(page.getByTestId('navigation-next-stop')).toHaveText(names[i + 1]); }
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
  await mockGeolocation(page);
  await mockNavigationMap(page); await page.route('**/styles/v1/mapbox/streets-v12*', route => route.fulfill({ json: basemap }));
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


test('persistent off-route rerouting preserves Thenkasi destination, route separation and manual/error recovery', async ({ page, request }, info) => {
  const id = crypto.randomUUID(); let calls = 0; let release: (() => void) | undefined;
  const bodies: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockGeolocation(page); await mockNavigationMap(page);
  await page.route('https://api.mapbox.com/directions/v5/**', async route => {
    calls++; bodies.push(route.request().postData()!);
    if (calls === 3) { await route.abort(); return; }
    if (calls === 2) await new Promise<void>(resolve => { release = resolve; });
    const pairs = new URLSearchParams(route.request().postData()!).get('coordinates')!.split(';').map(p => p.split(',').map(Number));
    const response = directionsResponse(pairs[0], pairs[1]);
    if (calls > 1) { response.routes[0].distance = 4500; response.routes[0].duration = 900; }
    await route.fulfill({ json: response });
  });
  try {
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: {
      id, title: 'Smart rerouting five-stop journey', destination_slug: 'thenkasi', traveler_type: 'couple', duration_days: 1, status: 'published', cover_image_path: null,
      stops: names.map((name, i) => ({ id: crypto.randomUUID(), name, sequence: i + 1, latitude: points[i][0], longitude: points[i][1], description: 'Existing stop', day_number: 1, photo_path: null })),
    } } })).ok()).toBe(true);
    await page.clock.install();
    await page.goto(`/travel/${id}`); await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await emitLocation(page, 8.967814, 77.080);
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready');
    const creatorOrder = await page.getByTestId('travel-stop').allTextContents();
    await page.clock.fastForward(30000);
    await emitLocation(page, 8.9683, 77.080); expect(calls).toBe(1);
    await page.clock.fastForward(1);
    for (let i = 0; i < 3; i++) {
      if (i) await page.clock.fastForward(4000);
      await emitLocation(page, 8.971, 77.080);
      await page.clock.runFor(10);
      if (i < 2) { await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active'); await expect(page.getByTestId('navigation-status')).toHaveText('Checking route…'); expect(calls).toBe(1); }
    }
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'rerouting');
    await expect(page.getByTestId('road-navigation')).toContainText('Rerouting');
    await expect(page.getByTestId('road-distance')).toHaveText('2.4 km');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'road-route');
    expect(calls).toBe(2); expect(new URLSearchParams(bodies[1]).get('coordinates')).toContain(';77.308655,8.955386');
    release!(); await expect(page.getByTestId('road-navigation')).toContainText('Route updated');
    await expect(page.getByTestId('road-distance')).toHaveText('4.5 km'); await expect(page.getByTestId('road-duration')).toHaveText('~15 min');
    await expect(page.getByTestId('current-location-marker')).toHaveCount(1);
    expect(await page.getByTestId('travel-stop').allTextContents()).toEqual(creatorOrder);
    await expect(page.getByTestId('travel-progress')).toHaveText('3 / 5 stops · 60%');
    for (let i = 0; i < 5; i++) { await page.clock.fastForward(1000); await emitLocation(page, 8.971, 77.080); } expect(calls).toBe(2);
    await page.clock.fastForward(2000); await page.clock.runFor(10); await expect(page.getByTestId('navigation-notice')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('smart-rerouting.png'), fullPage: true });
    await page.clock.fastForward(60000);
    for (let i = 0; i < 3; i++) { if (i) await page.clock.fastForward(4000); await emitLocation(page, 8.975, 77.080); await page.clock.runFor(10); }
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'unavailable');
    await expect(page.getByTestId('road-distance')).toHaveText('4.5 km');
    await expect(page.getByRole('button', { name: 'Mark Stop Complete' })).toBeVisible();
    for (let i = 0; i < 10; i++) { await page.clock.fastForward(4000); await emitLocation(page, 8.975, 77.080); } expect(calls).toBe(3);
    await page.getByRole('button', { name: 'Retry route' }).click();
    await expect(page.getByTestId('road-navigation')).toHaveAttribute('data-status', 'active'); expect(calls).toBe(4);
    await page.getByRole('button', { name: 'Pause Journey' }).click();
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-camera', 'PAUSED');
    await page.clock.fastForward(70000); await emitLocation(page, 8.980, 77.080); expect(calls).toBe(4);
    expect(await page.getByTestId('travel-stop').allTextContents()).toEqual(creatorOrder);
    expect(errors).toEqual([]);
  } finally { release?.(); await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});

test('navigation HUD, arrival feedback, stable camera, resume and viewport controls are understandable', async ({ page, request }, info) => {
  test.setTimeout(120000);
  const id = crypto.randomUUID(), errors: string[] = [];
  let calls = 0, release: (() => void) | undefined;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await mockGeolocation(page); await mockNavigationMap(page);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.install();
  await page.route('https://api.mapbox.com/directions/v5/**', async route => {
    calls++;
    if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
    const pairs = new URLSearchParams(route.request().postData()!).get('coordinates')!.split(';').map(p => p.split(',').map(Number));
    await route.fulfill({ json: directionsResponse(pairs[0], pairs[1]) });
  });
  try {
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: {
      id, title: 'Navigation UX five-stop journey', destination_slug: 'thenkasi', traveler_type: 'couple', duration_days: 1, status: 'published', cover_image_path: null,
      stops: names.map((name, i) => ({ id: crypto.randomUUID(), name, sequence: i + 1, latitude: points[i][0], longitude: points[i][1], description: 'Existing stop', day_number: 1, photo_path: null })),
    } } })).ok()).toBe(true);
    await page.goto(`/travel/${id}`); await expect(page.getByTestId('navigation-next-stop')).toHaveText('Nedumangad');
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await expect(page.getByTestId('navigation-status')).toHaveText('Waiting for GPS…');
    await emitLocation(page, 8.613271839, 77.012719183, 100); await page.clock.runFor(10);
    await expect(page.getByTestId('navigation-status')).toHaveText('GPS signal weak'); expect(calls).toBe(0);
    await expect(page.getByRole('button', { name: 'Center on me' })).toBeDisabled();
    await page.clock.fastForward(1); await page.evaluate(() => (window as unknown as { gpsMock: GpsMock }).gpsMock.emit(8.613271839, 77.012719183, 10, Date.now(), 90));
    await expect(page.getByTestId('navigation-status')).toHaveText('Finding route…');
    release!(); await expect(page.getByTestId('navigation-status')).toHaveText('Follow the route');
    await expect(page.getByTestId('road-distance')).toHaveText('2.4 km'); await expect(page.getByTestId('road-duration')).toHaveText('~10 min');
    await expect(page.getByTestId('next-maneuver')).toContainText('Turn left');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready');
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await expect(page.getByTestId('camera-status')).toHaveText('Following your location');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-bearing', '90');
    await page.evaluate(() => {
      const map = document.querySelector('[data-testid="journey-map"]') as HTMLElement;
      map.dataset.cameraMoves = '0';
      new MutationObserver(records => { map.dataset.cameraMoves = String(Number(map.dataset.cameraMoves) + records.length); }).observe(map, { attributes: true, attributeFilter: ['data-pitch', 'data-zoom', 'data-bearing'] });
    });
    const marker = await page.getByTestId('current-location-marker').getAttribute('style');
    for (let i = 1; i <= 4; i++) {
      await page.clock.fastForward(1000);
      await page.evaluate(i => (window as unknown as { gpsMock: GpsMock }).gpsMock.emit(8.613271839 + i * 0.000005, 77.012719183, 10, Date.now(), 90 + i % 3), i);
      await page.clock.runFor(10);
    }
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-camera-moves', '0');
    expect(await page.getByTestId('current-location-marker').getAttribute('style')).not.toBe(marker); expect(calls).toBe(1);
    await page.clock.fastForward(1); await emitLocation(page, 8.613291839, 77.012719183);
    await expect(page.getByTestId('current-location-marker')).not.toHaveClass(/has-heading/);
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-bearing', '90');
    await page.clock.fastForward(1); await emitLocation(page, ...points[0] as [number, number]);
    await expect(page.getByTestId('travel-progress')).toHaveText('1 / 5 stops · 20%');
    await expect(page.getByTestId('travel-arrival')).toContainText('Nedumangad reached. Arrival detected by GPS.');
    await expect(page.getByTestId('travel-arrival')).toContainText('Next: Palode');
    await expect(page.getByTestId('travel-stop').first()).toHaveAttribute('data-recently-completed', 'true');
    await expect(page.getByTestId('travel-stop').nth(1).getByRole('button')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('navigation-next-stop')).toHaveText('Palode');
    await expect.poll(() => calls).toBe(2); await expect(page.getByTestId('journey-map')).toHaveAttribute('data-camera', 'FOLLOWING');
    await page.clock.fastForward(6100); await page.clock.runFor(10); await expect(page.getByTestId('travel-arrival')).toHaveCount(0);
    await page.getByRole('button', { name: 'Pause Journey' }).click();
    await expect(page.getByTestId('navigation-status')).toHaveText('Navigation paused');
    await page.getByRole('button', { name: 'Resume Journey' }).click();
    await expect(page.getByTestId('navigation-status')).toHaveText('Waiting for GPS…');
    await expect(page.getByTestId('current-location-marker')).toHaveCount(0);
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await page.clock.fastForward(1); await emitLocation(page, ...points[0] as [number, number]);
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-camera', 'FOLLOWING');
    await expect(page.getByRole('button', { name: 'Stop following' })).toHaveAttribute('aria-pressed', 'true');
    for (const [width, height] of [[360, 800], [390, 844], [412, 915], [844, 390], [1280, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.getByTestId('journey-map').scrollIntoViewIfNeeded();
      const mapView = (await page.getByTestId('journey-map').boundingBox())!; expect(mapView.height).toBeLessThanOrEqual(height * 0.65 + 1);
      if (width > height) { const location = (await page.getByTestId('current-location-marker').boundingBox())!; expect(location.y).toBeGreaterThanOrEqual(0); expect(location.y + location.height).toBeLessThanOrEqual(height); }
      await page.getByTestId('road-navigation').scrollIntoViewIfNeeded(); await expect(page.getByTestId('navigation-next-stop')).toBeVisible();
      await page.getByRole('region', { name: 'Travel controls' }).scrollIntoViewIfNeeded();
      const controls = (await page.getByRole('region', { name: 'Travel controls' }).boundingBox())!, map = (await page.getByTestId('journey-map').boundingBox())!;
      expect(controls.y).toBeGreaterThanOrEqual(map.y + map.height);
      if (width < 768) { const nav = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!; expect(controls.y + controls.height).toBeLessThan(nav.y); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`hud-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'End Journey' }).click();
    await expect(page.getByRole('dialog')).toContainText('1 of 5 stops complete');
    await page.getByRole('button', { name: 'Keep Traveling' }).click(); await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'ACTIVE');
    for (let i = 1; i < 5; i++) await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await expect(page.getByRole('heading', { name: 'Journey Complete', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current stop', exact: true })).toContainText('5 of 5 stops completed');
    await expect(page.getByRole('link', { name: 'View Journey', exact: true })).toHaveAttribute('href', `/journey/${id}`);
    expect((await gpsCounts(page)).active).toBe(0); expect(errors).toEqual([]);
  } finally { release?.(); await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});
