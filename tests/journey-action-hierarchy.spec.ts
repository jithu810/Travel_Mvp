import { expect, test } from '@playwright/test';
import { mockGeolocation, gpsCounts } from './fixtures/geolocation';

const viewports = [
  { width: 360, height: 800 }, { width: 390, height: 844 },
  { width: 412, height: 915 }, { width: 844, height: 390 },
  { width: 1280, height: 900 }, { width: 1440, height: 1000 },
];

test('travel, social and journey options have a clear accessible hierarchy at all six sizes', async ({ page }, info) => {
  await mockGeolocation(page);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/journeys/')) writes.push(request.url()); });
  await page.route('**/api/journeys/*/actions', route => route.fulfill({ json: { user: null, liked: false, saved: false, likes: 4 } }));
  await page.goto('/journey/demo-goa-couple');
  const actions = page.getByRole('region', { name: 'Journey actions', exact: true });
  const primary = actions.getByRole('link', { name: 'Start Journey', exact: false });
  const preview = actions.getByRole('link', { name: 'Preview Travel Mode', exact: true });
  const social = actions.getByRole('group', { name: 'Social actions' });
  const options = actions.getByRole('region', { name: 'Journey options' });
  await expect(primary).toHaveAttribute('href', '/travel/demo-goa-couple');
  await expect(preview).toHaveAttribute('href', '/travel/demo-goa-couple');
  await expect(options.getByRole('link', { name: 'Use This Journey', exact: true })).toHaveAttribute('href', '#journey-route');
  await expect(primary).toHaveClass(/bg-brand/);
  await expect(preview).not.toHaveClass(/bg-brand/);
  await expect(options.getByRole('link')).not.toHaveClass(/bg-brand/);
  await expect(options.getByRole('button')).not.toHaveClass(/bg-brand/);
  expect(await social.getByRole('button').allTextContents()).toEqual(['♡ 4 likes', 'Save', 'Share ↗']);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await primary.scrollIntoViewIfNeeded();
    const start = (await primary.boundingBox())!;
    expect(start.height).toBeGreaterThanOrEqual(48);
    expect(start.x).toBeGreaterThanOrEqual(0);
    expect(start.x + start.width).toBeLessThanOrEqual(viewport.width);
    expect(start.y).toBeGreaterThanOrEqual(0);
    expect(start.y + start.height).toBeLessThanOrEqual(viewport.height);
    const controls = [primary, preview, ...await social.getByRole('button').all(), options.getByRole('link'), options.getByRole('button')];
    for (const control of controls) {
      const rect = (await control.boundingBox())!;
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    const rows = await social.getByRole('button').evaluateAll(buttons => buttons.map(button => Math.round(button.getBoundingClientRect().top)));
    expect(new Set(rows).size).toBe(1);
    await primary.focus();
    await page.keyboard.press('Tab');
    await expect(preview).toBeFocused();
    expect(await preview.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
    const creator = page.getByRole('region', { name: 'About the creator' });
    expect(await actions.evaluate((element, creator) => !!(element.compareDocumentPosition(creator as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await creator.elementHandle())).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await preview.evaluate(element => (element as HTMLElement).blur());
    await actions.screenshot({ path: info.outputPath(`actions-${viewport.width}x${viewport.height}.png`) });
  }
  expect((await gpsCounts(page)).watches).toBe(0);
  await options.getByRole('link', { name: 'Use This Journey', exact: true }).click();
  await expect(page).toHaveURL(/#journey-route$/);
  expect(writes).toEqual([]);
});

test('Start and Preview retain the existing entry flow; only starting in Travel Mode enables GPS', async ({ page }) => {
  await mockGeolocation(page);
  const errors: string[] = [];
  const writes: string[] = [];
  const navigation: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/journeys\/.+\/track/.test(request.url())) writes.push(request.url());
    if (request.url().includes('/directions/')) navigation.push(request.url());
  });
  for (const name of ['Preview Travel Mode', 'Start Journey']) {
    await page.goto('/journey/demo-goa-couple');
    await page.getByRole('link', { name }).click();
    await expect(page).toHaveURL('/travel/demo-goa-couple');
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'NOT_STARTED');
    expect((await gpsCounts(page)).watches).toBe(0);
    expect(writes).toEqual([]);
    expect(navigation).toEqual([]);
  }
  await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
  await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'ACTIVE');
  await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
  expect(errors).toEqual([]);
});
