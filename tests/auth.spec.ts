import { expect, test } from '@playwright/test';
import { safeNext } from '../src/lib/auth/redirect';

test('return destinations stay inside the application', () => {
  expect(safeNext('/create')).toBe('/create');
  for (const value of ['https://example.com', '//example.com', '/\\example.com', undefined]) expect(safeNext(value)).toBe('/profile');
});

test('private pages require login while discovery stays public', async ({ page }) => {
  for (const path of ['/profile', '/create', '/saved']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
    await expect(page.getByRole('heading', { name: 'Your Journey account' })).toBeVisible();
  }
  await page.goto('/auth/callback?next=https://example.com');
  await expect(page).toHaveURL(/\/login\?error=confirmation/);
  await page.goto('/destination/goa');
  await expect(page.getByRole('heading', { name: 'Goa', exact: true })).toBeVisible();
  await page.goto('/journey/demo-goa-couple');
  await expect(page.getByRole('heading', { name: 'A little slower, a little closer', exact: true })).toBeVisible();
});

test('signup confirmation and login errors are visible (mock Auth)', async ({ page }) => {
  await page.goto('/login');
  test.skip(await page.getByLabel('Email', { exact: true }).count() === 0, 'Unconfigured preview has no Auth form.');
  await page.route('**/auth/v1/**', async route => {
    if (route.request().url().includes('/signup')) await route.fulfill({ json: { user: { id: '10000000-0000-0000-0000-000000000099', email: 'test@example.com', identities: [], user_metadata: {} }, session: null } });
    else await route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } });
  });
  await page.getByRole('button', { name: 'New to Journey? Sign up', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Test Traveler');
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('testing-password');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Check your email' })).toBeVisible();
  await page.getByRole('button', { name: 'Already have an account? Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid login credentials' })).toBeVisible();
  await expect(page).toHaveURL('/login');
});

test('login cookies survive refresh and logout clears them (mock Auth)', async ({ page, context }) => {
  await page.goto('/login?next=/explore');
  test.skip(await page.getByLabel('Email', { exact: true }).count() === 0, 'Unconfigured preview has no Auth form.');
  const user = { id: '10000000-0000-0000-0000-000000000099', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: 'Test Traveler' }, created_at: new Date().toISOString() };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await page.route('**/auth/v1/**', async route => {
    if (route.request().url().includes('/logout')) await route.fulfill({ status: 204 });
    else if (route.request().url().includes('/user')) await route.fulfill({ json: user });
    else await route.fulfill({ json: { access_token: accessToken, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user } });
  });
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('testing-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL('/explore');
  await expect(page.getByRole('link', { name: 'Your profile' })).toContainText('Test Traveler');
  expect((await context.cookies()).some(cookie => cookie.name.includes('auth-token'))).toBe(true);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Your profile' })).toContainText('Test Traveler');
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Login / Profile', exact: true })).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name.includes('auth-token'))).toBe(false);
});
