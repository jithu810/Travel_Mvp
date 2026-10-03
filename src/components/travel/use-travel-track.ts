'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/env';
import { newTrack, restoreTrack, trackKey, trackGeometry, trackDistance, TRACK_LIMIT, type Track } from '@/lib/travel/track';
import { TrackRecorder, restoreTrackSnapshot, type TrackSnapshot, type TrackBatch, type SyncState } from '@/lib/travel/track-recorder';
import type { LocationFix } from '@/lib/travel/location';
import type { TravelStatus } from '@/lib/travel/session';
import { createStopId } from '@/lib/journey/stop-id';

export function useTravelTrack(journeyId: string, status: TravelStatus, progressReady: boolean) {
  const recorder = useRef<TrackRecorder | null>(null);
  const owner = useRef<string | null>(null);
  const [view, setView] = useState<{ track: Track | null; ownerId: string | null; sync: SyncState; warning: string; ready: boolean }>({ track: null, ownerId: null, sync: 'local', warning: '', ready: false });
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => {
    if (!progressReady) return;
    let disposed = false, generation = 0;
    let subscription: { unsubscribe: () => void } | undefined;
    const controllers = new Set<AbortController>();
    function install(snapshot: TrackSnapshot | null, warning = '') {
      if (disposed) return;
      function changed() {
        const r = recorder.current;
        if (!r || disposed) return;
        let localWarning = r.sync === 'saved' ? '' : warning;
        if (r.snapshot.track.ownerId) {
          try { sessionStorage.setItem(trackKey(r.snapshot.track.ownerId, journeyId), JSON.stringify(r.snapshot)); }
          catch { localWarning = 'Local track recovery is unavailable. Keep this page open until your private track syncs.'; }
        }
        setView({ track: r.snapshot.track, ownerId: owner.current, sync: r.sync, warning: localWarning, ready: true });
      }
      async function write(batch: TrackBatch) {
        const controller = new AbortController(); controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
          const response = await fetch(`/api/journeys/${journeyId}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch), signal: controller.signal, keepalive: true });
          if (!response.ok) throw new Error(String(response.status));
          return await response.json();
        } finally { clearTimeout(timer); controllers.delete(controller); }
      }
      recorder.current = snapshot ? new TrackRecorder(snapshot, write, changed) : null;
      // Starting is synchronous through this factory, so the first GPS callback cannot race it.
      factory.current = (track: Track) => { recorder.current = new TrackRecorder({ track, revision: 0, count: 0, committedStatus: '', pending: null }, write, changed); changed(); };
      if (recorder.current) { recorder.current.gap(); changed(); }
      else setView({ track: null, ownerId: owner.current, sync: owner.current ? 'pending' : 'local', warning, ready: true });
    }
    async function load() {
      const current = ++generation;
      recorder.current?.close();
      setView(previous => ({ ...previous, track: null, ownerId: null, ready: false })); recorder.current = null;
      let cachedOwner: string | null = null;
      try {
        if (getSupabaseConfig()) cachedOwner = (await createClient().auth.getSession()).data.session?.user.id || null;
        const controller = new AbortController(); controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), 12_000);
        let response: Response;
        try { response = await fetch(`/api/journeys/${journeyId}/track`, { cache: 'no-store', signal: controller.signal }); }
        finally { clearTimeout(timer); controllers.delete(controller); }
        const data = await response.json();
        if (disposed || current !== generation) return;
        const uid = typeof data.ownerId === 'string' ? data.ownerId : !response.ok ? cachedOwner : null;
        owner.current = uid;
        let local: TrackSnapshot | null = null;
        if (uid) {
          try {
            local = restoreTrackSnapshot(sessionStorage.getItem(trackKey(uid, journeyId)), journeyId, uid);
          } catch { /* Invalid/unavailable recovery is never passed to the map. */ }
        }
        const remote = uid ? restoreTrack(data.track, journeyId, uid) : null;
        if (local && remote?.id === local.track.id && !local.pending && local.count === local.track.points.length && data.revision > local.revision && JSON.stringify(remote.points.slice(0, local.count)) === JSON.stringify(local.track.points)) local = null;
        // Prefer recovery for this tab; an ambiguous in-flight batch must be retried before advancing.
        const snapshot = local || (remote ? { track: remote, revision: data.revision, count: remote.points.length, committedStatus: remote.status, pending: null } : null);
        install(snapshot, response.ok ? '' : data.error || 'Private sync is unavailable; tracking can continue locally.');
        if (!snapshot && statusRef.current !== 'NOT_STARTED' && ['ACTIVE','PAUSED'].includes(statusRef.current)) factory.current?.(newTrack(createStopId(), journeyId, uid));
        const recovered = recorder.current as TrackRecorder | null;
        if (recovered && ['ACTIVE','PAUSED'].includes(statusRef.current)) recovered.status(statusRef.current);
      } catch {
        if (!disposed && current === generation) {
          // Cached identity permits local recovery only; every write still verifies the server session.
          owner.current = cachedOwner;
          let local: TrackSnapshot | null = null;
          try { if (cachedOwner) local = restoreTrackSnapshot(sessionStorage.getItem(trackKey(cachedOwner, journeyId)), journeyId, cachedOwner); } catch { /* Storage unavailable. */ }
          install(local, 'Private storage is offline. Accepted points remain local until account sync succeeds.');
          if (!local && ['ACTIVE','PAUSED'].includes(statusRef.current)) factory.current?.(newTrack(createStopId(), journeyId, cachedOwner));
          const recovered = recorder.current as TrackRecorder | null;
          if (recovered) recovered.status(statusRef.current);
        }
      }
    }
    void load();
    if (getSupabaseConfig()) {
      const auth = createClient().auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' && session?.user.id !== owner.current) void load(); });
      subscription = auth.data.subscription;
    }
    const interval = setInterval(() => { void recorder.current?.flush(); }, 30_000);
    const visibility = () => { if (document.visibilityState === 'hidden') { recorder.current?.gap(); void recorder.current?.flush(); } };
    const online = () => { void recorder.current?.flush(); };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('online', online);
    return () => {
      // Best effort only: periodic sync and the bounded recovery buffer are authoritative recovery.
      recorder.current?.close(); disposed = true; ++generation;
      clearInterval(interval); subscription?.unsubscribe(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', online);
      factory.current = null;
    };
  }, [journeyId, progressReady]);
  const factory = useRef<((track: Track) => void) | null>(null);
  function change(previous: TravelStatus, next: TravelStatus) {
    if (previous === next) return;
    if (next === 'NOT_STARTED') { recorder.current?.close(); recorder.current = null; setView(v => ({ ...v, track: null })); return; }
    if (previous === 'NOT_STARTED') factory.current?.(newTrack(createStopId(), journeyId, owner.current));
    recorder.current?.status(next);
    void recorder.current?.flush();
  }
  const geometry = useMemo(() => trackGeometry(view.track?.points || []), [view.track]);
  const distance = useMemo(() => trackDistance(view.track?.points || []), [view.track]);
  return { ...view, change, accept: (fix: LocationFix) => recorder.current?.accept(fix), gap: () => recorder.current?.gap(), retry: () => { void recorder.current?.flush(); }, geometry, distance, limited: (view.track?.points.length || 0) >= TRACK_LIMIT || (view.track?.points.at(-1)?.[4] || 0) >= 499 };
}
