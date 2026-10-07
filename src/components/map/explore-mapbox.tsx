'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getMapboxToken } from '@/lib/env';
import { TravelImage } from '@/components/ui/travel-image';
import type { ExploreJourney } from '@/lib/discovery/explore-types';
import type { SelectedDestination } from '@/lib/discovery/selected-destination';
import type { Map, Marker } from 'mapbox-gl';
import { groupExploreLocations } from '@/lib/discovery/explore-geography';

export function ExploreMapbox({ journeys, selected, collectionHref = '#published-journeys' }: { journeys: ExploreJourney[]; selected: SelectedDestination | null; collectionHref?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const token = getMapboxToken();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [active, setActive] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(0.65);
  const preview = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  // At globe scale even towns hundreds of kilometers apart can occupy the
  // same marker-sized area. Split groups progressively as the camera zooms.
  const groups = useMemo(() => groupExploreLocations(journeys, !selected, Math.max(1, 4000 / 2 ** mapZoom)), [journeys, selected, mapZoom]);
  const chosen = groups.find(group => group.key === active);
  const cameraKey = JSON.stringify(selected);

  useEffect(() => {
    if (!token || !container.current) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let instance: Map | undefined;
    const timeout = setTimeout(() => { if (!disposed) setState('error'); }, 20000);
    void import('mapbox-gl').then(({ default: gl }) => {
      if (disposed || !container.current) return;
      if (!gl.supported()) throw new Error('WebGL unavailable');
      instance = new gl.Map({ container: container.current, accessToken: token, style: 'mapbox://styles/mapbox/streets-v12', projection: 'globe', center: [60, 18], zoom: 0.65, attributionControl: true, cooperativeGestures: true });
      map.current = instance;
      instance.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
      instance.on('style.load', () => instance?.setFog({ color: '#e7eedf', 'high-color': '#8baea0', 'space-color': '#edf3ed', 'star-intensity': 0, 'horizon-blend': 0.1 }));
      instance.on('load', () => { clearTimeout(timeout); if (!disposed) setState('ready'); });
      instance.on('moveend', () => { if (!disposed && instance) setMapZoom(instance.getZoom()); });
      // Tile errors can be transient; keep a working map visible. A failed
      // initial style load is handled by the timeout rather than hiding it.
      instance.on('error', () => {});
      observer = new ResizeObserver(() => instance?.resize());
      observer.observe(container.current);
    }).catch(() => { clearTimeout(timeout); if (!disposed) setState('error'); });
    return () => { disposed = true; clearTimeout(timeout); observer?.disconnect(); instance?.remove(); map.current = null; };
  }, [token]);

  useEffect(() => {
    const instance = map.current;
    if (state !== 'ready' || !instance) return;
    const destination = JSON.parse(cameraKey) as SelectedDestination | null;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800;
    instance.setProjection(destination ? 'mercator' : 'globe');
    if (destination?.bbox) instance.fitBounds([[destination.bbox[0], destination.bbox[1]], [destination.bbox[2], destination.bbox[3]]], { padding: 55, maxZoom: 11, duration });
    else instance.flyTo({ center: destination ? [destination.longitude, destination.latitude] : [60, 18], zoom: destination ? 9 : 0.65, duration });
  }, [cameraKey, state]);

  useEffect(() => {
    const instance = map.current;
    if (state !== 'ready' || !instance) return;
    let disposed = false;
    const markers: Marker[] = [];
    void import('mapbox-gl').then(({ default: gl }) => {
      if (disposed) return;
      for (const group of groups) {
        const { key, journeys: items } = group;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'flex h-11 min-w-11 items-center justify-center rounded-full border-[3px] border-white bg-[#245b46] px-2 text-sm font-bold text-white shadow-lg cursor-pointer';
        button.textContent = items.length > 1 ? String(items.length) : '↗';
        button.setAttribute('aria-label', `Preview ${items.length} ${items.length === 1 ? 'journey' : 'journeys'} in ${group.label}`);
        button.setAttribute('aria-controls', 'explore-marker-preview');
        button.dataset.longitude = String(group.coordinates[0]);
        button.dataset.latitude = String(group.coordinates[1]);
        button.addEventListener('click', () => { trigger.current = button; setActive(key); requestAnimationFrame(() => { preview.current?.focus({ preventScroll: true }); preview.current?.scrollIntoView({ block: 'end' }); }); });
        markers.push(new gl.Marker({ element: button }).setLngLat(group.coordinates).addTo(instance));
        // Mapbox assigns role="img" to custom marker elements. Restore the
        // native button semantics for keyboard and assistive technology.
        button.setAttribute('role', 'button');
      }
    });
    return () => { disposed = true; markers.forEach(marker => marker.remove()); };
  }, [groups, state]);

  function close() { setActive(null); trigger.current?.focus(); }
  return <section aria-label="Explore journey map" className="overflow-hidden rounded-3xl border border-stone-200 bg-[#e7eedf]">
    <div className="relative">
      <div ref={container} data-testid="explore-map" data-state={!token ? 'unconfigured' : state} data-destination={selected?.name || 'world'} className="h-[340px] w-full sm:h-[440px]" />
      {(!token || state !== 'ready') && <div role="status" className="absolute inset-0 flex items-center justify-center bg-[#e7eedf] p-8 text-center"><div><p className="text-lg font-semibold">{!token || state === 'error' ? 'The map is unavailable right now.' : 'Opening the world…'}</p><p className="mt-2 text-sm text-stone-600">{!token || state === 'error' ? 'You can still explore the journeys below.' : 'A little perspective for your next story.'}</p></div></div>}
      {state === 'ready' && <span className="pointer-events-none absolute top-4 left-4 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-brand">{selected ? selected.name : 'The world, one journey at a time'}</span>}
    </div>
    {chosen && <div ref={preview} id="explore-marker-preview" tabIndex={-1} aria-label="Journey preview" onKeyDown={event => { if (event.key === 'Escape') close(); }} className="scroll-mb-24 border-t border-stone-200 bg-white p-4 outline-brand sm:p-5 md:scroll-mb-8">
      <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Journeys in {chosen.label}</h2><p className="mt-1 text-xs text-stone-500">{chosen.journeys.length} {chosen.journeys.length === 1 ? 'journey' : 'journeys'} in this view</p></div><button onClick={close} className="min-h-11 px-3 text-sm text-brand underline">Close preview</button></div>
      <div className="grid max-h-80 gap-3 overflow-y-auto sm:grid-cols-2">
        {chosen.journeys.slice(0, 3).map(journey => <article key={journey.id} className="flex gap-4 rounded-2xl border border-stone-200 p-3"><div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl"><TravelImage src={journey.coverImage} alt={`${journey.destinationName} journey cover`} sizes="80px" /></div><div className="min-w-0"><p className="text-xs capitalize text-brand">{journey.destinationName} · {journey.travelerType}</p><h3 className="mt-1 font-semibold">{journey.title}</h3><p className="mt-1 text-xs text-stone-600">By {journey.creatorName} · {journey.durationDays} {journey.durationDays === 1 ? 'day' : 'days'} · {journey.likes} likes</p><Link href={`/journey/${journey.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline">View Journey<span className="sr-only">: {journey.title}</span></Link></div></article>)}
      </div>
      <Link href={collectionHref} onClick={() => { close(); if (collectionHref === '#published-journeys') requestAnimationFrame(() => document.getElementById('published-journeys')?.focus({ preventScroll: true })); }} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline">{collectionHref === '#published-journeys' ? 'View all journeys below' : 'Explore all journeys'}</Link>
    </div>}
    <p className="border-t border-stone-200 bg-white/70 px-4 py-3 text-xs leading-5 text-stone-600">{groups.length ? 'Tap a marker to explore journeys. Zoom in to see more places.' : 'Search a destination to take a closer look. Journeys appear on the map when stored coordinates are available.'}</p>
  </section>;
}
