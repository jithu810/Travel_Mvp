import { test, expect } from '@playwright/test';
import { selectEditorDestination } from '../fixtures/editor-destination';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sizes = [[360,800],[390,844],[412,915],[844,390],[1280,900],[1440,1000]];
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=', 'base64');

test('search, GPS and pin capture focus the exact new editor and preserve photos, notes, ratings, IDs and order', async ({ page, context }, info) => {
  test.setTimeout(120000);
  const uid = '10000000-0000-0000-0000-000000000001';
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'capture@example.com', app_metadata: { provider: 'email' }, user_metadata: {} };
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: uid, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })}.test-signature`;
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
  await page.route('**/styles/v1/mapbox/streets-v12*', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e7eedf' } }] } }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition(success: PositionCallback) { success({ coords: { latitude: 8.75, longitude: 76.71, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition); },
      watchPosition() { throw new Error('Create must not watch GPS'); },
    } });
  });
  let savedId: string | null = null;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/create');
    await page.getByLabel('Journey title', { exact: true }).fill(`Immediate capture ${info.project.name}`);
    await selectEditorDestination(page, 'varkala'); await page.getByRole('button', { name: /Solo/ }).click();
    await page.route(url => url.pathname.endsWith('/search/geocode/v6/forward') && !url.searchParams.get('types'), route => {
      const name = new URL(route.request().url()).searchParams.get('q')!;
      const n = Number(name.split(' ').at(-1));
      return route.fulfill({ json: { features: [{ id: name, geometry: { coordinates: [76.7 + n/1000,8.74] }, properties: { name, full_address: name } }] } });
    });
    for (let i = 1; i <= 3; i++) {
      await page.getByRole('combobox', { name: 'Search for a place' }).fill(`Search stop ${i}`);
      await page.getByRole('option', { name: `Search stop ${i}`, exact: true }).click();
      const card = page.getByTestId('editor-stop').last();
      await expect(card).toHaveAttribute('data-active', 'true');
      await expect(card.getByLabel('Stop name')).toBeFocused();
      await expect(card.locator('details')).toHaveAttribute('open', '');
      await card.getByLabel('Stop description').fill(`Note ${i}`);
      await card.getByLabel('Rating (optional)').fill('4');
      await card.getByLabel('Stop photo (optional)').setInputFiles({ name: 'moment.png', mimeType: 'image/png', buffer: image });
      await expect(card.getByRole('status').filter({ hasText: 'Photo uploaded and draft saved.' })).toBeVisible();
      savedId = new URL(page.url()).searchParams.get('draft');
    }
    const previousIds = await page.getByTestId('editor-stop').evaluateAll(cards => cards.map(card => card.getAttribute('data-stop-id')));
    for (const method of ['GPS', 'pin']) {
      await page.setViewportSize(info.project.name === 'mobile' ? { width: 360, height: 800 } : { width: 1280, height: 900 });
      await page.getByRole('button', { name: method === 'GPS' ? /Use my current location/ : '🗺️ Pick on map', exact: method !== 'GPS' }).click();
      const dialog = page.getByRole('dialog', { name: 'Choose stop location' });
      await expect(dialog.getByLabel('Stop name')).toHaveValue('');
      await dialog.getByLabel('Stop name').fill(method === 'GPS' ? 'Hotel' : 'Beach');
      if (method === 'pin') { await dialog.getByLabel('Pin latitude').fill('8.77'); await dialog.getByLabel('Pin longitude').fill('76.73'); }
      await dialog.getByRole('button', { name: 'Save stop location' }).click();
      const card = page.getByTestId('editor-stop').last();
      await expect(card.getByLabel('Stop name')).toBeFocused(); await expect(card).toHaveAttribute('data-active', 'true');
      await expect(page.locator('[data-testid="editor-stop"][data-active="true"]')).toHaveCount(1);
      await expect(card.locator('details')).toHaveAttribute('open', '');
      const nameBox = (await card.getByLabel('Stop name').boundingBox())!;
      await expect.poll(async () => (await card.getByLabel('Stop name').boundingBox())!.y).toBeGreaterThanOrEqual(0);
      expect(nameBox.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
      await card.getByLabel('Stop name').fill(method === 'GPS' ? 'Hotel entrance' : 'Beach sunset');
      await card.getByLabel('Stop description').fill(`Captured ${method} note`); await card.getByLabel('Rating (optional)').fill('4.5');
      await card.getByLabel('Stop photo (optional)').setInputFiles({ name: 'moment.png', mimeType: 'image/png', buffer: image });
      await expect(card.getByRole('status').filter({ hasText: 'Photo uploaded and draft saved.' })).toBeVisible();
      for (const [width,height] of sizes) {
        await page.setViewportSize({ width,height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await card.getByLabel('Stop name').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`${method}-${width}-name.png`) });
        await card.getByRole('button', { name: 'Save stop', exact: true }).scrollIntoViewIfNeeded();
        const saveBox = (await card.getByRole('button', { name: 'Save stop', exact: true }).boundingBox())!;
        expect(saveBox.y).toBeGreaterThanOrEqual(0); expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(height);
        await page.screenshot({ path: info.outputPath(`${method}-${width}-photo-save.png`) });
      }
      await card.getByRole('button', { name: 'Save stop', exact: true }).click();
      await expect(card.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
    }
    await expect(page.getByTestId('editor-stop')).toHaveCount(5);
    expect((await page.getByTestId('editor-stop').evaluateAll(cards => cards.map(card => card.getAttribute('data-stop-id')))).slice(0,3)).toEqual(previousIds);
    await expect(page.getByTestId('editor-stop').getByRole('heading')).toHaveText(['1. Search stop 1','2. Search stop 2','3. Search stop 3','4. Hotel entrance','5. Beach sunset']);
    await page.reload();
    for (let i = 0; i < 5; i++) {
      const card = page.getByTestId('editor-stop').nth(i); await card.getByText('Details & photo', { exact: true }).click();
      await expect(card.getByLabel('Stop description')).toHaveValue(i < 3 ? `Note ${i+1}` : `Captured ${i === 3 ? 'GPS' : 'pin'} note`);
      await expect(card.getByLabel('Rating (optional)')).toHaveValue(i < 3 ? '4' : '4.5');
      await expect(card.getByRole('button', { name: 'Remove stop photo' })).toBeVisible();
    }
    const first = page.getByTestId('editor-stop').first(); await first.getByLabel('Stop description').fill('Existing stop edited');
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { if (savedId) await page.request.delete(`/api/journeys/${savedId}`, { headers: { Origin: 'http://localhost:3200' } }); }
});
