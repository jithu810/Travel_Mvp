import { test, expect, type APIRequestContext } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (id = owner) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const headers = { Authorization: `Bearer ${token()}` };
async function seed(request: APIRequestContext, title: string, traveler = 'couple', status = 'published') {
  const id = crypto.randomUUID();
  const response = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: { id, title, description: 'A traveler’s coastal story.', destination_slug: 'goa', traveler_type: traveler, duration_days: 2, status, cover_image_path: null, stops: [{ id: crypto.randomUUID(), sequence: 1, name: `Beach ${title}`, description: 'Sunset on the coast.', latitude: 15.49, longitude: 73.83, day_number: 1, rating: 4 }] } } });
  expect(response.ok()).toBe(true); return id;
}
async function remove(request: APIRequestContext, ids: string[]) { for (const id of ids) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }

test('public discovery ranks likes, sorts publication, searches stories and keeps filter context', async ({ page, request }, info) => {
  const prefix = `Discovery ${info.project.name} ${Date.now()}`;
  const titles = [prefix + ' older', prefix + ' newest'];
  const ids: string[] = [];
  try {
    ids.push(await seed(request, titles[0]));
    ids.push(await seed(request, titles[1], 'friends'));
    ids.push(await seed(request, prefix + ' private', 'family', 'draft'));
    for (const user of [owner, other]) expect((await request.post('http://127.0.0.1:54329/rest/v1/journey_likes', { headers: { Authorization: `Bearer ${token(user)}` }, data: { user_id: user, journey_id: ids[0] } })).ok()).toBe(true);
    await page.goto(`/explore?q=${encodeURIComponent(prefix)}&sort=recent`);
    await expect(page.getByTestId('journey-card')).toHaveCount(2);
    await expect(page.getByTestId('journey-card').first()).toContainText(titles[1]);
    await expect(page.getByText(prefix + ' private')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Journey collections' }).getByRole('link', { name: 'Popular', exact: true }).click();
    await expect(page.getByTestId('journey-card').first()).toContainText(titles[0]);
    await expect(page.getByTestId('journey-card').first().getByLabel('2 likes')).toBeVisible();
    await page.getByRole('navigation', { name: 'Traveler type filters' }).getByRole('link', { name: 'Friends', exact: true }).click();
    await expect(page).toHaveURL(/sort=popular.*traveler=friends/);
    await expect(page.getByTestId('journey-card')).toHaveCount(1);
    await expect(page.getByTestId('journey-card')).toContainText(titles[1]);
    await page.reload(); await expect(page.getByLabel('Search journeys, places or travelers')).toHaveValue(prefix);
    await page.getByRole('navigation', { name: 'Traveler type filters' }).getByRole('link', { name: 'All', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Traveler type filters' }).getByRole('link', { name: 'All', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByLabel('Search journeys, places or travelers').fill('Beach ' + titles[0]);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByTestId('journey-card')).toHaveCount(1);
    await page.getByLabel('Search journeys, places or travelers').fill('creator_a'); await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('link', { name: `Open journey: ${titles[0]}` })).toBeVisible();
    await page.getByLabel('Search journeys, places or travelers').fill('Unfindable ' + prefix); await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No journeys found.' })).toBeVisible();
    await expect(page.getByTestId('journey-card')).toHaveCount(0);
    await page.goto(`/explore?q=${encodeURIComponent(titles[0])}&traveler=couple&sort=popular`);
    await page.route('**/search/geocode/v6/forward?**', route => route.fulfill({ json: { features: [{ id: 'goa-public', geometry: { coordinates: [73.83, 15.49] }, properties: { name: 'Goa', full_address: 'Goa, India', feature_type: 'region', bbox: [73, 14, 75, 16] } }] } }));
    await page.getByRole('combobox').fill('Goa'); await page.getByRole('option', { name: 'Goa, India', exact: true }).click();
    await expect(page).toHaveURL(/destination=Goa/);
    await expect(page.getByTestId('journey-card')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Journey collections' }).getByRole('link', { name: 'Popular', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Clear destination', exact: true }).click();
    await expect(page.getByTestId('journey-card')).toHaveCount(1);
    await page.getByTestId('journey-card').getByRole('link', { name: 'Test Creator', exact: true }).click();
    await expect(page).toHaveURL('/profile/creator_a');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test Creator');
    await expect(page.getByRole('link', { name: `Open journey: ${prefix} private` })).toHaveCount(0);
    await page.getByRole('link', { name: `Open journey: ${titles[0]}` }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(titles[0]);
    await expect(page.getByRole('link', { name: 'Use This Journey', exact: true })).toHaveAttribute('href', '#journey-route');
    await expect(page.getByRole('button', { name: 'Remix This Journey', exact: true })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://journey.example/journey/${ids[0]}`);
  } finally { await remove(request, ids); }
});

test('bounded journey pages retain search and do not duplicate cards', async ({ page, request }, info) => {
  test.setTimeout(90000);
  const prefix = `Pages ${info.project.name} ${Date.now()}`, ids: string[] = [];
  try {
    for (let i = 0; i < 26; i++) ids.push(await seed(request, `${prefix} ${i}`, 'family'));
    await page.goto(`/explore?q=${encodeURIComponent(prefix)}&traveler=family&sort=recent`);
    await expect(page.getByTestId('journey-card')).toHaveCount(24);
    const first = await page.getByTestId('journey-card').getByRole('link', { name: /^Open journey:/ }).evaluateAll(links => links.map(link => link.getAttribute('href')));
    await page.getByRole('link', { name: 'More journeys →' }).click();
    await expect(page.getByTestId('journey-card')).toHaveCount(2);
    const last = await page.getByTestId('journey-card').getByRole('link', { name: /^Open journey:/ }).evaluateAll(links => links.map(link => link.getAttribute('href')));
    expect(first.some(id => last.includes(id))).toBe(false);
    await page.getByRole('link', { name: 'Previous journeys' }).click(); await expect(page.getByTestId('journey-card')).toHaveCount(24);
  } finally { await remove(request, ids); }
});

test('Home and Explore are usable at all six discovery viewports', async ({ page, request }, info) => {
  test.setTimeout(240000);
  const title = `Viewport story ${info.project.name} ${Date.now()}`, id = await seed(request, title);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    for (const [width, height] of [[360,800],[390,844],[412,915],[844,390],[1280,900],[1440,1000]]) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Recently published.', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: `Open journey: ${title}` }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });
      await page.goto(`/explore?q=${encodeURIComponent(title)}`);
      await expect(page.getByTestId('journey-card')).toHaveCount(1);
      await expect(page.locator('main input[type=search]')).toHaveCount(1);
      await expect(page.getByRole('search')).toHaveCount(1);
      for (const name of ['Search']) { const box = await page.getByRole('button', { name, exact: true }).boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); }
      await page.getByLabel('Search journeys, places or travelers').focus(); await expect(page.getByLabel('Search journeys, places or travelers')).toBeFocused();
      await page.getByRole('region', { name: 'Destination context', exact: true }).scrollIntoViewIfNeeded();
      await page.getByTestId('explore-map').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('explore-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
      const marker = page.getByRole('button', { name: /Preview \d+ journeys? in/ }).first();
      await marker.click(); await expect(page.locator('#explore-marker-preview')).toBeFocused();
      await page.getByRole('button', { name: 'Close preview' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`explore-${width}.png`), fullPage: true });
      await page.getByRole('link', { name: `Open journey: ${title}` }).click(); await expect(page).toHaveURL(`/journey/${id}`);
      await page.getByRole('link', { name: 'View Profile', exact: true }).click(); await expect(page).toHaveURL('/profile/creator_a');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally { await remove(request, [id]); }
});
