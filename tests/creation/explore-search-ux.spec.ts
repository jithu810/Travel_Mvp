import { expect, test } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const headers = { Authorization: `Bearer ${token}` };
const goa = { id: 'unified-goa', geometry: { coordinates: [73.83, 15.49] }, properties: { name: 'Goa', full_address: 'Goa, India', feature_type: 'region', bbox: [73, 14, 75, 16] } };

test('one Explore search supports literal Enter, story suggestions, destination keyboard selection and URL history', async ({ page, request }, info) => {
  const id = crypto.randomUUID(), title = `Unified coast ${info.project.name} ${Date.now()}`;
  expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: { id, title, destination_slug: 'goa', traveler_type: 'couple', duration_days: 2, status: 'published', cover_image_path: null, stops: [{ id: crypto.randomUUID(), sequence: 1, name: 'Varkala memory', latitude: 15.49, longitude: 73.83, day_number: 1 }] } } })).ok()).toBe(true);
  try {
    await page.route('**/search/geocode/v6/forward?**', route => route.fulfill({ json: { features: [goa] } }));
    await page.goto('/explore?sort=popular&traveler=couple&page=2');
    const input = page.getByRole('combobox', { name: 'Search journeys, places or travelers', exact: true });
    await expect(page.locator('main input[type=search]')).toHaveCount(1);
    await expect(page.getByRole('search')).toHaveCount(1);
    await expect(input).toHaveAttribute('placeholder', 'Search journeys, places or travelers...');
    await input.fill(title);
    await expect(page.getByRole('option', { name: 'Goa, India', exact: true })).toBeVisible();
    // Enter searches the typed story even when a destination suggestion is available.
    await input.press('Enter');
    await expect(page).toHaveURL(url => url.searchParams.get('q') === title && !url.searchParams.has('destination') && !url.searchParams.has('page'));
    await expect(page.getByTestId('journey-card')).toContainText(title);
    expect(new URL(page.url()).searchParams.get('sort')).toBe('popular');
    expect(new URL(page.url()).searchParams.get('traveler')).toBe('couple');
    await input.fill('Varkala memory');
    await page.getByRole('option', { name: /Search for “Varkala memory”/ }).click();
    await expect(page).toHaveURL(url => url.searchParams.get('q') === 'Varkala memory');
    await expect(page.getByRole('link', { name: `Open journey: ${title}` })).toBeVisible();
    await page.goBack();
    await expect(input).toHaveValue(title);
    await input.fill('Goa');
    const destination = page.getByRole('option', { name: 'Goa, India', exact: true });
    await expect(destination).toBeVisible();
    await input.press('ArrowDown');
    await expect(destination).toHaveAttribute('aria-selected', 'true');
    await input.press('Enter');
    await expect(page).toHaveURL(/destination=Goa/);
    // Existing destination selection keeps the current story and filter context.
    expect(new URL(page.url()).searchParams.get('q')).toBe(title);
    await expect(page.getByTestId('journey-card')).toContainText(title);
    await input.fill('creator_a');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(url => url.searchParams.get('q') === 'creator_a' && url.searchParams.get('destination') === 'Goa');
    await expect(page.getByRole('link', { name: `Open journey: ${title}` })).toBeVisible();
    await page.reload(); await expect(input).toHaveValue('creator_a');
    await input.fill(''); await input.press('Enter');
    await expect(page).toHaveURL(url => !url.searchParams.has('q') && url.searchParams.get('destination') === 'Goa');
    await expect(input).toHaveValue('');
  } finally { await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }
});

test('journey search remains available when destination suggestions fail and destinations can retry', async ({ page }) => {
  let fail = true;
  await page.route('**/search/geocode/v6/forward?**', route => route.fulfill(fail ? { status: 503, json: { message: 'Unavailable' } } : { json: { features: [goa] } }));
  await page.goto('/explore');
  const input = page.getByRole('combobox', { name: 'Search journeys, places or travelers', exact: true });
  await input.fill('Unfindable search UX story');
  await expect(page.locator('main').getByRole('alert')).toContainText('Destination search is unavailable');
  await input.press('Enter');
  await expect(page).toHaveURL(url => url.searchParams.get('q') === 'Unfindable search UX story');
  await expect(page.getByRole('heading', { name: 'No journeys found.' })).toBeVisible();
  await input.fill('Goa');
  await expect(page.getByRole('button', { name: 'Retry destinations' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry destinations' }).click();
  await expect(page.getByRole('option', { name: 'Goa, India', exact: true })).toBeVisible();
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue('Goa');
  await input.press('Enter');
  await expect(page).toHaveURL(url => url.searchParams.get('q') === 'Goa' && !url.searchParams.has('destination'));
});
