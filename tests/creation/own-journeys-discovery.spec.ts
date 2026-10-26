import { test, expect, type APIRequestContext, type BrowserContext, type Locator, type Page } from '@playwright/test';

const viewer = '10000000-0000-0000-0000-000000000001', other = '10000000-0000-0000-0000-000000000002', fresh = '10000000-0000-0000-0000-000000000003';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(id: string) { return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`; }
const headers = (id: string) => ({ Authorization: `Bearer ${token(id)}` });
async function login(context: BrowserContext, id: string, accessToken = token(id)) {
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: accessToken, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: { provider: 'email' }, user_metadata: {} } })}`, domain: 'localhost', path: '/' }]);
}
// A remote destination no other spec publishes to keeps scoped counts exact.
const place = { name: 'Point Nemo Reach', latitude: -48.876, longitude: -123.393 };
const scoped = `destination=${encodeURIComponent(place.name)}&label=${encodeURIComponent(place.name + ', Pacific Ocean')}&mapbox=own-discovery-nemo&lat=${place.latitude}&lng=${place.longitude}&type=place`;
const traveler = 'solo';
async function seed(request: APIRequestContext, title: string, creator: string) {
  const id = crypto.randomUUID();
  expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers: headers(creator), data: { payload: { id, title, description: 'An ocean story.', destination_slug: 'worldwide', destination_name: place.name, destination_latitude: place.latitude, destination_longitude: place.longitude, traveler_type: traveler, duration_days: 2, status: 'published', cover_image_path: null, stops: [{ id: crypto.randomUUID(), sequence: 1, name: `Buoy ${title}`, description: 'Open water.', latitude: place.latitude, longitude: place.longitude, day_number: 1, rating: 4 }] } } })).ok()).toBe(true);
  return id;
}
async function like(request: APIRequestContext, user: string, journey: string) {
  expect((await request.post('http://127.0.0.1:54329/rest/v1/journey_likes', { headers: headers(user), data: { user_id: user, journey_id: journey } })).ok()).toBe(true);
}
const card = (scope: Page | Locator, title: string) => scope.getByRole('link', { name: `Open journey: ${title}` });
const total = (page: Page) => page.getByText(/^\d+ matching journeys?$/);

test('signed-in browsing hides own journeys on Home and Explore, while search and anonymous viewers still see them', async ({ page, request, context, browser }, info) => {
  test.setTimeout(150000);
  const prefix = `Own discovery ${info.project.name} ${Date.now()}`;
  const mine = [`${prefix} mine first`, `${prefix} mine second`], theirs = `${prefix} theirs`;
  const ids: [string, string][] = [];
  try {
    for (const title of mine) ids.push([await seed(request, title, viewer), viewer]);
    // Every user likes the viewer's journeys, so without exclusion they would lead Popular.
    for (const [id] of ids) for (const user of [viewer, other, fresh]) await like(request, user, id);

    await login(context, viewer);
    // Only the viewer has published here: a filtered view keeps its existing empty title.
    await page.goto(`/explore?${scoped}`);
    await expect(page.getByTestId('journey-card')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No journeys here yet.', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No journeys from other travelers yet.' })).toHaveCount(0);

    // Seed the other traveler last so it is the newest published journey.
    ids.push([await seed(request, theirs, other), other]);
    for (const user of [viewer, fresh]) await like(request, user, ids[2][0]);

    await page.goto('/');
    await expect(page.getByText('Most liked among other travelers’ latest 100 journeys.')).toBeVisible();
    await expect(card(page.getByRole('region', { name: 'Recently published.' }), theirs)).toBeVisible();
    for (const title of mine) await expect(card(page, title)).toHaveCount(0);

    for (const path of ['/explore', '/explore?sort=recent', '/explore?q=%20%20', `/explore?traveler=${traveler}`]) {
      await page.goto(path);
      await expect(card(page, theirs), path).toBeVisible();
      for (const title of mine) await expect(card(page, title), path).toHaveCount(0);
    }
    await page.goto('/explore?sort=popular');
    for (const title of mine) await expect(card(page, title)).toHaveCount(0);
    for (const path of [`/explore?${scoped}`, `/explore?${scoped}&sort=popular`, `/explore?${scoped}&traveler=${traveler}`]) {
      await page.goto(path);
      await expect(page.getByTestId('journey-card'), path).toHaveCount(1);
      await expect(card(page, theirs), path).toBeVisible();
      await expect(total(page), path).toHaveText('1 matching journey');
    }

    // A text search still finds the viewer's own published journeys.
    await page.goto(`/explore?q=${encodeURIComponent(mine[0])}`);
    await expect(page.getByTestId('journey-card')).toHaveCount(1);
    await expect(card(page, mine[0])).toBeVisible();
    await page.goto(`/explore?q=${encodeURIComponent(prefix)}`);
    await expect(page.getByTestId('journey-card')).toHaveCount(3);
    for (const title of [...mine, theirs]) await expect(card(page, title)).toBeVisible();

    // An invalid session falls back to anonymous discovery without crashing.
    const invalid = await browser.newContext({ baseURL: 'http://localhost:3200' });
    try {
      await login(invalid, viewer, 'not-a-valid-token');
      const invalidPage = await invalid.newPage();
      await invalidPage.goto('/');
      for (const title of [...mine, theirs]) await expect(card(invalidPage.getByRole('region', { name: 'Recently published.' }), title)).toBeVisible();
    } finally { await invalid.close(); }

    const anonymous = await browser.newContext({ baseURL: 'http://localhost:3200' });
    try {
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto('/');
      await expect(anonymousPage.getByText('Most liked among the latest 100 public journeys.')).toBeVisible();
      for (const title of [...mine, theirs]) await expect(card(anonymousPage.getByRole('region', { name: 'Recently published.' }), title)).toBeVisible();
      await anonymousPage.goto('/explore?sort=recent');
      for (const title of [...mine, theirs]) await expect(card(anonymousPage, title)).toBeVisible();
      // Same scoped URLs: the signed-in total is lower by exactly the viewer's two journeys.
      for (const path of [`/explore?${scoped}`, `/explore?${scoped}&sort=popular`, `/explore?${scoped}&traveler=${traveler}`]) {
        await anonymousPage.goto(path);
        await expect(anonymousPage.getByTestId('journey-card'), path).toHaveCount(3);
        await expect(total(anonymousPage), path).toHaveText('3 matching journeys');
      }
    } finally { await anonymous.close(); }
  } finally {
    for (const [id, creator] of ids) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers: headers(creator) });
  }
});
