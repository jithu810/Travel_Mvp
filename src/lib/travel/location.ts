import { hasCoordinates } from '@/lib/journey/map-data';
import type { JourneyStop } from '@/lib/journey/types';
import type { TravelEvent, TravelSession } from './session';

export const ARRIVAL_RADIUS_METERS = 100;
export const MAX_ARRIVAL_ACCURACY_METERS = 50;
export const MAX_LOCATION_AGE_MS = 15_000;
export type LocationFix = { latitude: number; longitude: number; accuracy: number; timestamp: number; heading: number | null; speed: number | null };

export function validLocation(fix: LocationFix) {
  return hasCoordinates(fix) && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && Number.isFinite(fix.timestamp);
}

export function freshLocation(fix: LocationFix, now = Date.now()) {
  return validLocation(fix) && fix.timestamp <= now && now - fix.timestamp <= MAX_LOCATION_AGE_MS;
}

export function readLocation(position: GeolocationPosition): LocationFix | null {
  const coords = position?.coords;
  if (!coords) return null;
  const fix: LocationFix = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, timestamp: position.timestamp,
    heading: typeof coords.heading === 'number' && Number.isFinite(coords.heading) && coords.heading >= 0 && coords.heading < 360 ? coords.heading : null,
    speed: typeof coords.speed === 'number' && Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : null };
  return validLocation(fix) ? fix : null;
}

// Great-circle distance on Earth, never road distance or the length of the drawn line.
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude), dLng = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, value))), Math.sqrt(Math.max(0, 1 - value)));
}

export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

// Only the authoritative next stop can feed the existing guarded session reducer.
// Include the uncertainty radius so a fix just inside the boundary is insufficient.
export function arrivalEvent(session: TravelSession, stops: JourneyStop[], fix: LocationFix, now = Date.now()): TravelEvent | null {
  if (session.status !== 'ACTIVE' || !freshLocation(fix, now) || fix.accuracy > MAX_ARRIVAL_ACCURACY_METERS) return null;
  const nextId = session.stopIds[session.completedIds.length];
  const stop = stops.find(stop => stop.id === nextId);
  return stop && hasCoordinates(stop) && distanceMeters(fix, stop) + fix.accuracy <= ARRIVAL_RADIUS_METERS ? { type: 'COMPLETE_STOP', stopId: stop.id } : null;
}
