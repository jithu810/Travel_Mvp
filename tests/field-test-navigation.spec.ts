import { test, expect } from '@playwright/test';
import { NavigationController, requestRoadRoute, parseRoadRoute, type NavigationState, type NavigationInput, type RoadRoute } from '../src/lib/travel/navigation';
import { directionsResponse } from './fixtures/directions';
import { currentStopLocation } from '../src/lib/journey/current-location';
import { newTravelSession, transitionTravel } from '../src/lib/travel/session';
import { newTrack, appendTrack, trackGeometry } from '../src/lib/travel/track';

const fix = () => ({ latitude: 8.6, longitude: 77, accuracy: 10, timestamp: Date.now(), speed: null, heading: null });
const road = parseRoadRoute(directionsResponse());
const input = (transportation: 'driving' | 'walking' = 'driving'): NavigationInput => ({ status: 'ACTIVE', fix: fix(), online: true, transportation, destination: { id: 'a', name: 'A', latitude: 8.7, longitude: 77.1 } });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('mode change clears route immediately, cancels pending request and ignores obsolete response', async () => {
  let state: NavigationState | undefined;
  const calls: { mode: string; signal: AbortSignal; resolve: (route: RoadRoute) => void }[] = [];
  const controller = new NavigationController((_, __, signal, mode) => new Promise(resolve => calls.push({ mode, signal, resolve })), value => { state = value; });
  controller.update(input()); calls[0].resolve(road); await settle(); expect(state!.route).toBe(road);
  controller.update(input('walking')); expect(state!.route).toBeNull(); expect(calls[1].mode).toBe('walking');
  controller.update(input()); expect(calls[1].signal.aborted).toBe(true); expect(calls[2].mode).toBe('driving');
  calls[1].resolve({ ...road, distance: 123 }); await settle(); expect(state!.route).toBeNull();
  calls[2].resolve(road); await settle(); expect(state!.route).toBe(road); controller.stop();
});

test('selected profile is sent to Mapbox and walking failures preserve manual fallback', async () => {
  const urls: string[] = [];
  const transport = (async url => { urls.push(String(url)); return new Response(JSON.stringify(directionsResponse())); }) as typeof fetch;
  for (const mode of ['driving', 'walking'] as const) await requestRoadRoute(fix(), fix(), 'pk.test', new AbortController().signal, transport, mode);
  expect(urls[0]).toContain('/mapbox/driving?'); expect(urls[1]).toContain('/mapbox/walking?');
  await expect(requestRoadRoute(fix(), fix(), 'pk.test', new AbortController().signal, (async () => new Response(JSON.stringify({ code: 'NoRoute' }))) as typeof fetch, 'walking')).rejects.toThrow(/No walking route.*manually/);
});

test('ordered arrival removes blue route while accepted purple history survives the next request', async () => {
  let state: NavigationState | undefined;
  const pending: ((route: RoadRoute) => void)[] = [];
  const controller = new NavigationController(() => new Promise(resolve => pending.push(resolve)), value => { state = value; });
  let session = transitionTravel(newTravelSession('journey', ['a', 'b']), { type: 'START' });
  const track = newTrack('track', 'journey', null, Date.now());
  const first = fix();
  const accepted = appendTrack(appendTrack(track, first, first.timestamp), { ...first, latitude: first.latitude + .0001, timestamp: first.timestamp + 1000 }, first.timestamp + 1000);
  const before = JSON.stringify(trackGeometry(accepted.points));
  expect(trackGeometry(accepted.points).coordinates).toHaveLength(1);
  controller.update(input()); pending[0](road); await settle();
  session = transitionTravel(session, { type: 'COMPLETE_STOP', stopId: 'a' });
  controller.update({ ...input(), destination: { id: session.stopIds[session.completedIds.length], name: 'B', latitude: 8.8, longitude: 77.2 } });
  expect(state!.route).toBeNull(); expect(JSON.stringify(trackGeometry(accepted.points))).toBe(before);
  pending[1]({ ...road, distance: 3200 }); await settle(); expect(state!.route!.distance).toBe(3200); expect(JSON.stringify(trackGeometry(accepted.points))).toBe(before); controller.stop();
});

test('current stop capture is one-time, fresh, precise and provides denied fallback', async () => {
  let options: PositionOptions | undefined, calls = 0;
  const position = { coords: fix(), timestamp: Date.now() } as unknown as GeolocationPosition;
  expect(await currentStopLocation({ getCurrentPosition(success, _, config) { calls++; options = config; success(position); } })).toEqual({ latitude: 8.6, longitude: 77 });
  expect(calls).toBe(1); expect(options).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  await expect(currentStopLocation({ getCurrentPosition(_, failure) { failure!({ code: 1 } as GeolocationPositionError); } })).rejects.toThrow(/permission denied.*pick on map/);
  for (const patch of [{ latitude: 91 }, { accuracy: 100 }, { longitude: NaN }]) await expect(currentStopLocation({ getCurrentPosition(success) { success({ ...position, coords: { ...position.coords, ...patch } }); } })).rejects.toThrow(/accurate/);
});
