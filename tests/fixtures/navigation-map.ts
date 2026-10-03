import type { Page } from '@playwright/test';

// Imported style + real slot exercises Standard's GL JS architecture without live APIs.
export const standardMock = { version: 8, sources: {}, layers: [], imports: [{ id: 'basemap', data: { version: 8,
  schema: { show3dObjects: { type: 'boolean', default: true }, show3dBuildings: { type: 'boolean', default: true }, show3dTrees: { type: 'boolean', default: false }, show3dLandmarks: { type: 'boolean', default: false }, lightPreset: { type: 'string', default: 'day' } },
  sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e7eedf' } }, { id: 'middle', type: 'slot' }],
} }] };
export async function mockNavigationMap(page: Page) {
  await page.route('**/styles/v1/mapbox/standard?*', route => route.fulfill({ json: standardMock }));
  await page.route('https://events.mapbox.com/**', route => route.fulfill({ status: 204 }));
}
