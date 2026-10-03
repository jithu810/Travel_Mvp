import { distanceMeters, freshLocation, MAX_ARRIVAL_ACCURACY_METERS, MAX_LOCATION_AGE_MS, type LocationFix } from './location';
import type { RoadGeometry } from './navigation';

export const OFF_ROUTE_DISTANCE_METERS = 120;
export const OFF_ROUTE_CONFIRMATION_READINGS = 3;
export const OFF_ROUTE_CONFIRMATION_MS = 8_000;
export const MIN_REROUTE_INTERVAL_MS = 60_000;

// Local tangent projection per road segment, with wrapped longitudes at the dateline.
// Distance is used only for deviation, never to invent a navigation instruction.
export function distanceFromRoad(fix: LocationFix, geometry: RoadGeometry) {
  const wrap = (degrees: number) => ((degrees + 540) % 360) - 180;
  const scale = Math.cos(fix.latitude * Math.PI / 180);
  if (Math.abs(scale) < 0.01 || geometry.coordinates.length < 2) return null;
  let best = Infinity;
  for (let i = 1; i < geometry.coordinates.length; i++) {
    const a = geometry.coordinates[i - 1], b = geometry.coordinates[i];
    const ax = wrap(a[0] - fix.longitude) * scale, ay = a[1] - fix.latitude;
    const dx = wrap(b[0] - a[0]) * scale, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const distance = distanceMeters(fix, { longitude: wrap(a[0] + t * wrap(b[0] - a[0])), latitude: a[1] + t * dy });
    best = Math.min(best, distance);
  }
  return Number.isFinite(best) ? best : null;
}

export class DeviationConfirmation {
  private count = 0;
  private startedAt = 0;
  private lastTimestamp = 0;
  private result = { suspect: false, confirmed: false };
  reset() { this.count = 0; this.startedAt = 0; this.lastTimestamp = 0; this.result = { suspect: false, confirmed: false }; }
  update(fix: LocationFix | null, geometry: RoadGeometry, now = Date.now()) {
    if (!fix || !freshLocation(fix, now) || fix.accuracy > MAX_ARRIVAL_ACCURACY_METERS) { this.reset(); return this.result; }
    // Lifecycle timer ticks and repeated/out-of-order positions are not new evidence.
    if (fix.timestamp <= this.lastTimestamp) return this.result;
    if (this.lastTimestamp && fix.timestamp - this.lastTimestamp > MAX_LOCATION_AGE_MS) this.reset();
    const distance = distanceFromRoad(fix, geometry);
    this.lastTimestamp = fix.timestamp;
    if (distance === null || distance - fix.accuracy <= OFF_ROUTE_DISTANCE_METERS) {
      this.count = 0; this.startedAt = 0; this.result = { suspect: false, confirmed: false }; return this.result;
    }
    if (!this.count) this.startedAt = fix.timestamp;
    this.count++;
    const span = fix.timestamp - this.startedAt;
    this.result = { suspect: true, confirmed: this.count >= OFF_ROUTE_CONFIRMATION_READINGS && span >= OFF_ROUTE_CONFIRMATION_MS };
    return this.result;
  }
}
