'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { JourneyMap } from '@/components/map/journey-map';
import { StopPhoto } from '@/components/journey/stop-photo';
import { hasCoordinates, orderedStops } from '@/lib/journey/map-data';
import type { JourneyDetail, JourneyStop } from '@/lib/journey/types';
import { newTravelSession, restoreTravelSession, transitionTravel, travelStorageKey, type TravelEvent } from '@/lib/travel/session';
import { TravelDialog } from './travel-dialog';
import { arrivalEvent, distanceMeters, formatDistance } from '@/lib/travel/location';
import { useTravelLocation } from './use-travel-location';
import { GpsStatus } from './gps-status';

const primary = 'min-h-12 rounded-full bg-brand px-6 text-sm font-semibold text-white disabled:opacity-50';
const secondary = 'min-h-12 rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-brand';

export function TravelMode({ journey }: { journey: JourneyDetail }) {
  const stops = useMemo(() => orderedStops(journey.stops), [journey.stops]);
  const stopIds = useMemo(() => stops.map(stop => stop.id), [stops]);
  const [session, setSession] = useState(() => newTravelSession(journey.id, stopIds));
  const sessionRef = useRef(session);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [detail, setDetail] = useState<JourneyStop | null>(null);
  const [ending, setEnding] = useState(false);
  const key = travelStorageKey(journey.id);
  const gps = useTravelLocation(ready && session.status === 'ACTIVE', fix => {
    const event = arrivalEvent(sessionRef.current, stops, fix);
    if (event) send(event, 'gps');
    return sessionRef.current.status === 'ACTIVE';
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const fresh = newTravelSession(journey.id, stopIds);
      sessionRef.current = fresh;
      setSession(fresh);
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const restored = restoreTravelSession(raw, journey.id, stopIds);
          if (restored) { sessionRef.current = restored; setSession(restored); }
          else { sessionStorage.removeItem(key); setNotice('The previous simulation was outdated or invalid. Start a fresh preview.'); }
        }
      } catch { setStorageAvailable(false); }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [key, journey.id, stopIds]);

  function send(event: TravelEvent, source: 'manual' | 'gps' = 'manual') {
    const previous = sessionRef.current;
    const next = transitionTravel(previous, event);
    sessionRef.current = next;
    if (next.status !== 'ACTIVE') gps.stop();
    setSession(next);
    setNotice(event.type === 'COMPLETE_STOP' && next !== previous ? `${stops.find(stop => stop.id === event.stopId)?.name || 'Stop'}${source === 'gps' ? ' reached. Arrival detected by GPS.' : ' marked complete manually.'}` : '');
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { setStorageAvailable(false); }
  }

  const count = session.completedIds.length;
  const next = stops[count];
  const finished = session.status === 'COMPLETED';
  const cancelled = session.status === 'CANCELLED';
  const progress = useMemo(() => ({ completedIds: session.completedIds, currentId: finished || cancelled ? null : stops[session.completedIds.length]?.id || null }), [session.completedIds, stops, finished, cancelled]);
  const percentage = stops.length ? Math.round(count / stops.length * 100) : 0;

  return <article data-testid="travel-mode" data-state={session.status} className="space-y-6 sm:space-y-8">
    <header><Link href={`/journey/${encodeURIComponent(journey.id)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">← Back to Journey</Link><p className="mt-2 text-xs font-semibold tracking-wider text-brand uppercase">Travel Mode · GPS assisted</p><h1 className="mt-3 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{journey.title}</h1><p className="mt-3 text-sm leading-6 text-stone-600">Journey Creator uses your location to show where you are and automatically detect when you reach journey stops. Location access begins when you start. Progress stays in this browser tab and isn’t synced to an account.</p></header>
    <JourneyMap stops={stops} selectedId={progress.currentId} onSelect={id => setDetail(stops.find(stop => stop.id === id) || null)} story progress={progress} locationEnabled currentLocation={gps.fix}/>
    <p className="text-xs leading-6 text-stone-600">✓ Completed · ● Current / next · ○ Upcoming · Blue dot: you are here. The map shows the planned stop sequence, not an actual traveled path.</p>
    <GpsStatus status={gps.status} fix={gps.fix} travelStatus={session.status} retry={gps.retry}/>
    {!ready && <p role="status" className="text-sm text-stone-500">Checking this tab’s simulation…</p>}
    {!storageAvailable && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">Browser storage is unavailable. You can still follow this journey, but progress will reset after a refresh.</p>}
    {notice && <p role="status" className="text-sm leading-6 text-brand">{notice}</p>}
    <section aria-label="Travel progress" className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Journey progress</h2><p data-testid="travel-progress" className="text-sm font-semibold text-brand">{count} / {stops.length} stops · {percentage}%</p></div><progress aria-label="Completed stops" value={count} max={stops.length || 1} className="h-3 w-full accent-brand"/></section>
    <div className="space-y-6 sm:space-y-8">
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-label="Current stop" className="space-y-4">
        <h2 className="text-2xl font-semibold">{!stops.length ? 'No stops to follow yet.' : finished ? 'Journey Complete' : cancelled ? 'Journey Ended' : session.status === 'PAUSED' ? 'Journey Paused' : session.status === 'NOT_STARTED' ? 'Ready to start?' : 'Next stop'}</h2>
        {!stops.length ? <p className="leading-7 text-stone-600">The creator hasn’t added any stops. You can still view the Journey Story or explore another journey.</p> : finished || cancelled ? <><p className="leading-7 text-stone-600">{finished ? 'All stops are complete. Location tracking has stopped.' : 'You ended this local journey session. Location tracking has stopped and the original journey is unchanged.'}</p><p className="break-words text-sm leading-7 text-brand">{stops.map(stop => stop.name).join(' → ')}</p><div className="flex flex-wrap gap-3"><Link href={`/journey/${encodeURIComponent(journey.id)}`} className={primary + ' inline-flex items-center'}>View Journey</Link><Link href="/explore" className={secondary + ' inline-flex items-center'}>Return to Explore</Link><button type="button" onClick={() => send({ type: 'RESET' })} className="min-h-12 px-3 text-sm font-semibold text-brand underline">Reset journey</button></div></> : <>
          {session.status === 'PAUSED' && <p className="text-sm leading-7 text-stone-600">{storageAvailable ? 'Your progress is saved in this tab.' : 'Your progress remains on this page.'} Resume when you’re ready.</p>}
          <p className="break-words text-2xl font-semibold text-brand">{next?.name}</p><p className="text-sm text-stone-500">Stop {count + 1} of {stops.length}{next?.dayNumber != null ? ` · Day ${next.dayNumber}` : ''}</p>
          {next && <button type="button" onClick={() => setDetail(next)} className={secondary}>View Stop</button>}
          {next && !hasCoordinates(next) && <p className="text-sm leading-6 text-amber-900">GPS arrival detection unavailable for this stop. Complete it manually to continue.</p>}
          {gps.fix && next && hasCoordinates(next) && <p data-testid="next-stop-distance" className="text-lg font-semibold text-brand">{formatDistance(distanceMeters(gps.fix, next))} away <span className="block text-xs font-normal text-stone-600">Straight-line geographic distance · not road distance{gps.status === 'INACCURATE' ? ' · approximate with low GPS accuracy' : ''}</span></p>}
          {session.status === 'NOT_STARTED' && <p className="text-sm leading-7 text-stone-600">Follow {stops.length} stops in the creator’s order. Allow location access to detect arrivals, or continue manually if GPS is unavailable.</p>}
        </>}
      </section>
      <section aria-label="Ordered travel stops"><h2 className="mb-4 text-xl font-semibold">Your journey</h2><ol className="space-y-2">{stops.map((stop, index) => {
        const status = index < count ? 'Completed' : index === count && !finished && !cancelled ? 'Current / next' : 'Upcoming';
        return <li key={stop.id} data-testid="travel-stop" data-stop-state={status}><button type="button" onClick={() => setDetail(stop)} className={`flex min-h-14 w-full items-start gap-3 rounded-2xl p-3 text-left ${status === 'Current / next' ? 'bg-[#e7eedf]' : 'hover:bg-stone-100'}`}><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white font-bold text-brand">{status === 'Completed' ? '✓' : status === 'Current / next' ? '●' : '○'}</span><span className="min-w-0"><span className="block break-words font-semibold">{stop.name}</span><span className="mt-1 block text-xs text-stone-600">Stop {index + 1} · {status}</span></span></button></li>;
      })}</ol></section>
    </div>
    {stops.length > 0 && !finished && !cancelled && <section aria-label="Travel controls" className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg md:bottom-3"><p className="mb-3 text-xs font-semibold text-stone-600">{session.status === 'ACTIVE' ? 'GPS-assisted progress · manual completion is always available as a fallback' : 'Journey controls'}</p><div className="flex flex-wrap gap-3">
      {session.status === 'NOT_STARTED' && <button type="button" disabled={!ready} onClick={() => send({ type: 'START' })} className={primary + ' flex-1'}>Start Journey</button>}
      {session.status === 'ACTIVE' && <><button type="button" onClick={() => next && send({ type: 'COMPLETE_STOP', stopId: next.id })} className={secondary + ' flex-1'}>Mark Stop Complete</button><button type="button" onClick={() => send({ type: 'PAUSE' })} className={primary}>Pause Journey</button></>}
      {session.status === 'PAUSED' && <button type="button" onClick={() => send({ type: 'RESUME' })} className={primary + ' flex-1'}>Resume Journey</button>}
      {session.status !== 'NOT_STARTED' && <button type="button" onClick={() => setEnding(true)} className="min-h-12 px-3 text-sm font-semibold text-stone-600 underline">End Journey</button>}
    </div></section>}
    </div>
    {detail && <TravelDialog title={detail.name} onClose={() => setDetail(null)}><p className="mt-4 text-sm text-stone-500">Stop {stops.findIndex(stop => stop.id === detail.id) + 1} of {stops.length}{detail.dayNumber != null ? ` · Day ${detail.dayNumber}` : ''}</p>{detail.description && <p className="mt-4 whitespace-pre-line break-words leading-7 text-stone-600">{detail.description}</p>}{detail.photo && <StopPhoto key={detail.photo} src={detail.photo} name={detail.name}/>}</TravelDialog>}
    {ending && <TravelDialog title="End this journey?" onClose={() => setEnding(false)}><p className="mt-4 text-sm leading-7 text-stone-600">This stops location tracking and ends your local session with {count} of {stops.length} stops complete. The original journey stays unchanged.</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => { send({ type: 'END' }); setEnding(false); }} className={primary}>Confirm End</button><button type="button" onClick={() => setEnding(false)} className={secondary}>Keep Traveling</button></div></TravelDialog>}
  </article>;
}
