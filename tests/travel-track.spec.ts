import { test, expect } from '@playwright/test';
import { appendTrack, newTrack, restoreTrack, trackStatus, trackDistance, trackGeometry, TRACK_LIMIT, type Track } from '../src/lib/travel/track';
import { TrackRecorder, restoreTrackSnapshot, type TrackSnapshot } from '../src/lib/travel/track-recorder';
import type { LocationFix } from '../src/lib/travel/location';
const id = '10000000-0000-0000-0000-000000000001', journey = '20000000-0000-0000-0000-000000000001';
const now = 1_790_000_000_000;
const fix = (offset = 0, time = now): LocationFix => ({ latitude: 8.6 + offset, longitude: 77, timestamp: time, accuracy: 10, heading: null, speed: null });
const snapshot = (track: Track): TrackSnapshot => ({ track, count: 0, revision: 0, committedStatus: '', pending: null });

test('track origin is GPS-only; walking and driving grow a separate segmented geometry', () => {
  let t = newTrack(id, journey, id, now);
  expect(trackGeometry(t.points).coordinates).toEqual([]);
  t = appendTrack(t, fix(), now);
  expect(t.points).toHaveLength(1);
  t = appendTrack(t, fix(.00006, now + 5000), now + 5000);
  t = appendTrack(t, fix(.002, now + 15000), now + 15000);
  expect(t.points).toHaveLength(3);
  expect(trackDistance(t.points)).toBeCloseTo(222.39, 1);
  expect(trackGeometry(t.points).coordinates).toHaveLength(1);
});
test('noise, accuracy, invalid values, old/duplicate/future timestamps, speed and jumps are rejected only for the track', () => {
  const t = appendTrack(newTrack(id, journey, id, now), fix(), now);
  const bad = [fix(.00001, now + 1000), fix(.001, now), fix(.001, now - 1), fix(.001, now + 20000), { ...fix(.001, now + 1000), accuracy: 51 }, { ...fix(.001, now + 1000), accuracy: -1 }, { ...fix(.001, now + 1000), accuracy: NaN }, { ...fix(.001, now + 1000), latitude: 91 }, { ...fix(.001, now + 1000), longitude: Infinity }, { ...fix(.001, now + 1000), speed: 100 }, fix(.8, now + 1000)];
  for (const f of bad) { const original = { ...f }; expect(appendTrack(t, f, now + 1000)).toBe(t); expect(f).toEqual(original); }
  expect(appendTrack(newTrack(id, journey, id, now - 30000), fix(), now + 16000).points).toHaveLength(0);
});
test('pause, outages and refresh start new segments; distance excludes missing legs and terminal points stop', () => {
  let t = appendTrack(newTrack(id, journey, id, now), fix(), now);
  t = appendTrack(t, fix(.0001, now + 1000), now + 1000);
  t = trackStatus(t, 'PAUSED', now + 2000);
  expect(appendTrack(t, fix(.01, now + 3000), now + 3000)).toBe(t);
  t = trackStatus(t, 'ACTIVE', now + 4000);
  t = appendTrack(t, fix(.1, now + 5000), now + 5000);
  t = appendTrack(t, fix(.1001, now + 6000), now + 6000);
  t = appendTrack(t, fix(.2, now + 30000), now + 30000);
  expect(t.points.map(p => p[4])).toEqual([0,0,1,1,2]);
  expect(trackDistance(t.points)).toBeCloseTo(22.239, 1);
  expect(trackGeometry(t.points).coordinates).toHaveLength(2);
  const recovered = restoreTrack(JSON.parse(JSON.stringify(t)), journey, id, now + 30000)!;
  expect(recovered.breakSegment).toBe(true);
  t = appendTrack(recovered, fix(.2001, now + 31000), now + 31000);
  expect(t.points.at(-1)![4]).toBe(3);
  t = trackStatus(t, 'COMPLETED', now + 32000);
  expect(appendTrack(t, fix(.201, now + 33000), now + 33000)).toBe(t);
  expect(t.endedAt! - t.startedAt).toBe(32000);
});
test('restoration is bounded and owner-scoped; malformed raw history never reaches maps', () => {
  const t = appendTrack(newTrack(id, journey, id, now), fix(), now);
  expect(restoreTrack(t, journey, journey, now)).toBeNull();
  expect(restoreTrack({ ...t, points: [[NaN, 8, now, 10, 0]] }, journey, id, now)).toBeNull();
  expect(restoreTrack({ ...t, points: Array(TRACK_LIMIT + 1).fill(t.points[0]) }, journey, id, now)).toBeNull();
  expect(restoreTrack({ ...t, points: [t.points[0], t.points[0]] }, journey, id, now)).toBeNull();
  expect(restoreTrack({ ...t, endedAt: now }, journey, id, now)).toBeNull();
  expect(restoreTrackSnapshot('not json', journey, id)).toBeNull();
});
test('serialized incremental writes retry ambiguous responses exactly once and finalize the last accepted point', async () => {
  let t = newTrack(id, journey, id, Date.now() - 150000);
  const start = t.startedAt;
  for (let i = 0; i < 140; i++) t = appendTrack(t, fix(i * .0001, start + i * 1000), start + i * 1000);
  const requests: unknown[] = []; let fail = true, concurrent = 0, max = 0, count = 0;
  const r = new TrackRecorder(snapshot(t), async batch => {
    requests.push(structuredClone(batch)); concurrent++; max = Math.max(max, concurrent);
    await new Promise(resolve => setTimeout(resolve, 1)); concurrent--;
    if (fail) { fail = false; throw new Error('Network lost after commit'); }
    count += batch.points.length; return { revision: batch.revision + 1, count };
  }, () => {});
  const first = r.flush(); expect(r.flush()).toBe(first); await first;
  expect(r.sync).toBe('pending');
  r.status('COMPLETED', start + 140000);
  const restored = restoreTrackSnapshot(JSON.stringify(r.snapshot), journey, id)!;
  expect(restored.pending).not.toBeNull();
  expect(restored.pending!.status).toBe('ACTIVE');
  expect(restored.track.status).toBe('COMPLETED');
  await r.flush();
  expect(requests[1]).toEqual(requests[0]); expect(max).toBe(1); expect(count).toBe(140); expect(r.sync).toBe('saved'); expect(r.snapshot.committedStatus).toBe('COMPLETED');
  expect((requests[0] as { points: unknown[] }).points).toHaveLength(128);
});
test('stale writes stop safely; anonymous tracks never use account persistence; unmount stops draining', async () => {
  let calls = 0;
  const r = new TrackRecorder(snapshot(newTrack(id, journey, id, now)), async () => { calls++; throw new Error('409'); }, () => {});
  await r.flush(); await r.flush(); expect(calls).toBe(1); expect(r.sync).toBe('conflict');
  const anon = new TrackRecorder(snapshot(newTrack(id, journey, null, now)), async () => { throw new Error('Must not write'); }, () => {});
  anon.accept(fix(), now); await anon.flush(); expect(anon.sync).toBe('local');
  let t = newTrack(id, journey, id, now);
  for (let i = 0; i < 140; i++) t = appendTrack(t, fix(i * .0001, now + i * 1000), now + i * 1000);
  let writes = 0;
  const closing = new TrackRecorder(snapshot(t), async b => { writes++; return { revision: b.revision + 1, count: b.points.length }; }, () => {});
  closing.close(); await closing.flush(); expect(writes).toBe(1); expect(closing.snapshot.count).toBe(128);
});
