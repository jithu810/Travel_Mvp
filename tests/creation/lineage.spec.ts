import { test, expect, type APIRequestContext } from '@playwright/test';
const owner = '10000000-0000-0000-0000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const headers = { Authorization: `Bearer ${token}` };
async function create(request: APIRequestContext, title: string) {
  const id = crypto.randomUUID();
  expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: { id, title, destination_slug: 'goa', traveler_type: 'friends', duration_days: 1, status: 'published', stops: [{ id: crypto.randomUUID(), name: 'Coastal memory', sequence: 1, latitude: 15.49, longitude: 73.83, description: 'The original experience.', day_number: 1 }] } } })).ok()).toBe(true);
  return id;
}
async function remix(request: APIRequestContext, source: string, title: string, status = 'published') {
  const response = await request.post('http://127.0.0.1:54329/rest/v1/rpc/copy_journey', { headers, data: { source_id: source } });
  expect(response.ok()).toBe(true); const id = await response.json() as string;
  await update(request, id, { title, status }); return id;
}
async function update(request: APIRequestContext, id: string, fields: Record<string, unknown>) {
  const row = await (await request.post('http://127.0.0.1:54329/rest/v1/rpc/get_journey_detail', { headers, data: { target_id: id } })).json();
  expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: { ...row, ...fields } } })).ok()).toBe(true);
}
async function remove(request: APIRequestContext, id: string) { await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers }); }

test('original, multi-generation sources, root, public remixes and deletion remain safe', async ({ page, request }, info) => {
  test.setTimeout(120000);
  const prefix = `Lineage ${info.project.name} ${Date.now()}`, ids: string[] = [];
  try {
    const a = await create(request, prefix + ' original'); ids.push(a);
    await page.goto(`/journey/${a}`);
    await expect(page.getByRole('region', { name: 'Journey origin' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Inspired journeys' })).toHaveCount(0);
    const b = await remix(request, a, prefix + ' personal story'); ids.push(b);
    const c = await remix(request, b, prefix + ' third generation'); ids.push(c);
    const draft = await remix(request, b, prefix + ' hidden draft', 'draft'); ids.push(draft);
    await page.goto(`/journey/${c}`);
    const origin = page.getByRole('region', { name: 'Journey origin' });
    await expect(origin.getByRole('link', { name: prefix + ' personal story', exact: true })).toHaveAttribute('href', `/journey/${b}`);
    await expect(origin.getByRole('link', { name: 'By Test Creator · @creator_a' })).toHaveAttribute('href', '/profile/creator_a');
    await expect(origin.locator('details')).not.toHaveAttribute('open', '');
    await origin.getByText('Earlier inspiration', { exact: true }).click();
    await expect(origin.getByRole('link', { name: `Earlier journey: ${prefix} original` })).toHaveAttribute('href', `/journey/${a}`);
    await origin.getByRole('link', { name: prefix + ' personal story', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(prefix + ' personal story');
    const inspired = page.getByRole('region', { name: 'Inspired journeys' });
    await expect(inspired.getByRole('link', { name: `Explore inspired journey: ${prefix} third generation` })).toHaveAttribute('href', `/journey/${c}`);
    await expect(page.getByText(prefix + ' hidden draft')).toHaveCount(0);
    await inspired.getByRole('link').click(); await expect(page).toHaveURL(`/journey/${c}`);
    await page.goto(`/explore?q=${encodeURIComponent(prefix)}`);
    await expect(page.getByTestId('journey-card')).toHaveCount(3);
    await expect(page.getByRole('link', { name: `Open journey: ${prefix} hidden draft` })).toHaveCount(0);
    await page.goto('/profile/creator_a');
    await expect(page.getByRole('link', { name: `Open journey: ${prefix} personal story` })).toBeVisible();
    await update(request, a, { title: prefix + ' edited original' });
    await page.goto(`/journey/${b}`); await expect(page.getByRole('heading', { level: 1 })).toHaveText(prefix + ' personal story');
    await expect(page.getByRole('region', { name: 'Journey origin' })).toContainText(prefix + ' edited original');
    await update(request, b, { title: prefix + ' edited remix' });
    await page.goto(`/journey/${a}`); await expect(page.getByRole('heading', { level: 1 })).toHaveText(prefix + ' edited original');
    await remove(request, b);
    await page.goto(`/journey/${c}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(prefix + ' third generation');
    await expect(page.getByTestId('journey-stop')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Journey origin' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Use This Journey', exact: true })).toHaveAttribute('href', '#journey-route');
    await expect(page.getByRole('link', { name: 'Start Journey →', exact: true })).toHaveAttribute('href', `/travel/${c}`);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `https://journey.example/journey/${c}`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', new RegExp(prefix + ' third generation'));
  } finally { for (const id of ids.reverse()) await remove(request, id); }
});

test('private source stays hidden even from its signed-in owner and stops root traversal', async ({ page, request, context }, info) => {
  const prefix = `Private lineage ${info.project.name} ${Date.now()}`, ids: string[] = [];
  try {
    const a = await create(request, prefix + ' secret'); ids.push(a);
    const b = await remix(request, a, prefix + ' middle'); ids.push(b);
    const c = await remix(request, b, prefix + ' public'); ids.push(c);
    await update(request, a, { status: 'draft' });
    await page.goto(`/journey/${c}`);
    await expect(page.getByRole('region', { name: 'Journey origin' })).toContainText(prefix + ' middle');
    await expect(page.getByText('Earlier inspiration', { exact: true })).toHaveCount(0);
    await expect(page.getByText(prefix + ' secret')).toHaveCount(0);
    await page.goto(`/journey/${b}`);
    await expect(page.getByRole('region', { name: 'Journey origin' })).toHaveCount(0);
    await expect(page.getByText('no longer publicly available', { exact: false })).toHaveCount(0);
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' })}`, domain: 'localhost', path: '/' }]);
    await page.reload();
    await expect(page.getByRole('link', { name: 'Edit Journey', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Journey origin' })).toHaveCount(0);
    expect(await page.content()).not.toContain(prefix + ' secret');
    await page.goto(`/journey/${a}`);
    await expect(page.getByRole('region', { name: 'Inspired journeys' })).toHaveCount(0);
  } finally { for (const id of ids.reverse()) await remove(request, id); }
});

test('lineage sections and navigation are readable at all six required viewports', async ({ page, request }, info) => {
  test.setTimeout(180000);
  const prefix = `Lineage viewport ${info.project.name} ${Date.now()}`, ids: string[] = [];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { navigator.geolocation.watchPosition = () => { throw new Error('Story must not track GPS'); }; navigator.geolocation.getCurrentPosition = () => { throw new Error('Story must not request GPS'); }; });
  try {
    const a = await create(request, prefix + ' original'); ids.push(a);
    await update(request, a, { cover_image_path: '/images/goa.jpg' });
    const b = await remix(request, a, prefix + ' an independent coastal story with friends'); ids.push(b);
    const c = await remix(request, b, prefix + ' memories from our weekend'); ids.push(c);
    for (let i = 0; i < 4; i++) ids.push(await remix(request, b, `${prefix} supporting story ${i}`));
    for (const [width, height] of [[360,800],[390,844],[412,915],[844,390],[1280,900],[1440,1000]]) {
      await page.setViewportSize({ width, height }); await page.goto(`/journey/${b}`);
      const origin = page.getByRole('region', { name: 'Journey origin' });
      await origin.scrollIntoViewIfNeeded(); await expect(origin).toBeVisible();
      await origin.screenshot({ path: info.outputPath(`origin-${width}.png`) });
      await origin.getByRole('link', { name: 'By Test Creator · @creator_a' }).focus();
      await expect(origin.getByRole('link', { name: 'By Test Creator · @creator_a' })).toBeFocused();
      const inspired = page.getByRole('region', { name: 'Inspired journeys' });
      await expect(inspired.getByRole('link')).toHaveCount(3);
      await expect(inspired.locator('img')).toHaveCount(3);
      await inspired.scrollIntoViewIfNeeded();
      await expect.poll(() => inspired.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await inspired.screenshot({ path: info.outputPath(`inspired-${width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`lineage-${width}.png`), fullPage: true });
      const target = inspired.getByRole('link').first(); const box = await target.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
      await target.click(); await expect(page.getByRole('region', { name: 'Journey origin' })).toContainText(prefix + ' an independent coastal story with friends');
      await page.getByRole('region', { name: 'Journey origin' }).getByRole('link', { name: 'By Test Creator · @creator_a' }).click();
      await expect(page).toHaveURL('/profile/creator_a');
    }
    expect(errors).toEqual([]);
  } finally { for (const id of ids.reverse()) await remove(request, id); }
});

test('long source and remix titles wrap without overflow on small screens', async ({ page, request }) => {
  const ids: string[] = [];
  try {
    const a = await create(request, 'Coast'.repeat(40)); ids.push(a);
    const b = await remix(request, a, 'Weekend'.repeat(28)); ids.push(b);
    const c = await remix(request, b, 'Memories'.repeat(25)); ids.push(c);
    for (const width of [360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 }); await page.goto(`/journey/${b}`);
      await page.getByRole('region', { name: 'Journey origin' }).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('region', { name: 'Inspired journeys' }).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { for (const id of ids.reverse()) await remove(request, id); }
});
