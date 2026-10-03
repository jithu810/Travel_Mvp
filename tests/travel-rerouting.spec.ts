import { test, expect } from '@playwright/test';
import { DeviationConfirmation, distanceFromRoad, OFF_ROUTE_CONFIRMATION_MS, MIN_REROUTE_INTERVAL_MS } from '../src/lib/travel/rerouting';
import { NavigationController, parseRoadRoute, type NavigationInput, type NavigationState } from '../src/lib/travel/navigation';
import { navigationCamera, reliableHeading, NAVIGATION_CAMERA_PITCH, NAVIGATION_CAMERA_ZOOM } from '../src/lib/travel/navigation-camera';
import type { LocationFix } from '../src/lib/travel/location';
import { directionsResponse } from './fixtures/directions';

const base = Date.now();
const fix = (latitude = 8.613271839, timestamp = base, accuracy = 10): LocationFix => ({ latitude, longitude: 77.010, accuracy, timestamp, heading: null, speed: null });
const road = parseRoadRoute(directionsResponse());
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const input = (position: LocationFix, patch: Partial<NavigationInput> = {}): NavigationInput => ({ status: 'ACTIVE', online: true, destination: { id: 'a', name: 'Nedumangad', latitude: 8.603315, longitude: 77.00279 }, fix: position, ...patch });

test('deviation uses segment distance and uncertainty, not distance from the route origin', () => {
  expect(distanceFromRoad(fix(), road.geometry)).toBeLessThan(1);
  expect(distanceFromRoad(fix(8.614), road.geometry)).toBeCloseTo(81, -1);
  const policy = new DeviationConfirmation();
  for (let i = 0; i < 10; i++) expect(policy.update(fix(8.614, base + i * 1000), road.geometry, base + i * 1000).confirmed).toBe(false);
  expect(policy.update(fix(8.616, base + 11000, 100), road.geometry, base + 11000).suspect).toBe(false);
  expect(policy.update(fix(8.616, base - 20000), road.geometry, base).suspect).toBe(false);
  expect(distanceFromRoad({ ...fix(), latitude: 0, longitude: 180 }, { type: 'LineString', coordinates: [[179.9, 0], [-179.9, 0]] })).toBeLessThan(1);
});

test('confirmation needs distinct valid persistent readings, resets on recovery and rejects timer duplicates', () => {
  const policy = new DeviationConfirmation();
  expect(policy.update(fix(8.616, base), road.geometry, base).confirmed).toBe(false);
  for (let i = 0; i < 10; i++) expect(policy.update(fix(8.616, base), road.geometry, base + i * 1000).confirmed).toBe(false);
  expect(policy.update(fix(8.616, base + 4000), road.geometry, base + 4000).confirmed).toBe(false);
  expect(policy.update(fix(8.616, base + OFF_ROUTE_CONFIRMATION_MS), road.geometry, base + OFF_ROUTE_CONFIRMATION_MS).confirmed).toBe(true);
  expect(policy.update(fix(8.6133, base + 9000), road.geometry, base + 9000).suspect).toBe(false);
  policy.update(fix(8.616, base + 10000), road.geometry, base + 10000);
  policy.update(fix(8.616, base + 22000), road.geometry, base + 22000);
  expect(policy.update(fix(8.616, base + 30000), road.geometry, base + 30000).confirmed).toBe(true);
  policy.reset(); policy.update(fix(8.616, base), road.geometry, base);
  expect(policy.update(fix(8.616, base + 16000), road.geometry, base + 16000).confirmed).toBe(false);
});

test('confirmed deviation reroutes once to the same destination and resets against the new route', async () => {
  let now = base, calls = 0; let state: NavigationState | undefined;
  const destinations: number[] = [];
  const service = new NavigationController(async (origin, destination) => { calls++; destinations.push(destination.latitude); return calls === 1 ? road : parseRoadRoute(directionsResponse([origin.longitude, origin.latitude], [destination.longitude, destination.latitude])); }, value => { state = value; }, () => now);
  service.update(input(fix())); await settle();
  for (const offset of [30000, 34000]) { now = base + offset; service.update(input(fix(8.616, now))); expect(calls).toBe(1); expect(state!.checkingRoute).toBe(true); }
  now = base + 38000; service.update(input(fix(8.616, now))); expect(state!.status).toBe('rerouting'); expect(state!.routeStale).toBe(true);
  service.update(input(fix(8.616, now))); expect(calls).toBe(2); await settle(); expect(state!.notice).toBe('Route updated'); expect(state!.routeStale).toBe(false); expect(destinations).toEqual([8.603315, 8.603315]);
  for (const offset of [40000, 44000, 48000, 60000, 68000, 72000, 76000, 80000, 84000, 88000, 92000, 96000]) { now = base + offset; service.update(input(fix(8.619, now))); }
  expect(calls).toBe(2); expect(state!.notice).toBe('');
  now = base + 38000 + MIN_REROUTE_INTERVAL_MS; service.update(input(fix(8.619, now))); expect(calls).toBe(3); await settle();
  service.stop();
});

test('failed reroute keeps last valid route, blocks request storms, and permits bounded explicit retry', async () => {
  let now = base, calls = 0, failure = true; let state: NavigationState | undefined;
  const service = new NavigationController(async () => { calls++; if (calls > 1 && failure) throw new Error('network'); return road; }, value => { state = value; }, () => now);
  service.update(input(fix())); await settle();
  for (const offset of [30000, 34000, 38000]) { now = base + offset; service.update(input(fix(8.616, now))); }
  await settle(); expect(state!.status).toBe('unavailable'); expect(state!.route).toBe(road); expect(state!.routeStale).toBe(true);
  for (let i = 0; i < 20; i++) { now += 4000; service.update(input(fix(8.616, now))); } expect(calls).toBe(2);
  failure = false; service.update(input(fix(8.616, now)), true); await settle(); expect(calls).toBe(3); expect(state!.routeStale).toBe(false); service.stop();
});

test('paused, terminal, missing-stop and obsolete reroute responses cannot change navigation', async () => {
  let now = base; let state: NavigationState | undefined; let resolve: ((route: typeof road) => void) | undefined;
  const signals: AbortSignal[] = [];
  const service = new NavigationController(async (_, __, signal) => { signals.push(signal); if (signals.length === 1) return road; return new Promise(done => { resolve = done; }); }, value => { state = value; }, () => now);
  service.update(input(fix())); await settle();
  for (const offset of [30000, 34000, 38000]) { now = base + offset; service.update(input(fix(8.616, now))); }
  expect(state!.status).toBe('rerouting'); service.update(input(fix(8.616, now), { status: 'PAUSED' })); expect(signals[1].aborted).toBe(true); resolve!(road); await settle(); expect(state!.route).toBeNull();
  for (const status of ['PAUSED', 'COMPLETED', 'CANCELLED'] as const) service.update(input(fix(8.616, now), { status }));
  service.update(input(fix(8.616, now), { destination: undefined })); expect(signals.length).toBe(2); service.stop();
});

test('navigation camera has moderate 3D pitch/zoom, reduced motion and genuinely moving heading', () => {
  const location = { ...fix(8.613, Date.now()), heading: 90, speed: 3 };
  expect(reliableHeading(location)).toBe(90); expect(reliableHeading({ ...location, speed: 0 })).toBeNull(); expect(reliableHeading({ ...location, accuracy: 100 })).toBeNull();
  expect(navigationCamera(location, false)).toMatchObject({ pitch: NAVIGATION_CAMERA_PITCH, zoom: NAVIGATION_CAMERA_ZOOM, bearing: 90, duration: 600 });
  expect(navigationCamera({ ...location, heading: null }, true)).not.toHaveProperty('bearing'); expect(navigationCamera(location, true).duration).toBe(0);
});
