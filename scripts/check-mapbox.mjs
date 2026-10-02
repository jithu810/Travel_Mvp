import fs from 'node:fs';
import { chromium } from '@playwright/test';
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.example']) {
  if (!fs.existsSync(file)) continue;
  const match = fs.readFileSync(file, 'utf8').match(/^NEXT_PUBLIC_MAPBOX_TOKEN\s*=\s*(.*)$/m);
  const token = match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  console.log(JSON.stringify({ file, tokenPresent: !!token, publicToken: token?.startsWith('pk.'), length: token?.length }));
}
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage();
page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') console.log('Browser console:', message.text().replace(/pk\.[\w.-]+/g, '[token]')); });
page.on('pageerror', error => console.log('Browser error:', error.message.replace(/pk\.[\w.-]+/g, '[token]')));
page.on('response', response => { if (response.url().includes('mapbox.com')) console.log('Mapbox response:', response.status(), new URL(response.url()).pathname); });
page.on('requestfailed', request => { if (request.url().includes('mapbox.com')) console.log('Mapbox network failure:', request.failure()?.errorText); });
await page.goto('http://localhost:3000');
const link = page.locator('a[href^="/journey/"]').first();
await link.click();
await page.waitForTimeout(15000);
console.log('Map canvas:', await page.locator('.mapboxgl-canvas').count());
console.log('Fallback visible:', await page.getByText('Route overview · Geographic map unavailable').count());
await browser.close();
