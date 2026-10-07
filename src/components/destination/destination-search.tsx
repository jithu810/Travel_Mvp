"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMapboxToken } from '@/lib/env';
import { searchMapboxPlaces } from '@/lib/mapbox/geocoding';
import { destinationFromFeature, destinationHref, destinationSearchTypes, type SelectedDestination } from '@/lib/discovery/selected-destination';

export function DestinationSearch({ filters = {} }: { filters?: Record<string, string> }) {
  const router = useRouter();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const generation = useRef(0);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<SelectedDestination[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [dropdown, setDropdown] = useState({ above: false, height: 320 });
  const token = getMapboxToken();

  useEffect(() => {
    if (!open || !token || query.trim().length < 2 || searched) return;
    const request = ++generation.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const features = await searchMapboxPlaces(query, token, { types: destinationSearchTypes, language: 'en' }, controller.signal);
        if (request !== generation.current || controller.signal.aborted) return;
        const places = features.map(destinationFromFeature).filter((place): place is SelectedDestination => place !== null);
        setResults([...new Map(places.map(place => [place.mapboxId, place])).values()]);
        setActive(0); setSearched(true);
      } catch {
        if (!controller.signal.aborted && request === generation.current) setError('Destination search is unavailable. Please try again in a moment.');
      } finally {
        if (!controller.signal.aborted && request === generation.current) setLoading(false);
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, token, open, searched, attempt]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !form.current?.contains(event.target)) { ++generation.current; setOpen(false); setLoading(false); }
    }
    function position() {
      if (!form.current) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const height = viewport?.height || window.innerHeight;
      const rect = form.current.getBoundingClientRect();
      const navigation = window.innerWidth < 768 ? document.querySelector('nav[aria-label="Mobile navigation"]') : null;
      const bottom = Math.min(top + height - 20, navigation ? navigation.getBoundingClientRect().top - 12 : Infinity);
      const below = bottom - rect.bottom - 8;
      const above = rect.top - top - 16;
      const dropAbove = below < 140 && above > below;
      const available = Math.max(96, Math.min(320, dropAbove ? above : below));
      setDropdown(previous => previous.above === dropAbove && previous.height === available ? previous : { above: dropAbove, height: available });
    }
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    position();
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, []);

  function select(place: SelectedDestination) {
    ++generation.current; setOpen(false); setLoading(false);
    const url = new URL(destinationHref(place), 'http://journey.internal');
    for (const [key, value] of Object.entries(filters)) if (value && ['q', 'sort', 'traveler'].includes(key)) url.searchParams.set(key, value);
    router.push(url.pathname + url.search);
  }

  return <form ref={form} role="search" className="relative z-20 w-full max-w-xl" onSubmit={event => {
    event.preventDefault();
    if (open && !loading && results[active]) select(results[active]);
    else {
      if (error && token && query.trim().length >= 2) { setError(''); setLoading(true); setAttempt(current => current + 1); }
      setOpen(true);
    }
  }} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { ++generation.current; setOpen(false); setLoading(false); }
  }}>
    <label htmlFor={id} className="sr-only">Search destinations</label>
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2 pl-4 shadow-lg shadow-black/5 sm:p-3 sm:pl-5">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5 shrink-0 text-stone-500"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.8" /><path d="m15 15 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      <input id={id} type="search" role="combobox" autoComplete="off" maxLength={200} aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? `${id}-suggestions` : undefined} aria-activedescendant={open && results[active] ? `${id}-option-${active}` : undefined}
        value={query} placeholder="Where do you want to go?" className="min-w-0 flex-1 bg-transparent py-3 text-base text-foreground outline-none placeholder:text-stone-400"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={event => {
          ++generation.current; setQuery(event.target.value); setResults([]); setActive(0); setSearched(false); setLoading(!!token && event.target.value.trim().length >= 2); setError(''); setOpen(true);
        }} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); ++generation.current; setOpen(false); setLoading(false); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            const next = results.length ? (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0;
            setActive(next);
            requestAnimationFrame(() => document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: 'nearest' }));
          }
        }} />
      <button type="submit" className="flex min-h-12 shrink-0 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-emerald-900 sm:px-6">Search</button>
    </div>
    {open && <div style={{ maxHeight: dropdown.height }} className={`absolute right-0 left-0 overflow-y-auto overscroll-contain rounded-2xl border border-stone-200 bg-white p-2 text-foreground shadow-xl ${dropdown.above ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
      <ul id={`${id}-suggestions`} role="listbox" aria-label="Destination suggestions" aria-busy={loading}>
        {results.map((place, index) => <li key={place.mapboxId} role="none">
          <button id={`${id}-option-${index}`} type="button" role="option" aria-selected={index === active} aria-label={place.label} tabIndex={-1}
            onMouseDown={event => event.preventDefault()} onClick={() => select(place)} onMouseEnter={() => setActive(index)}
            className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left ${index === active ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
            <span className="min-w-0"><span className="block font-semibold">{place.name}</span><span className="block text-xs leading-5 text-stone-500">{place.label}</span></span><span aria-hidden="true">↗</span>
          </button>
        </li>)}
      </ul>
      {!token ? <p role="status" className="p-4 text-sm text-stone-600">Destination search is not connected yet. You can still browse journeys and destination shortcuts.</p>
        : error ? <p role="alert" className="p-4 text-sm text-red-700">{error}</p>
        : loading ? <p role="status" className="p-4 text-sm text-stone-500">Searching destinations…</p>
        : query.trim().length < 2 ? <p role="status" className="p-4 text-sm text-stone-500">Type at least 2 characters to search worldwide.</p>
        : searched && !results.length ? <p role="status" className="p-4 text-sm text-stone-500">No destinations found. Try a different spelling or add a country or region.</p> : null}
      {token && results.length > 0 && <p className="px-4 py-2 text-xs text-stone-500">Search results © Mapbox</p>}
    </div>}
  </form>;
}
