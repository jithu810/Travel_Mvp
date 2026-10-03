import { distanceMeters, freshLocation, MAX_ARRIVAL_ACCURACY_METERS, type LocationFix } from './location';
import type { TravelStatus } from './session';

// Compact points: longitude, latitude, GPS time (ms), accuracy (m), segment number.
export type TrackPoint = [number, number, number, number, number];
export type TrackStatus = Exclude<TravelStatus, 'NOT_STARTED'>;
export type Track = { id: string; journeyId: string; ownerId: string | null; status: TrackStatus; startedAt: number; endedAt: number | null; points: TrackPoint[]; breakSegment: boolean };
export const TRACK_LIMIT = 20_000;
export const TRACK_BATCH = 128;
export const TRACK_GAP_MS = 15_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const trackKey = (owner: string, journey: string) => `journeycreator:track:v1:${owner}:${journey}`;

export function newTrack(id: string, journeyId: string, ownerId: string | null, now = Date.now()): Track {
  return { id, journeyId, ownerId, status: 'ACTIVE', startedAt: now, endedAt: null, points: [], breakSegment: true };
}
export function pointLocation(point: TrackPoint) { return { longitude: point[0], latitude: point[1] }; }
export function pointDistance(a: TrackPoint, b: TrackPoint) { return distanceMeters(pointLocation(a), pointLocation(b)); }
export function validTrackPoint(value: unknown, previous?: TrackPoint, now = Date.now()): value is TrackPoint {
  if (!Array.isArray(value) || value.length !== 5 || !value.every(Number.isFinite)) return false;
  const p = value as TrackPoint;
  return Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90 && p[2] > 0 && p[2] <= now && p[3] >= 0 && p[3] <= 50 && Number.isInteger(p[4]) && p[4] >= 0 && p[4] < 500
    && (!previous ? p[4] === 0 : p[2] > previous[2] && p[4] >= previous[4] && p[4] <= previous[4] + 1
      && (p[4] !== previous[4] || p[2] - previous[2] <= TRACK_GAP_MS && pointDistance(previous, p) <= (p[2] - previous[2]) / 1000 * 75 + previous[3] + p[3] + 20));
}
export function appendTrack(track: Track, fix: LocationFix, now = Date.now()): Track {
  if (track.status !== 'ACTIVE' || track.points.length >= TRACK_LIMIT || !freshLocation(fix, now) || fix.timestamp < track.startedAt || fix.accuracy > MAX_ARRIVAL_ACCURACY_METERS || fix.speed !== null && (!Number.isFinite(fix.speed) || fix.speed < 0 || fix.speed > 75)) return track;
  const last = track.points.at(-1);
  if (last && fix.timestamp <= last[2]) return track;
  // Break at an outage/pause/refresh rather than inventing movement across it.
  const split = !!last && (track.breakSegment || fix.timestamp - last[2] > TRACK_GAP_MS);
  const p: TrackPoint = [fix.longitude, fix.latitude, fix.timestamp, fix.accuracy, last ? last[4] + Number(split) : 0];
  if (!validTrackPoint(p, last, now) || last && !split && pointDistance(last, p) < 5) return track;
  return { ...track, breakSegment: false, points: [...track.points, p] };
}
export function trackStatus(track: Track, status: TravelStatus, now = Date.now()): Track {
  if (status === 'NOT_STARTED' || ['COMPLETED', 'CANCELLED'].includes(track.status)) return track;
  return { ...track, status, breakSegment: track.breakSegment || status !== 'ACTIVE' || track.status === 'PAUSED', endedAt: ['COMPLETED', 'CANCELLED'].includes(status) ? now : null };
}
export function trackDistance(points: TrackPoint[]) { return points.reduce((sum, p, i) => sum + (i && p[4] === points[i - 1][4] ? pointDistance(points[i - 1], p) : 0), 0); }
export function trackGeometry(points: TrackPoint[]) {
  const segments: [number, number][][] = [];
  for (const p of points) (segments[p[4]] ||= []).push([p[0], p[1]]);
  return { type: 'MultiLineString' as const, coordinates: segments.filter(segment => segment.length > 1) };
}
export function restoreTrack(value: unknown, journey: string, owner: string, now = Date.now()): Track | null {
  if (!value || typeof value !== 'object') return null;
  const t = value as Track;
  if (!UUID.test(t.id) || t.journeyId !== journey || t.ownerId !== owner || !['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(t.status) || !Number.isFinite(t.startedAt) || t.startedAt <= 0 || t.startedAt > now || !Array.isArray(t.points) || t.points.length > TRACK_LIMIT) return null;
  if (t.endedAt !== null && (!Number.isFinite(t.endedAt) || t.endedAt < t.startedAt || t.endedAt > now) || ['COMPLETED', 'CANCELLED'].includes(t.status) !== (t.endedAt !== null)) return null;
  if (!t.points.every((p, i) => validTrackPoint(p, t.points[i - 1], now) && p[2] >= t.startedAt && (t.endedAt === null || p[2] <= t.endedAt))) return null;
  return { id: t.id, journeyId: journey, ownerId: owner, startedAt: t.startedAt, endedAt: t.endedAt, status: t.status, points: t.points, breakSegment: true };
}
