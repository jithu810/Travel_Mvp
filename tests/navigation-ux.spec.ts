import { test, expect } from '@playwright/test';
import { NavigationPanel, navigationPresentation } from '../src/components/travel/navigation-panel';
import { emptyNavigation, parseRoadRoute, type NavigationState } from '../src/lib/travel/navigation';
import { followNavigationCamera } from '../src/lib/travel/navigation-camera';
import type { LocationFix } from '../src/lib/travel/location';
import { directionsResponse } from './fixtures/directions';

const fix = (): LocationFix => ({ latitude: 8.613271839, longitude: 77.012719183, accuracy: 10, timestamp: Date.now(), heading: 90, speed: 3 });
const road = parseRoadRoute(directionsResponse());
const destination = { id: 'a', name: 'Nedumangad', latitude: 8.603315, longitude: 77.00279 };
function view(patch: Partial<Parameters<typeof NavigationPanel>[0]> = {}, navigation: Partial<NavigationState> = {}) {
  return navigationPresentation({ navigation: { ...emptyNavigation(), status: 'active', route: road, ...navigation }, destination, status: 'ACTIVE', fix: fix(), gpsStatus: 'AVAILABLE', ...patch });
}

test('HUD distinguishes loading, GPS loss, checking, reroute, failure and inactive navigation', () => {
  expect(view().message).toBe('Follow the route');
  expect(view({ fix: null, gpsStatus: 'REQUESTING' }, { route: null }).message).toContain('Waiting for GPS');
  expect(view({ fix: { ...fix(), accuracy: 100 }, gpsStatus: 'INACCURATE' }).message).toBe('GPS signal weak');
  expect(view({ fix: null, gpsStatus: 'DENIED' }).message).toContain('GPS unavailable');
  expect(view({}, { route: null, status: 'calculating' }).message).toContain('Finding route');
  expect(view({}, { status: 'calculating' }).message).toContain('Route updating');
  expect(view({}, { checkingRoute: true }).message).toContain('Checking route');
  expect(view({}, { status: 'rerouting', routeStale: true }).message).toContain('Rerouting');
  expect(view({}, { status: 'unavailable', warning: 'Network unavailable.' }).message).toBe('Route unavailable');
  expect(view({ status: 'PAUSED' }).message).toBe('Navigation paused');
  expect(view({ status: 'COMPLETED' }).message).toBe('Journey complete');
});

test('provider maneuver is shown only with a precise matched fix and current usable route', () => {
  expect(view().maneuver?.instruction).toBe('Turn left onto the destination road');
  for (const position of [{ ...fix(), latitude: 20 }, { ...fix(), accuracy: 100 }, { ...fix(), timestamp: Date.now() - 20000 }]) expect(view({ fix: position }).maneuver).toBeNull();
  for (const navigation of [{ checkingRoute: true }, { routeStale: true }, { warning: 'Network unavailable.' }, { route: null }]) expect(view({}, navigation).maneuver).toBeNull();
  expect(view({ status: 'PAUSED' }).maneuver).toBeNull();
});

test('camera deadband rejects jitter and weak GPS, handles wrapped heading and retains invalid-heading bearing', () => {
  const anchor = fix();
  for (let i = 0; i < 8; i++) expect(followNavigationCamera({ ...anchor, latitude: anchor.latitude + i * 0.000005, heading: 90 + i % 4 }, anchor, 90, false)).toBeNull();
  expect(followNavigationCamera({ ...anchor, heading: 1 }, anchor, 359, false)).toBeNull();
  expect(followNavigationCamera({ ...anchor, latitude: anchor.latitude + 0.0001, heading: null }, anchor, 90, false)).not.toHaveProperty('bearing');
  expect(followNavigationCamera({ ...anchor, heading: 110 }, anchor, 90, true)).toMatchObject({ bearing: 110, pitch: 45, zoom: 16.2, duration: 0 });
  expect(followNavigationCamera({ ...anchor, accuracy: 100 }, null, 90, false)).toBeNull();
  expect(followNavigationCamera({ ...anchor, timestamp: Date.now() - 20000 }, null, 90, false)).toBeNull();
});
