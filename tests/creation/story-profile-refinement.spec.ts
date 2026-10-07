import { test, expect } from '@playwright/test';

const viewports = [
  { width: 360, height: 800 }, { width: 390, height: 844 },
  { width: 412, height: 915 }, { width: 844, height: 390 },
  { width: 1280, height: 900 }, { width: 1440, height: 1000 },
];
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: '10000000-0000-0000-0000-000000000001', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;

test('story and traveler collection remain readable across all requested viewports', async ({ page, request }, info) => {
  test.setTimeout(120000);
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const headers = { Authorization: `Bearer ${token}` };
  const title = `Refinement story ${info.project.name}`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = () => { throw new Error('Story must not start GPS'); };
    navigator.geolocation.getCurrentPosition = () => { throw new Error('Story must not request GPS'); };
  });
  try {
    for (const [index, id] of ids.entries()) {
      const response = await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers, data: { payload: {
        id, title: index ? 'Private refinement story' : title, status: index ? 'draft' : 'published',
        destination_slug: 'worldwide', destination_name: 'Kyoto, Japan', destination_latitude: 35, destination_longitude: 135,
        traveler_type: 'solo', duration_days: 2, description: 'A quiet weekend exploring Kyoto.', cover_image_path: '/images/kochi.jpg',
        stops: [1, 2, 3].map((sequence) => ({ id: crypto.randomUUID(), name: `Place ${sequence}`, sequence,
          latitude: 35 + sequence / 100, longitude: 135 + sequence / 100,
          day_number: sequence < 3 ? 1 : 2, description: sequence === 1 ? 'Morning by the river.' : '',
          photo_path: sequence === 1 ? '/images/kochi.jpg' : null, rating: sequence === 1 ? 4.5 : null })),
      } } });
      expect(response.ok()).toBe(true);
    }
    const html = await (await request.get('/journey/' + ids[0])).text();
    for (const content of [title, 'Kyoto, Japan', 'Morning by the river.', 'Place 1']) expect(html).toContain(content);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/journey/${ids[0]}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) }).getByRole('link').first()).toHaveAttribute('href', '/profile/creator_a');
      await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
      await expect(page.getByTestId('story-day')).toHaveText(['Day 1', 'Day 2']);
      await expect(page.getByTestId('journey-stop').getByRole('heading')).toHaveText(['Place 1', 'Place 2', 'Place 3']);
      await expect(page.getByRole('region', { name: 'Journey summary' })).toContainText('A quiet weekend exploring Kyoto.');
      await expect(page.getByText('Kyoto, Japan', { exact: true })).toBeVisible();
      await expect(page.getByTestId('journey-map')).toHaveAttribute('data-navigation', 'none');
      await expect(page.getByRole('button', { name: 'Center on me', exact: true })).toHaveCount(0);
      const photo = page.getByTestId('journey-stop').first().getByRole('img');
      await photo.scrollIntoViewIfNeeded();
      await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const blank = page.getByTestId('journey-stop').nth(1);
      await expect(blank.getByRole('img')).toHaveCount(0);
      await expect(blank).not.toContainText('rating');
      await expect(page.getByTestId('journey-stop').first()).toContainText('4.5 / 5');
      expect(await page.evaluate(() => {
        const header = document.querySelector('article header')!;
        const map = document.getElementById('journey-route')!;
        const summary = document.querySelector('[aria-label="Journey summary"]')!;
        const actions = document.querySelector('[aria-label="Journey actions"]')!;
        return !!(header.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING)
          && !!(map.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING)
          && !!(summary.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING);
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`story-${viewport.width}x${viewport.height}.png`), fullPage: true });
      await page.getByRole('link', { name: 'Use This Journey', exact: true }).click();
      await expect(page).toHaveURL(/#journey-route$/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.goto('/profile/creator_a?tab=drafts');
      await expect(page.getByRole('region', { name: 'Traveler profile' })).toContainText('@creator_a');
      await expect(page.getByRole('link', { name: `Open journey: ${title}` })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open journey: Private refinement story' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Drafts', exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Edit Profile', exact: true })).toHaveCount(0);
      await expect(page.getByTestId('journey-card').filter({ hasText: title })).toContainText('Kyoto, Japan');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`profile-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
    await page.goto(`/journey/${ids[1]}`);
    await expect(page.getByTestId('journey-stop')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    for (const id of ids) await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`, { headers });
  }
});

test('empty public collection has no bio placeholder or private controls', async ({ page }) => {
  await page.goto('/profile/new_creator');
  await expect(page.getByRole('heading', { name: 'No public journeys yet.', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Traveler profile' })).toContainText('0 public journeys');
  await expect(page.getByRole('navigation', { name: 'Profile journeys' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Traveler profile' }).locator('p')).toHaveCount(2);
});
