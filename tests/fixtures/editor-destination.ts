import { expect, type Page } from '@playwright/test';
import { getDestination } from '../../src/lib/discovery/destinations';
export async function selectEditorDestination(page: Page, slug: string) {
  const place = getDestination(slug)!;
  await page.route(url => url.pathname.endsWith('/search/geocode/v6/forward') && !!url.searchParams.get('types'), route => route.fulfill({ json: { features: [{ id: `destination-${slug}`, geometry: { coordinates: [place.longitude, place.latitude] }, properties: { name: place.name, full_address: place.name, feature_type: 'place' } }] } }));
  await page.getByRole('combobox', { name: 'Destination', exact: true }).fill(place.name);
  await page.getByRole('option', { name: place.name, exact: true }).click();
  await expect(page.getByText(`Selected destination: ${place.name}`, { exact: false })).toBeVisible();
}
