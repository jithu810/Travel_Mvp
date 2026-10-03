import { test, expect } from '@playwright/test';
import { arrivalEvent, distanceMeters, freshLocation, readLocation, formatDistance, ARRIVAL_RADIUS_METERS, MAX_ARRIVAL_ACCURACY_METERS, type LocationFix } from '../src/lib/travel/location';
import { watchTravelLocation, type LocationState } from '../src/lib/travel/location-watch';
import { newTravelSession, transitionTravel } from '../src/lib/travel/session';
import type { JourneyStop } from '../src/lib/journey/types';

const stop = (id: string, sequence: number, latitude: number | null = 0, longitude: number | null = 0): JourneyStop => ({ id, sequence, latitude, longitude, name: id, description: '', photo: null, rating: null, dayNumber: null });
const fix = (patch: Partial<LocationFix> = {}): LocationFix => ({ latitude: 0, longitude: 0, accuracy: 10, timestamp: Date.now(), heading: null, speed: null, ...patch });

test('GPS validation, freshness, uncertainty and geographic distance are explicit', () => {
  const now = Date.now();
  expect(readLocation({ coords: { ...fix(), heading: 360, speed: -1 }, timestamp: now } as unknown as GeolocationPosition)).toEqual({ ...fix({ timestamp: now }), heading: null, speed: null });
  for (const patch of [{ latitude: 91 }, { longitude: -181 }, { latitude: NaN }, { accuracy: -1 }, { accuracy: Infinity }, { timestamp: NaN }]) expect(freshLocation(fix(patch))).toBe(false);
  expect(freshLocation(fix({ timestamp: now - 15001 }), now)).toBe(false);
  expect(freshLocation(fix({ timestamp: now + 1 }), now)).toBe(false);
  expect(freshLocation(fix({ timestamp: now - 15000 }), now)).toBe(true);
  expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111194.9266, 3);
  expect(distanceMeters({ latitude: 0, longitude: 179.999 }, { latitude: 0, longitude: -179.999 })).toBeCloseTo(222.3899, 3);
  expect(distanceMeters(fix(), fix())).toBe(0);
  expect(formatDistance(850)).toBe('850 m'); expect(formatDistance(1400)).toBe('1.4 km'); expect(formatDistance(12000)).toBe('12 km');
  const session = transitionTravel(newTravelSession('j', ['a']), { type: 'START' });
  expect(arrivalEvent(session, [stop('a', 1)], fix({ accuracy: MAX_ARRIVAL_ACCURACY_METERS }))).toEqual({ type: 'COMPLETE_STOP', stopId: 'a' });
  expect(arrivalEvent(session, [stop('a', 1)], fix({ accuracy: MAX_ARRIVAL_ACCURACY_METERS + 1 }))).toBeNull();
  // About 89 m away with 20 m uncertainty is insufficient for a 100 m arrival radius.
  expect(ARRIVAL_RADIUS_METERS).toBe(100);
  expect(arrivalEvent(session, [stop('a', 1, 0, 0.0008)], fix({ accuracy: 20 }))).toBeNull();
  expect(arrivalEvent(session, [stop('a', 1, 0, 0.0008)], fix({ accuracy: 5 }))).not.toBeNull();
});

test('GPS arrivals cannot skip, duplicate, progress paused sessions or bypass missing coordinates', () => {
  const stops = [stop('a', 1), stop('b', 2, 1, 1), stop('missing', 3, null, null)];
  let session = newTravelSession('j', stops.map(stop => stop.id));
  expect(arrivalEvent(session, stops, fix())).toBeNull();
  session = transitionTravel(session, { type: 'START' });
  expect(arrivalEvent(session, stops, fix({ latitude: 1, longitude: 1 }))).toBeNull();
  session = transitionTravel(session, arrivalEvent(session, stops, fix())!);
  expect(session.completedIds).toEqual(['a']);
  expect(arrivalEvent(session, stops, fix())).toBeNull();
  session = transitionTravel(session, { type: 'PAUSE' });
  const atB = fix({ latitude: 1, longitude: 1 });
  expect(arrivalEvent(session, stops, atB)).toBeNull();
  session = transitionTravel(session, { type: 'RESUME' });
  session = transitionTravel(session, arrivalEvent(session, stops, atB)!);
  expect(arrivalEvent(session, stops, atB)).toBeNull();
  session = transitionTravel(session, { type: 'COMPLETE_STOP', stopId: 'missing' });
  expect(session.status).toBe('COMPLETED');
  expect(arrivalEvent(session, stops, atB)).toBeNull();
  expect(arrivalEvent({ ...session, status: 'CANCELLED' }, stops, atB)).toBeNull();
});

test('watch adapter blocks cached/repeated/late fixes and clears a terminal watch', async () => {
  let success!: PositionCallback, error!: PositionErrorCallback;
  const states: LocationState[] = [], fixes: LocationFix[] = [], cleared: number[] = [];
  let terminal = false;
  const started = Date.now();
  const stopWatch = watchTravelLocation({ secure: true, permission: async () => 'granted', geolocation: {
    watchPosition(onSuccess, onError, options) { success = onSuccess; error = onError!; expect(options).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }); return 7; },
    clearWatch(id) { cleared.push(id); },
  } }, state => states.push(state), location => { fixes.push(location); return !terminal; }, { current: false });
  await Promise.resolve();
  const sample = (timestamp: number, accuracy = 10) => ({ coords: { latitude: 0, longitude: 0, accuracy, heading: null, speed: null }, timestamp } as GeolocationPosition);
  success(sample(started - 20000)); expect(states.at(-1)?.status).toBe('STALE'); expect(fixes).toHaveLength(0);
  const stamp = Date.now(); success(sample(stamp)); success(sample(stamp)); expect(fixes).toHaveLength(1);
  error({ code: 3 } as GeolocationPositionError); expect(states.at(-1)?.status).toBe('TIMEOUT');
  await new Promise(resolve => setTimeout(resolve, 2));
  terminal = true; success(sample(Date.now())); expect(cleared).toEqual([7]);
  const count = fixes.length; success(sample(Date.now())); expect(fixes).toHaveLength(count);
  stopWatch();
});

test('denials are latched, permission recovery is explicit and unsafe origins never watch', async () => {
  const denied = { current: false }; let watches = 0; const statuses: string[] = [];
  const geolocation = { watchPosition() { watches++; return 1; }, clearWatch() {} };
  const run = async (secure: boolean, permission?: PermissionState) => {
    const stop = watchTravelLocation({ secure, geolocation, permission: permission ? async () => permission : undefined }, state => statuses.push(state.status), () => {}, denied);
    await Promise.resolve(); return stop;
  };
  (await run(true, 'denied'))(); expect(statuses.at(-1)).toBe('DENIED'); expect(watches).toBe(0);
  (await run(true))(); expect(statuses.at(-1)).toBe('DENIED'); expect(watches).toBe(0);
  (await run(true, 'granted'))(); expect(watches).toBe(1); expect(denied.current).toBe(false);
  (await run(false, 'granted'))(); expect(statuses.at(-1)).toBe('INSECURE'); expect(watches).toBe(1);
});
