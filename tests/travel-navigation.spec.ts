import { test, expect } from '@playwright/test';
import { directionsResponse } from './fixtures/directions';
import { NavigationController, parseRoadRoute, requestRoadRoute, routingReady, nextManeuver, formatDuration, ROUTE_REFRESH_INTERVAL_MS, ROUTE_MAX_AGE_MS, type NavigationInput, type NavigationState, type RoadRoute } from '../src/lib/travel/navigation';
import type { LocationFix } from '../src/lib/travel/location';

const fix = (patch: Partial<LocationFix> = {}): LocationFix => ({ latitude: 8.613271839, longitude: 77.012719183, accuracy: 10, timestamp: Date.now(), heading: null, speed: null, ...patch });
const input = (patch: Partial<NavigationInput> = {}): NavigationInput => ({ status: 'ACTIVE', fix: fix(), destination: { id: 'a', name: 'Nedumangad', latitude: 8.603315, longitude: 77.00279 }, online: true, ...patch });
const road = parseRoadRoute(directionsResponse());
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('road response validates geometry, distance, optional duration and provider maneuvers', () => {
  expect(road.distance).toBe(2400); expect(road.duration).toBe(600); expect(road.steps[1].instruction).toContain('Turn left');
  expect(formatDuration(600)).toBe('~10 min'); expect(formatDuration(3660)).toBe('~1 h 1 min');
  for (const data of [{ code: 'NoRoute' }, { code: 'NoSegment' }, {}, { code: 'Ok', routes: [] }, { code: 'Ok', routes: [{ distance: -1, geometry: road.geometry }] }, { code: 'Ok', routes: [{ distance: 1, geometry: { type: 'LineString', coordinates: [[181, 0], [0, 0]] } }] }]) expect(() => parseRoadRoute(data)).toThrow();
  const noDuration = directionsResponse(); delete (noDuration.routes[0] as { duration?: number }).duration;
  expect(parseRoadRoute(noDuration).duration).toBeNull();
  expect(nextManeuver(road, fix())?.instruction).toContain('Turn left');
  expect(nextManeuver(road, fix())?.distance).toBeCloseTo(1300);
  expect(nextManeuver(road, fix({ latitude: 20 }))).toBeNull();
  expect(nextManeuver(road, fix({ accuracy: 100 }))).toBeNull();
  expect(nextManeuver(road, fix({ timestamp: Date.now() - 20000 }))).toBeNull();
});

test('routing eligibility excludes all inactive states, missing, invalid and inaccurate/stale fixes', () => {
  expect(routingReady(input())).toBe(true);
  for (const status of ['NOT_STARTED', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const) expect(routingReady(input({ status }))).toBe(false);
  for (const data of [input({ destination: undefined }), input({ destination: { id: 'x', name: 'x', latitude: null, longitude: null } }), input({ fix: null }), input({ fix: fix({ latitude: 91 }) }), input({ fix: fix({ accuracy: 51 }) }), input({ fix: fix({ timestamp: Date.now() - 20000 }) })]) expect(routingReady(data)).toBe(false);
});

test('controller deduplicates GPS ticks, throttles movement/staleness and refreshes stop/resume', async () => {
  let now = Date.now(), calls = 0; let state: NavigationState | undefined;
  const service = new NavigationController(async () => { calls++; return road; }, value => { state = value; }, () => now);
  const fresh = (latitude = 8.613271839) => input({ fix: fix({ latitude, timestamp: now }) });
  service.update(fresh()); service.update(fresh()); await settle(); expect(calls).toBe(1); expect(state!.status).toBe('active');
  now += 1000; service.update(fresh(8.6133)); await settle(); expect(calls).toBe(1);
  service.update(input({ fix: fix({ accuracy: 100, timestamp: now }) })); expect(state!.warning).toContain('accurate GPS');
  service.update(fresh(8.6133)); expect(state!.warning).toBe(''); expect(calls).toBe(1);
  service.update(fresh(8.62)); await settle(); expect(calls).toBe(1);
  now += ROUTE_REFRESH_INTERVAL_MS; service.update(fresh(8.62)); await settle(); expect(calls).toBe(2);
  now += ROUTE_MAX_AGE_MS; service.update(fresh(8.62)); await settle(); expect(calls).toBe(3);
  service.update(input({ fix: fix({ timestamp: now }), destination: { id: 'b', name: 'Palode', latitude: 8.723348, longitude: 77.02781 } })); await settle(); expect(calls).toBe(4);
  for (const status of ['PAUSED', 'COMPLETED', 'CANCELLED'] as const) { service.update(input({ status })); expect(state!.route).toBeNull(); }
  service.update(fresh()); await settle(); expect(calls).toBe(5); service.stop();
});

test('obsolete destination and moving-origin requests cannot overwrite the latest route', async () => {
  let now = Date.now() + 100; let state: NavigationState | undefined;
  const pending: { resolve: (value: RoadRoute) => void; signal: AbortSignal }[] = [];
  const service = new NavigationController((_, __, signal) => new Promise(resolve => pending.push({ resolve, signal })), value => { state = value; }, () => now);
  service.update(input()); service.update(input()); expect(pending.length).toBe(1);
  service.update(input({ destination: { id: 'b', name: 'Palode', latitude: 8.72, longitude: 77.02 } })); expect(pending[0].signal.aborted).toBe(true);
  pending[1].resolve({ ...road, distance: 5000 }); await settle(); pending[0].resolve(road); await settle(); expect(state!.route!.distance).toBe(5000);
  service.stop(); service.update(input()); service.update(input({ fix: fix({ latitude: 8.63 }) })); expect(pending[2].signal.aborted).toBe(true);
  pending[2].resolve(road); await settle(); expect(state!.route).toBeNull();
  now += ROUTE_REFRESH_INTERVAL_MS; service.update(input({ fix: fix({ latitude: 8.63, timestamp: now }) })); expect(pending.length).toBe(4);
  service.stop(); pending[3].resolve(road); await settle(); expect(state!.route).toBeNull();
});

test('network failures preserve only the same destination route; retry is bounded', async () => {
  let now = Date.now() + 100, calls = 0, fail = false; let state: NavigationState | undefined;
  const service = new NavigationController(async () => { calls++; if (fail) throw new Error('network'); return road; }, value => { state = value; }, () => now);
  service.update(input()); await settle(); fail = true; now += ROUTE_REFRESH_INTERVAL_MS;
  service.update(input({ fix: fix({ latitude: 8.63, timestamp: now }) })); await settle(); expect(state!.status).toBe('unavailable'); expect(state!.route).toBe(road);
  service.update(input({ fix: null })); service.update(input({ fix: fix({ timestamp: now }) })); expect(state!.status).toBe('unavailable');
  service.update(input({ fix: fix({ timestamp: now }) }), true); expect(calls).toBe(2);
  now += 5000; fail = false; service.update(input({ fix: fix({ timestamp: now }) }), true); await settle(); expect(calls).toBe(3);
  service.update(input({ online: false })); expect(state!.route).toBe(road);
  service.update(input({ online: false, destination: { id: 'b', name: 'b', latitude: 8.7, longitude: 77.1 } })); expect(state!.route).toBeNull(); service.stop();
});

test('provider request is POST with private coordinates only in body and sanitized failures', async () => {
  const signal = new AbortController().signal;
  let url = '', options: RequestInit | undefined;
  const transport = (async (target, init) => { url = String(target); options = init; return new Response(JSON.stringify(directionsResponse())); }) as typeof fetch;
  await requestRoadRoute(fix(), input().destination as { latitude: number; longitude: number }, 'pk.test-public-token', signal, transport);
  expect(options!.method).toBe('POST'); expect(url).not.toContain('8.613'); expect(String(options!.body)).toContain('coordinates='); expect(options!.credentials).toBe('omit');
  for (const status of [401, 403, 429, 500]) await expect(requestRoadRoute(fix(), fix(), 'pk.test', signal, (async () => new Response('', { status })) as typeof fetch)).rejects.toThrow(status === 429 ? /limit/ : status < 500 ? /configuration/ : /unavailable/);
  await expect(requestRoadRoute(fix({ latitude: 999 }), fix(), 'pk.test', signal, transport)).rejects.toThrow(/coordinates/);
  await expect(requestRoadRoute(fix(), fix(), 'sk.secret', signal, transport)).rejects.toThrow(/public/);
  await expect(requestRoadRoute(fix(), fix(), 'pk.test', signal, (async () => new Response('bad-json')) as typeof fetch)).rejects.toThrow(/invalid/);
});
