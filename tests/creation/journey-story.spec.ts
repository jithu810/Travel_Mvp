import { test, expect } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const stops = [
  { name: 'Nedumangad', latitude: 8.603315, longitude: 77.00279 },
  { name: 'Palode', latitude: 8.723348, longitude: 77.02781 },
  { name: 'Thenmala', latitude: 8.967814, longitude: 77.07016 },
  { name: 'Thenkasi', latitude: 8.955386, longitude: 77.308655 },
  { name: 'Sundarapandiapuram', latitude: 8.97222, longitude: 77.39017 },
];

test('published story preserves order, photos, days, map selection and public privacy', async ({ page, request }, info) => {
  test.setTimeout(90000);
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const title = `Journey story ${info.project.name}`;
  const errors: string[] = [];
  const requested: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', r => requested.push(r.url()));
  await page.route('https://story-images.example/**', async route => {
    if (route.request().url().endsWith('missing.png')) return route.fulfill({ status: 404 });
    await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=', 'base64') });
  });
  try {
    for (const [index, id] of ids.entries()) {
      const result = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', {
        headers: { Authorization: `Bearer ${token}` },
        data: { payload: { id, title: index ? 'Private story' : title, destination_slug: 'thenkasi', traveler_type: 'couple', duration_days: 2, status: index ? 'draft' : 'published', cover_image_path: null,
          stops: stops.map((stop, i) => ({ ...stop, id: crypto.randomUUID(), sequence: i + 1, description: `Existing description for ${stop.name}`, day_number: i < 3 ? 1 : null,
            photo_path: index ? 'https://story-images.example/private.png' : i === 0 ? 'https://story-images.example/existing.png' : i === 1 ? 'https://story-images.example/missing.png' : null })) } },
      });
      expect(result.ok()).toBe(true);
    }
    await page.goto(`/journey/${ids[0]}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await expect(page.getByTestId('journey-stop')).toHaveCount(5);
    expect(await page.getByTestId('journey-stop').getByRole('heading').allTextContents()).toEqual(stops.map(stop => stop.name));
    const map = (await page.getByTestId('journey-map').boundingBox())!;
    const controls = (await page.locator('.mapboxgl-ctrl-top-right').boundingBox())!;
    for (const marker of await page.getByTestId('route-marker').all()) {
      const rect = (await marker.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(map.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(map.x + map.width);
      expect(rect.y).toBeGreaterThanOrEqual(map.y);
      expect(rect.y + rect.height).toBeLessThanOrEqual(map.y + map.height);
      expect(rect.x + rect.width <= controls.x || rect.x >= controls.x + controls.width || rect.y + rect.height <= controls.y || rect.y >= controls.y + controls.height).toBe(true);
    }
    const first = page.getByTestId('journey-stop').first();
    await expect(first).toContainText('Day 1 · Stop 1');
    await expect(first).toContainText('Existing description for Nedumangad');
    await first.scrollIntoViewIfNeeded();
    const photo = first.getByRole('img', { name: 'Nedumangad', exact: true });
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    const second = page.getByTestId('journey-stop').nth(1);
    await second.scrollIntoViewIfNeeded();
    await expect(second).toContainText('This stop photo is unavailable.');
    await expect(page.getByTestId('journey-stop').last()).toContainText('Stop 5');
    await expect(page.getByTestId('journey-stop').last()).not.toContainText('Day');
    await expect(page.getByTestId('journey-stop').nth(2).getByRole('img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Select stop 3: Thenmala' }).click();
    await expect(page.getByRole('button', { name: 'Stop 3: Thenmala', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.mapboxgl-popup-close-button').click();
    await page.getByRole('button', { name: 'Stop 4: Thenkasi', exact: true }).click();
    await expect(page.getByTestId('journey-stop').nth(3)).toBeFocused();
    await expect(page.getByRole('button', { name: 'Select stop 4: Thenkasi' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('link', { name: 'Use This Journey', exact: true }).click();
    await expect(page).toHaveURL(/#journey-route$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Log in to continue' })).toBeVisible();
    await page.getByRole('button', { name: 'Close login' }).click();
    const creator = page.getByRole('region', { name: 'About the creator' });
    await expect(creator.getByRole('link', { name: 'View Profile' })).toHaveAttribute('href', /\/profile\//);
    await creator.scrollIntoViewIfNeeded();
    if (info.project.name === 'mobile') {
      const link = (await creator.getByRole('link').boundingBox())!;
      const nav = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!;
      expect(link.y + link.height).toBeLessThanOrEqual(nav.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('journey-story.png'), fullPage: true });
    await page.goto(`/journey/${ids[1]}`);
    await expect(page.getByTestId('journey-stop')).toHaveCount(0);
    expect(requested.some(url => url.includes('/private.png'))).toBe(false);
    expect(requested.some(url => /directions\/|geocoding\/|optimization\//.test(url))).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    for (const id of ids) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers: { Authorization: `Bearer ${token}` } });
  }
});
