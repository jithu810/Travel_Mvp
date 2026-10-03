import type { Page } from '@playwright/test';

export function directionsResponse(origin = [77.012719183, 8.613271839], destination = [77.00279, 8.603315]) {
  const middle = [destination[0], origin[1]];
  return { code: 'Ok', routes: [{ distance: 2400, duration: 600, geometry: { type: 'LineString', coordinates: [origin, middle, destination] }, legs: [{ steps: [
    { distance: 1300, geometry: { type: 'LineString', coordinates: [origin, middle] }, maneuver: { type: 'depart', instruction: 'Head west on the road' } },
    { distance: 1100, geometry: { type: 'LineString', coordinates: [middle, destination] }, maneuver: { type: 'turn', modifier: 'left', instruction: 'Turn left onto the destination road' } },
    { distance: 0, geometry: { type: 'LineString', coordinates: [destination, destination] }, maneuver: { type: 'arrive', instruction: 'You have arrived at your destination' } },
  ] }] }] };
}
export async function mockDirections(page: Page) {
  const requests: string[] = [];
  await page.route('https://api.mapbox.com/directions/v5/**', async route => {
    const raw = route.request().postData() || '';
    requests.push(raw);
    const points = new URLSearchParams(raw).get('coordinates')!.split(';').map(point => point.split(',').map(Number));
    await route.fulfill({ json: directionsResponse(points[0], points[1]) });
  });
  return requests;
}
