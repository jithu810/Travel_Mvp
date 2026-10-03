import { test, expect } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })}.test-signature`;
const goa = '/explore?destination=Goa&label=Goa%2C+India&mapbox=test-goa&lat=15.32&lng=74.05&type=region&country=India&bbox=73.6,14.85,74.34,15.8';

test('real world globe, grouped marker preview, destination/filter history and public detail', async ({ page, request }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const titles = ['couple', 'friends'].map(type => `Explore marker ${type} ${info.project.name}`);
  for (const [index, traveler] of ['couple', 'friends'].entries()) {
    const response = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers: { Authorization: `Bearer ${token}` }, data: { payload: { id: crypto.randomUUID(), title: titles[index], destination_slug: 'goa', traveler_type: traveler, duration_days: 3, cover_image_path: null, status: 'published', stops: [{ id: crypto.randomUUID(), sequence: 1, name: 'Test beach', latitude: 15.49, longitude: 73.83 }] } } });
    expect(response.ok()).toBe(true);
  }
  await page.goto('/explore');
  const map = page.getByTestId('explore-map');
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(map).toHaveAttribute('data-destination', 'world');
  await expect(page.getByText('Demo journey', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: `Open journey: ${titles[0]}` })).toBeVisible();
  const marker = page.getByRole('button', { name: /Preview \d+ journeys in Test beach/ });
  await expect(marker).toHaveCount(1);
  if (info.project.name === 'mobile') await marker.tap(); else await marker.click();
  const preview = page.locator('#explore-marker-preview');
  await expect(preview).toBeFocused();
  await expect(preview.getByRole('heading', { name: titles[0], exact: true })).toBeVisible();
  await expect(preview).toContainText('Test Creator');
  const view = preview.getByRole('link', { name: new RegExp(`View Journey.*${titles[0]}`) });
  // Grouped previews deliberately scroll rather than covering the mobile map.
  // Reach this journey when earlier fixtures occupy the first visible rows.
  await view.scrollIntoViewIfNeeded();
  if (info.project.name === 'mobile') {
    const rect = await view.boundingBox();
    const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox();
    expect(rect!.y + rect!.height).toBeLessThan(nav!.y);
  }
  await page.screenshot({ path: info.outputPath('world-preview.png') });
  await preview.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(marker).toBeFocused();
  await marker.press('Enter');
  await expect(preview).toBeVisible();
  await view.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(titles[0]);
  await page.goto(goa);
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(map).toHaveAttribute('data-destination', 'Goa');
  const filters = page.getByRole('navigation', { name: 'Traveler type filters' });
  for (const type of ['Couple', 'Friends', 'Solo']) {
    await filters.getByRole('link', { name: type, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`traveler=${type.toLowerCase()}`));
    await expect(map).toHaveAttribute('data-destination', 'Goa');
    expect(new URL(page.url()).searchParams.get('mapbox')).toBe('test-goa');
    const cards = page.getByTestId('journey-card');
    if (type === 'Solo') await expect(cards).toHaveCount(0);
    else { await expect(cards.first()).toHaveAttribute('data-traveler', type.toLowerCase()); }
  }
  await page.reload();
  await expect(filters.getByRole('link', { name: 'Solo', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'No journeys here yet.' })).toBeVisible();
  await page.goBack();
  await expect(filters.getByRole('link', { name: 'Friends', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(filters.getByRole('link', { name: 'Solo', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goto('/explore?destination=Paris&label=Paris%2CFrance&mapbox=test-paris&lat=48.85&lng=2.35&type=place');
  await expect(page.getByRole('heading', { name: 'No journeys here yet.' })).toBeVisible();
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(map).toHaveAttribute('data-destination', 'Paris');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('paris-empty.png'), fullPage: true });
  expect(errors).toEqual([]);
});
