import { expect, test } from '@playwright/test';

test('unified Explore story search works without a Mapbox connection', async ({ page }) => {
  await page.goto('/explore?sort=recent&traveler=solo&page=2');
  const input = page.getByRole('combobox', { name: 'Search journeys, places or travelers', exact: true });
  await expect(page.locator('main input[type=search]')).toHaveCount(1);
  await input.fill('No connection needed');
  await expect(page.getByRole('search').getByRole('status')).toContainText('Destination search is not connected yet');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get('q') === 'No connection needed' && url.searchParams.get('sort') === 'recent' && url.searchParams.get('traveler') === 'solo' && !url.searchParams.has('page'));
  await expect(page.getByRole('heading', { name: 'No journeys found.' })).toBeVisible();
  await expect(input).toHaveValue('No connection needed');
  // Existing SEO omits a canonical when no public HTTPS origin is configured.
  await expect(page.locator('link[rel=canonical]')).toHaveCount(0);
});
