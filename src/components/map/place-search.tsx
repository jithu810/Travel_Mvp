"use client";
import { useEffect, useRef, useState } from 'react';
import { getMapboxToken } from '@/lib/env';
import { searchMapboxPlaces, type MapboxFeature } from '@/lib/mapbox/geocoding';
export type Place = { name: string; latitude: number; longitude: number; mapboxId: string | null };
type Result = MapboxFeature;
export function PlaceSearch({ onAdd, latitude, longitude, disabled }: { onAdd: (place: Place) => boolean; latitude: number; longitude: number; disabled?: boolean }) {
  const [query,setQuery] = useState('');
  const [results,setResults] = useState<Result[]>([]);
  const [active,setActive] = useState(-1);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [searched,setSearched] = useState(false);
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const token = getMapboxToken();
  useEffect(() => {
    const id = ++generation.current;
    if (!token || query.trim().length < 3 || disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const features = await searchMapboxPlaces(query, token, { country: 'in', proximity: [longitude, latitude] }, controller.signal);
        if (id === generation.current) {
          setResults(features); setActive(features.length ? 0 : -1); setSearched(true);
        }
      } catch { if (!controller.signal.aborted && id === generation.current) setError('Place search is unavailable. Please try again in a moment.'); }
      finally { if (!controller.signal.aborted && id === generation.current) setLoading(false); }
    },250);
    return () => { clearTimeout(timer); controller.abort(); };
  },[query,token,latitude,longitude,disabled]);
  function choose(result: Result) {
    if (disabled) return;
    const [lng,lat] = result.geometry?.coordinates || [];
    const name = result.properties?.name || result.properties?.full_address;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError('That place could not be added. Please choose another search result.'); return; }
    ++generation.current;
    const added = onAdd({ name,latitude: lat,longitude: lng,mapboxId: result.properties?.mapbox_id || result.id });
    setQuery(''); setResults([]); setActive(-1); setSearched(false); setError(''); setLoading(false);
    setNotice(added ? `Added ${name}. Search for your next place.` : `${name} is already in your stops.`);
    input.current?.focus();
  }
  return <div className="space-y-3">
    <label className="block text-sm font-medium">Search for a place<input ref={input} value={query} disabled={disabled || !token} maxLength={200} role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls="place-options" aria-activedescendant={active >= 0 && results[active] ? `place-option-${active}` : undefined} autoComplete="off" placeholder="Search a beach, town or address…" onChange={event => {
      ++generation.current; setQuery(event.target.value); setResults([]); setActive(-1); setSearched(false); setLoading(false); setError(''); setNotice('');
    }} onKeyDown={event => {
      if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActive(current => (current + 1) % results.length); }
      else if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActive(current => (current <= 0 ? results.length : current) - 1); }
      else if (event.key === 'Enter') { event.preventDefault(); if (active >= 0 && results[active]) choose(results[active]); }
      else if (event.key === 'Escape') { event.preventDefault(); ++generation.current; setResults([]); setActive(-1); setLoading(false); setSearched(false); }
    }} className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3"/></label>
    {!token && <p className="text-sm text-stone-500">Place search is not available yet. You can still edit or save your existing draft.</p>}
    {disabled && <p className="text-xs text-stone-500">Finish saving or remove a stop to add another place.</p>}
    {loading && <p role="status" className="text-sm text-stone-500">Searching places…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-brand">{notice}</p>}
    {results.length > 0 && <ul id="place-options" role="listbox" aria-label="Place suggestions" className="overflow-hidden rounded-xl border border-stone-200 bg-white">{results.map((result,index) => <li key={result.id} role="none"><button id={`place-option-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === active} aria-label={result.properties?.full_address || result.properties?.name} className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${index === active ? 'bg-[#e7eedf]' : 'hover:bg-stone-50'}`} onClick={() => choose(result)}><span><span className="block font-semibold">{result.properties?.name || result.properties?.full_address}</span>{result.properties?.full_address && <span className="mt-1 block text-xs text-stone-500">{result.properties.full_address}</span>}</span><span data-testid="add-place" className="flex min-h-11 items-center rounded-full bg-brand px-4 font-medium text-white">Add</span></button></li>)}</ul>}
    {searched && !results.length && !loading && <p className="text-sm text-stone-500">No matching places. Try a nearby town, a more specific address or a different spelling.</p>}
    <p className="text-xs text-stone-500">Select a result to add it. Use ↑ ↓ and Enter on your keyboard. Search results © Mapbox.</p>
  </div>;
}
