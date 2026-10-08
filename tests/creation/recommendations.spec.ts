import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
const owner = '10000000-0000-0000-0000-000000000001', other = '10000000-0000-0000-0000-000000000002', fresh = '10000000-0000-0000-0000-000000000003';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(id: string) { return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`; }
const headers = (id: string) => ({ Authorization: `Bearer ${token(id)}` });
async function login(context: BrowserContext, id: string) {
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token(id), refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: { provider: 'email' }, user_metadata: {} } })}`, domain: 'localhost', path: '/' }]);
}
async function seed(request: APIRequestContext, title: string, creator = other, status = 'published', destination = 'goa', traveler = 'couple') {
  const id = crypto.randomUUID();
  expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers: headers(creator), data: { payload: { id, title, destination_slug: destination, traveler_type: traveler, duration_days: 2, status, cover_image_path: '/images/goa.jpg', stops: Array.from({ length: 6 }, (_, i) => ({ id: crypto.randomUUID(), sequence: i + 1, name: `Coast ${i + 1}`, latitude: destination === 'goa' ? 15.49 : 35, longitude: destination === 'goa' ? 73.83 + i / 100 : 139 + i / 100, day_number: i < 3 ? 1 : 2, description: 'A memory.', photo_path: '/images/goa.jpg' })) } } })).ok()).toBe(true);
  return id;
}
async function relation(request: APIRequestContext, table: string, user: string, journey: string) { expect((await request.post(`http://127.0.0.1:54329/rest/v1/${table}`, { headers: headers(user), data: { user_id: user, journey_id: journey } })).ok()).toBe(true); }

test('own likes/saves personalize Home without leaking history across users or public SEO', async ({ page, request, context, browser }, info) => {
  test.setTimeout(180000);
  const prefix = `Recommendations ${info.project.name} ${Date.now()}`, ids: [string, string][] = [];
  try {
    const source = await seed(request, prefix + ' saved source'); ids.push([source, other]);
    const liked = await seed(request, prefix + ' liked source'); ids.push([liked, other]);
    const target = await seed(request, prefix + ' similar coastal weekend'); ids.push([target, other]);
    const own = await seed(request, prefix + ' owned journey', owner); ids.push([own, owner]);
    const privateId = await seed(request, prefix + ' private secret', owner, 'draft'); ids.push([privateId, owner]);
    const foreign = await seed(request, prefix + ' other saved source', fresh, 'published', 'worldwide', 'solo'); ids.push([foreign, fresh]);
    await relation(request, 'saved_journeys', owner, source); await relation(request, 'journey_likes', owner, liked);
    await relation(request, 'saved_journeys', other, foreign);
    await login(context, owner); await page.goto('/');
    const section = page.getByRole('region', { name: 'Journeys you may like.' });
    await expect(section).toBeVisible(); await expect(section.getByRole('link', { name: `Open journey: ${prefix} similar coastal weekend` })).toBeVisible();
    await expect(section).not.toContainText(prefix + ' owned journey'); await expect(section).not.toContainText(prefix + ' private secret');
    await expect(section).toContainText('Similar to journeys you saved');
    await expect(section.getByTestId('journey-card')).toHaveCount(3);
    const publicRows = await (await request.post('http://127.0.0.1:54329/rest/v1/rpc/get_public_journeys', { data: { journey_filter: target } })).json();
    const creatorHref = `/profile/${encodeURIComponent(publicRows[0].creator_username)}`;
    await expect(section.locator(`a[href="${creatorHref}"]`)).not.toHaveCount(0);
    const url = await section.getByRole('link', { name: /^Open journey:/ }).first().getAttribute('href');
    await section.getByRole('link', { name: /^Open journey:/ }).first().click(); await expect(page).toHaveURL(url!);
    await expect(page.getByRole('link', { name: 'Use This Journey', exact: true })).toHaveAttribute('href', '#journey-route');
    await expect(page.getByRole('button', { name: 'Remix This Journey', exact: true })).toBeEnabled();
    const anonymous = await browser.newContext({ baseURL: 'http://localhost:3200' }); const anonPage = await anonymous.newPage();
    await anonPage.goto('/'); await expect(anonPage.getByRole('region', { name: 'Journeys you may like.' })).toHaveCount(0);
    expect(await anonPage.content()).not.toContain('Similar to journeys you saved');
    await expect(anonPage.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://journey.example');
    await anonymous.close();
    await context.clearCookies(); await login(context, fresh); await page.goto('/');
    await expect(page.getByRole('region', { name: 'Journeys you may like.' })).toHaveCount(0);
    expect(await page.content()).not.toContain('Similar to journeys you saved');
    expect(await page.content()).not.toContain('"contentKey"');
  } finally { for (const [id, creator] of ids) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers: headers(creator) }); }
});

test('recommendation cards wrap, remain keyboard accessible and preserve Home discovery at six viewports', async ({ page, request, context }, info) => {
  test.setTimeout(240000); const ids: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { navigator.geolocation.watchPosition = () => { throw new Error('Home must not start GPS'); }; navigator.geolocation.getCurrentPosition = () => { throw new Error('Home must not request GPS'); }; });
  try {
    const source = await seed(request, 'Saved interest ' + crypto.randomUUID()); ids.push(source);
    for (let i = 0; i < 3; i++) ids.push(await seed(request, `${'Coastal'.repeat(24)} ${i}`));
    await relation(request, 'saved_journeys', owner, source); await login(context, owner);
    for (const [width, height] of [[360,800],[390,844],[412,915],[844,390],[1280,900],[1440,1000]]) {
      await page.setViewportSize({ width, height }); await page.goto('/');
      const section = page.getByRole('region', { name: 'Journeys you may like.' });
      await expect(section.getByTestId('journey-card')).toHaveCount(3);
      const card = section.getByRole('link', { name: /^Open journey:/ }).first(); await card.focus(); await expect(card).toBeFocused();
      expect((await card.boundingBox())!.width).toBeGreaterThan(230);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await section.scrollIntoViewIfNeeded(); await section.screenshot({ path: info.outputPath(`recommendations-${width}.png`) });
      await expect(page.getByRole('heading', { name: 'Popular with travelers.', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Recently published.', exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Search destinations' })).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://journey.example');
    }
    expect(errors).toEqual([]);
  } finally { for (const id of ids) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers: headers(other) }); }
});
