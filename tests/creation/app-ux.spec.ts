import { expect, test } from '@playwright/test';

test('first-visit welcome is optional, persistent, and never blocks navigation', async ({ page, context }, info) => {
  await page.goto('/');
  const welcome = page.getByRole('complementary', { name: 'Welcome to Journey Creator' });
  await expect(welcome).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search destinations' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('first-visit.png'), fullPage: true });
  await welcome.getByRole('button', { name: 'Dismiss welcome' }).click();
  await expect(welcome).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('journeycreator:welcome:v1'))).toBe('dismissed');
  await page.reload();
  await expect(welcome).toHaveCount(0);
  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A world of journeys.');
  await page.goto('/');
  await expect(welcome).toHaveCount(0);
  const anotherTab = await context.newPage();
  await anotherTab.goto('/');
  await expect(anotherTab.getByRole('complementary', { name: 'Welcome to Journey Creator' })).toHaveCount(0);
  await anotherTab.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('welcome survives unavailable browser storage and remains once per visit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage unavailable'); } });
  });
  await page.goto('/');
  const welcome = page.getByRole('complementary', { name: 'Welcome to Journey Creator' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('link', { name: 'Explore Journeys', exact: true }).click();
  await expect(page).toHaveURL('/explore');
  await page.getByRole('link', { name: 'Journey home' }).click();
  await expect(welcome).toHaveCount(0);
});

test('contextual login, narrow navigation, empty collections and sticky creation controls', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/journey/demo-goa-couple');
  const nav = page.getByRole('navigation', { name: info.project.name === 'mobile' ? 'Mobile navigation' : 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Explore', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const [action, message] of [['Save', 'Sign in to save'], ['Like journey', 'Sign in to like'], ['Remix This Journey', 'Sign in to remix']]) {
    const trigger = page.getByRole('button', { name: action, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Log in to continue' });
    await expect(dialog).toContainText(message);
    await expect(dialog.getByRole('button', { name: 'Continue Exploring' })).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await page.getByRole('link', { name: 'Use This Journey', exact: true }).click();
  await expect(page).toHaveURL(/#journey-route$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Create Journey', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=.*create/);
  // A dedicated fixture account remains empty across desktop/mobile regression runs.
  const owner = '10000000-0000-0000-0000-000000000003';
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'creator@example.com', app_metadata: { provider: 'email' }, user_metadata: { display_name: 'A traveler with a considerably longer display name' } };
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
  await page.goto('/saved');
  await expect(page.getByRole('heading', { name: 'No saved journeys yet.' })).toBeVisible();
  await page.getByRole('link', { name: 'Explore Journeys', exact: true }).click();
  await expect(page).toHaveURL('/explore');
  await page.goto('/profile/new_creator');
  await expect(page.getByRole('heading', { name: 'No published journeys yet.' })).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Create Journey', exact: true }).click();
  await expect(page).toHaveURL('/create');
  const publish = page.getByRole('button', { name: 'Publish Journey', exact: true });
  await publish.scrollIntoViewIfNeeded();
  await expect(publish).toBeVisible();
  if (info.project.name === 'mobile') {
    const rect = (await publish.boundingBox())!, bottomNav = (await nav.boundingBox())!;
    expect(rect.y + rect.height).toBeLessThan(bottomNav.y);
    await expect(nav.getByRole('link', { name: 'Create Journey', exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await page.screenshot({ path: info.outputPath('creation-controls.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
