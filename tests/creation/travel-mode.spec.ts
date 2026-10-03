import { mockNavigationMap } from '../fixtures/navigation-map';
import { test, expect } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const names = ['Nedumangad', 'Palode', 'Thenmala', 'Thenkasi', 'Sundarapandiapuram'];
const coordinates = [[8.603315, 77.00279], [8.723348, 77.02781], [8.967814, 77.07016], [8.955386, 77.308655], [8.97222, 77.39017]];
const headers = { Authorization: `Bearer ${token}` };

test('five-stop simulation preserves state, map statuses, details and confirmation on narrow/mobile/desktop', async ({ page, request }, info) => {
  test.setTimeout(120000);
  await mockNavigationMap(page);
  const id = crypto.randomUUID(), stopIds = names.map(() => crypto.randomUUID());
  const key = `journeycreator:travel:v1:${id}`;
  const errors: string[] = [], requests: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', r => { requests.push(r.url()); if (r.method() !== 'GET' && /\/api\/journeys/.test(r.url())) writes.push(r.url()); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { get() { throw new Error('Location must not be used in this preview'); } });
  });
  await page.route('https://travel-images.example/**', route => route.fulfill({ status: 404 }));
  try {
    expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: {
      id, title: `Five-stop Travel Mode ${info.project.name}`, destination_slug: 'thenkasi', traveler_type: 'couple', duration_days: 2, status: 'published', cover_image_path: null,
      stops: names.map((name, i) => ({ id: stopIds[i], name, sequence: i + 1, latitude: coordinates[i][0], longitude: coordinates[i][1], description: `Existing description for ${name}`, day_number: 1, photo_path: i === 2 ? 'https://travel-images.example/unavailable.png' : null })),
    } } })).ok()).toBe(true);
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/journey/${id}`);
    await page.getByRole('link', { name: 'Use This Journey', exact: true }).click();
    await expect(page).toHaveURL(/#journey-route$/);
    await page.getByRole('link', { name: 'Preview Travel Mode' }).click();
    await expect(page).toHaveURL(`/travel/${id}`);
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'NOT_STARTED');
    expect(await page.getByTestId('travel-stop').evaluateAll(elements => elements.map(e => e.querySelector('.font-semibold')?.textContent))).toEqual(names);
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await expect(page.locator('[data-testid="route-marker"][data-progress="current"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'upcoming stop 5: Sundarapandiapuram', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Sundarapandiapuram', exact: true })).toContainText('Stop 5 of 5');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'ACTIVE');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await expect(page.getByTestId('travel-progress')).toHaveText('2 / 5 stops · 40%');
    await expect(page.getByRole('region', { name: 'Current stop', exact: true })).toContainText('Thenmala');
    await expect(page.locator('[data-testid="route-marker"][data-progress="completed"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'current stop 3: Thenmala', exact: true })).toBeVisible();
    const view = page.getByRole('button', { name: 'View Stop', exact: true });
    await view.click();
    const detail = page.getByRole('dialog', { name: 'Thenmala', exact: true });
    await expect(detail).toContainText('Stop 3 of 5 · Day 1');
    await expect(detail).toContainText('Existing description for Thenmala');
    await expect(detail).toContainText('This stop photo is unavailable.');
    await page.keyboard.press('Tab');
    expect(await detail.evaluate(e => e.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(view).toBeFocused();
    await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await page.getByRole('button', { name: 'Pause Journey' }).click();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'PAUSED');
    await page.reload();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'PAUSED');
    await expect(page.getByTestId('travel-progress')).toHaveText('3 / 5 stops · 60%');
    const stored = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), key);
    expect(Object.keys(stored).sort()).toEqual(['completedIds', 'journeyId', 'status', 'stopIds', 'updatedAt', 'version']);
    const separateTab = await page.context().newPage();
    await separateTab.goto(`/travel/${id}`);
    await expect(separateTab.getByRole('button', { name: 'Start Journey', exact: true })).toBeEnabled();
    await expect(separateTab.getByTestId('travel-progress')).toHaveText('0 / 5 stops · 0%');
    await separateTab.close();
    await page.getByRole('button', { name: 'End Journey', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'End this journey?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep Traveling' }).click();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'PAUSED');
    await page.getByRole('button', { name: 'Resume Journey' }).click();
    const complete = page.getByRole('button', { name: 'Mark Stop Complete' });
    await complete.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    const toolbar = (await page.getByRole('region', { name: 'Travel controls' }).boundingBox())!;
    const map = (await page.getByTestId('journey-map').boundingBox())!;
    expect(toolbar.y).toBeGreaterThanOrEqual(map.y + map.height);
    if (info.project.name === 'mobile') {
      const rect = (await complete.boundingBox())!, nav = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!;
      expect(rect.y + rect.height).toBeLessThan(nav.y);
      await page.screenshot({ path: info.outputPath('travel-360.png') });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('travel-active.png'), fullPage: true });
    await complete.click(); await complete.click();
    await expect(page.getByRole('heading', { name: 'Journey Complete', exact: true })).toBeVisible();
    await expect(page.getByTestId('travel-progress')).toHaveText('5 / 5 stops · 100%');
    await expect(page.locator('[data-testid="route-marker"][data-progress="completed"]')).toHaveCount(5);
    await page.reload();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'COMPLETED');
    await page.getByRole('button', { name: 'Reset journey' }).click();
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await page.getByRole('button', { name: 'End Journey', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm End', exact: true }).click();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'CANCELLED');
    await page.reload();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'CANCELLED');
    await page.evaluate(key => sessionStorage.setItem(key, 'corrupt'), key);
    await page.reload();
    await expect(page.getByText('The previous simulation was outdated or invalid. Start a fresh preview.')).toBeVisible();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'NOT_STARTED');
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await page.evaluate(key => { const value = JSON.parse(sessionStorage.getItem(key)!); value.updatedAt = 1; sessionStorage.setItem(key, JSON.stringify(value)); }, key);
    await page.reload();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'NOT_STARTED');
    await expect(page.getByText('The previous simulation was outdated or invalid. Start a fresh preview.')).toBeVisible();
    expect(writes).toEqual([]);
    expect(requests.some(url => /directions\/|geocoding\/|optimization\//.test(url))).toBe(false);
    expect(errors).toEqual([]);
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
  } finally {
    await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers });
  }
});

test('invalid/private journeys, empty stops, map failures and unavailable storage stay usable', async ({ page, request }) => {
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  try {
    for (const [index, id] of ids.entries()) expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: {
      id, title: 'Unavailable or empty travel fixture', destination_slug: 'goa', traveler_type: 'solo', duration_days: 1, status: index ? 'published' : 'draft', cover_image_path: null, stops: [],
    } } })).ok()).toBe(true);
    for (const id of [ids[0], 'not-a-journey', crypto.randomUUID()]) {
      await page.goto(`/travel/${id}`);
      await expect(page.getByTestId('travel-mode')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'This journey is unavailable.' })).toBeVisible();
    }
    const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'creator@example.com', app_metadata: { provider: 'email' }, user_metadata: {} };
    await page.context().addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
    await page.goto(`/travel/${ids[0]}`);
    await expect(page.getByTestId('travel-mode')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'This journey is unavailable.' })).toBeVisible();
    await page.context().clearCookies();
    await page.goto(`/travel/${ids[1]}`);
    await expect(page.getByRole('heading', { name: 'No stops to follow yet.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Journey', exact: true })).toHaveCount(0);
    await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked'); } }); });
    await page.route('**/styles/v1/**', route => route.abort());
    await page.goto('/travel/demo-goa-couple');
    await expect(page.getByText('Browser storage is unavailable.', { exact: false })).toBeVisible();
    await expect(page.getByText('Route overview · Geographic map unavailable')).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await page.getByRole('button', { name: 'Mark Stop Complete' }).click();
    await expect(page.getByTestId('travel-progress')).toHaveText('1 / 4 stops · 25%');
    await page.reload();
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'NOT_STARTED');
  } finally {
    for (const id of ids) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers });
  }
});
