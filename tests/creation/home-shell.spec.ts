import { expect, test } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'creator@example.com', app_metadata: { provider: 'email' }, user_metadata: { display_name: 'Test Creator' } };
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;

test('homepage shows published data and shell preserves anonymous and authenticated navigation', async ({ page, request, context }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const seedTitle = `Coastal story ${testInfo.project.name}`;
  const response = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', {
    headers: { Authorization: `Bearer ${token}` },
    data: { payload: { id: crypto.randomUUID(), title: seedTitle, description: 'A quiet coastal journey.', destination_slug: 'goa', traveler_type: 'couple', duration_days: 2, status: 'published', updated_at: null, cover_image_path: '/images/goa.jpg', stops: [{ id: crypto.randomUUID(), sequence: 1, name: 'Candolim Beach', description: '', latitude: 15.4, longitude: 73.8, photo_path: null, rating: null, day_number: 1 }] } },
  });
  expect(response.ok()).toBe(true);
  const published = await request.post('http://127.0.0.1:54329/rest/v1/rpc/get_public_journeys', { data: {} });
  const title = (await published.json())[0].title as string;
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Where will your');
  await expect(page.getByRole('link', { name: `Open journey: ${title}` })).toBeVisible();
  await expect(page.locator('main').getByText('Demo journey')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Login / Profile', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Search destinations' }).fill('Goa');
  await page.getByRole('heading', { level: 1 }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('heading', { name: 'See the bigger picture.' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('region', { name: 'Southern India destination map preview' })).toBeVisible();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('main img')).filter(image => image.getBoundingClientRect().width > 0).every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(async () => {
    const attribution = await page.locator('.mapboxgl-ctrl-attrib').allTextContents();
    const fallback = await page.getByText(/The map is unavailable right now.|The map preview will appear here/).count();
    return attribution.join(' ') + (fallback ? ' fallback' : '');
  }, { timeout: 20000 }).toMatch(/OpenStreetMap|fallback/);
  await page.screenshot({ path: testInfo.outputPath('home-shell.png'), fullPage: true });
  await page.getByRole('link', { name: `Open journey: ${title}` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await page.getByRole('link', { name: 'Journey home' }).click();
  await page.locator('main').getByRole('link', { name: /^Solo/ }).click();
  await expect(page).toHaveURL('/explore?traveler=solo');
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: testInfo.project.name === 'mobile' ? 'Mobile navigation' : 'Main navigation' });
  await nav.getByRole('link', { name: 'Explore', exact: true }).click();
  await expect(page).toHaveURL('/explore');
  if (testInfo.project.name === 'mobile') {
    await nav.getByRole('link', { name: 'Create Journey', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=.*create/);
  }
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Your profile' })).toContainText('Test Creator');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Your profile' })).toContainText('Test Creator');
  if (testInfo.project.name === 'mobile') await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Login / Profile', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
