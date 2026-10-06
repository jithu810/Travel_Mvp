import { test, expect, type BrowserContext } from '@playwright/test';
import sharp from 'sharp';
import { selectEditorDestination } from '../fixtures/editor-destination';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
async function authenticate(context: BrowserContext) {
  const user = { id: '10000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'creator@example.com', app_metadata: { provider: 'email' }, user_metadata: {} };
  const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })}.test-signature`;
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
}

test('camera-sized cover and GPS stop use the secure pipeline, preserve metadata and remain editable after refresh', async ({ page, context }) => {
  await authenticate(context);
  // WebKit's automation request body omits binary multipart parts. Inspect the
  // actual browser FormData before sending, then continue the real secured POST.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).endsWith('/images') && args[1]?.body instanceof FormData) {
        const file = args[1].body.get('file') as File;
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        (window as unknown as { capturedPhoto: unknown }).capturedPhoto = { name: file.name, type: file.type, size: file.size, bytes: btoa(binary) };
      }
      return original(...args);
    };
  });
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success: PositionCallback) { success({ coords: { latitude: 8.75, longitude: 76.71, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition); }, watchPosition() { throw new Error('No persistent capture watcher'); } } }));
  await page.goto('/create');
  await page.getByLabel('Journey title', { exact: true }).fill('Camera photo reliability');
  await selectEditorDestination(page, 'varkala');
  await page.getByRole('button', { name: /Solo/ }).click();
  await page.getByLabel('Journey title', { exact: true }).fill('Camera photo reliability');
  const original = await sharp({ create: { width: 4032, height: 3024, channels: 3, background: '#2f815a' } }).jpeg().toBuffer();
  const camera = Buffer.concat([original, Buffer.alloc(8 * 1024 * 1024)]);
  let uploads = 0;
  await page.route('**/api/journeys/*/images', async route => {
    uploads++;
    const file = await page.evaluate(() => (window as unknown as { capturedPhoto: { name: string; type: string; size: number; bytes: string } }).capturedPhoto);
    expect(file.type).toBe('image/jpeg'); expect(file.name).toMatch(/\.jpg$/);
    expect(file.size).toBeLessThan(camera.length / 2);
    const metadata = await sharp(Buffer.from(file.bytes, 'base64')).metadata();
    expect([metadata.width, metadata.height]).toEqual([2048,1536]);
    await expect(page.getByTestId('photo-progress')).toHaveText('Uploading photo…');
    await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeDisabled();
    await route.continue();
  });
  let id: string | null = null;
  try {
    await page.getByLabel('Cover image (optional)').setInputFiles({ name: 'camera.jpeg', mimeType: 'image/jpeg', buffer: camera });
    await expect(page.getByRole('status').filter({ hasText: 'Photo uploaded and draft saved.' })).toBeVisible({ timeout: 20000 });
    id = new URL(page.url()).searchParams.get('draft');
    await page.getByRole('button', { name: /Use my current location/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose stop location' });
    await dialog.getByLabel('Stop name').fill('Hotel photo');
    await dialog.getByRole('button', { name: 'Save stop location' }).click();
    const card = page.getByTestId('editor-stop').last();
    const stopId = await card.getAttribute('data-stop-id');
    await card.getByLabel('Stop description').fill('Recorded at the hotel');
    await card.getByLabel('Rating (optional)').fill('4.5');
    await card.getByLabel('Stop photo (optional)').evaluate((input, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], 'camera.jpeg', { type: 'image/jpeg' }));
      for (let i = 0; i < 2; i++) { (input as HTMLInputElement).files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
    }, camera.toString('base64'));
    await expect(card.getByRole('status').filter({ hasText: 'Photo uploaded and draft saved.' })).toBeVisible();
    expect(uploads).toBe(2);
    await page.reload();
    await expect(card).toHaveAttribute('data-stop-id', stopId!);
    await card.getByText('Details & photo', { exact: true }).click();
    await expect(card.getByLabel('Stop description')).toHaveValue('Recorded at the hotel');
    await expect(card.getByLabel('Rating (optional)')).toHaveValue('4.5');
    await expect(card.getByRole('button', { name: 'Remove stop photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { if (id) await page.request.delete(`/api/journeys/${id}`, { headers: { Origin: 'http://localhost:3200' } }); }
});

test('invalid photos do not upload and non-JSON hosting errors are friendly and retryable', async ({ page, context }) => {
  await authenticate(context); await page.goto('/create');
  await page.getByLabel('Journey title', { exact: true }).fill('Retry safely');
  await selectEditorDestination(page, 'varkala'); await page.getByRole('button', { name: /Solo/ }).click();
  await page.getByLabel('Journey title', { exact: true }).fill('Retry safely');
  let uploads = 0;
  await page.route('**/api/journeys/*/images', route => { uploads++; return route.fulfill({ status: 413, contentType: 'text/plain', body: 'FUNCTION_PAYLOAD_TOO_LARGE' }); });
  const input = page.getByLabel('Cover image (optional)');
  await input.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255,216,255,0,0,0]) });
  await expect(page.locator('p[role="alert"]')).toContainText("couldn't be processed"); expect(uploads).toBe(0);
  await input.setInputFiles({ name: 'large.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(15*1024*1024+1) });
  await expect(page.locator('p[role="alert"]')).toContainText('15 MB'); expect(uploads).toBe(0);
  const jpeg = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#f5a' } }).jpeg().toBuffer();
  await input.setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('p[role="alert"]')).toContainText('still too large to upload'); expect(uploads).toBe(1);
  await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Journey title', { exact: true })).toHaveValue('Retry safely');
  const id = new URL(page.url()).searchParams.get('draft');
  if (id) await page.request.delete(`/api/journeys/${id}`, { headers: { Origin: 'http://localhost:3200' } });
});
