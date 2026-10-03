import { appendTrack, trackStatus, restoreTrack, TRACK_BATCH, type Track } from './track';
import type { LocationFix } from './location';
import type { TravelStatus } from './session';

export type TrackBatch = { id: string; journeyId: string; ownerId: string; startedAt: number; endedAt: number | null; status: Track['status']; revision: number; points: Track['points'] };
export type TrackSnapshot = { track: Track; revision: number; count: number; committedStatus: string; pending: TrackBatch | null };
export type SyncState = 'local' | 'pending' | 'saved' | 'conflict';

export function restoreTrackSnapshot(raw: string | null, journey: string, owner: string): TrackSnapshot | null {
  try {
    const s = JSON.parse(raw || 'null');
    const track = restoreTrack(s?.track, journey, owner);
    if (!track || !Number.isInteger(s.revision) || s.revision < 0 || !Number.isInteger(s.count) || s.count < 0 || s.count > track.points.length || s.revision === 0 && (s.count !== 0 || s.committedStatus !== '')) return null;
    const p = s.pending;
    // The session may have paused/finished while this earlier batch was in flight.
    // Preserve its original status as well as points for exact idempotent retry.
    const validStatus = p && (['ACTIVE','PAUSED'].includes(p.status) ? p.endedAt === null : ['COMPLETED','CANCELLED'].includes(p.status) && p.status === track.status && p.endedAt === track.endedAt);
    const pending = p && validStatus && p.id === track.id && p.ownerId === owner && p.journeyId === journey && p.revision === s.revision && p.startedAt === track.startedAt && Array.isArray(p.points) && p.points.length <= TRACK_BATCH && JSON.stringify(p.points) === JSON.stringify(track.points.slice(s.count, s.count + p.points.length)) ? p : null;
    return { track, revision: s.revision, count: s.count, committedStatus: typeof s.committedStatus === 'string' ? s.committedStatus : '', pending };
  } catch { return null; }
}

/** A single serialized writer. A failed/ambiguous batch is retried byte-for-byte. */
export class TrackRecorder {
  snapshot: TrackSnapshot;
  sync: SyncState;
  private writing: Promise<void> | null = null;
  private blocked = false;
  private closing = false;
  constructor(snapshot: TrackSnapshot, private write: (batch: TrackBatch) => Promise<{ revision: number; count: number }>, private changed: () => void) {
    this.snapshot = snapshot;
    this.sync = snapshot.track.ownerId ? !snapshot.pending && snapshot.count === snapshot.track.points.length && snapshot.committedStatus === snapshot.track.status ? 'saved' : 'pending' : 'local';
  }
  accept(fix: LocationFix, now = Date.now()) {
    const next = appendTrack(this.snapshot.track, fix, now);
    if (next !== this.snapshot.track) { this.snapshot.track = next; this.mark(); }
  }
  status(status: TravelStatus, now = Date.now()) {
    const previous = this.snapshot.track;
    this.snapshot.track = trackStatus(previous, status, now);
    if (previous.status !== this.snapshot.track.status) this.mark();
    else this.changed();
  }
  gap() { if (!this.snapshot.track.breakSegment) { this.snapshot.track = { ...this.snapshot.track, breakSegment: true }; this.changed(); } }
  private mark() { if (this.snapshot.track.ownerId && !this.blocked) this.sync = 'pending'; this.changed(); }
  flush(): Promise<void> {
    if (this.writing) return this.writing;
    if (!this.snapshot.track.ownerId || this.blocked) return Promise.resolve();
    this.writing = this.drain().finally(() => { this.writing = null; });
    return this.writing;
  }
  close() { this.closing = true; void this.flush(); }
  private async drain() {
    // Bounded by the track's 20,000-point limit; no timer/retry loop inside this writer.
    while (true) {
      const s = this.snapshot, t = s.track;
      if (!s.pending && s.count === t.points.length && s.committedStatus === t.status) { this.sync = 'saved'; this.changed(); return; }
      if (!s.pending) {
        const points = t.points.slice(s.count, s.count + TRACK_BATCH);
        const final = s.count + points.length === t.points.length;
        s.pending = { id: t.id, journeyId: t.journeyId, ownerId: t.ownerId!, startedAt: t.startedAt, endedAt: final ? t.endedAt : null, status: final ? t.status : 'ACTIVE', revision: s.revision, points };
        this.changed(); // Persist the exact batch before dispatch, including ambiguous-response recovery.
      }
      const batch = s.pending;
      try {
        const ack = await this.write(batch);
        if (ack.revision !== batch.revision + 1 || ack.count !== s.count + batch.points.length) throw new Error('Invalid track acknowledgement');
        s.revision = ack.revision; s.count = ack.count; s.committedStatus = batch.status; s.pending = null; this.changed();
        if (this.closing) return;
      } catch (error) {
        this.blocked = error instanceof Error && ['400','401','403','409'].includes(error.message);
        this.sync = this.blocked ? 'conflict' : 'pending'; this.changed(); return;
      }
    }
  }
}
