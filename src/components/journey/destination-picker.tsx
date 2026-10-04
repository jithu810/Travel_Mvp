'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { getMapboxToken } from '@/lib/env';
import { searchMapboxPlaces } from '@/lib/mapbox/geocoding';
import { destinationFromFeature, destinationSearchTypes, type SelectedDestination } from '@/lib/discovery/selected-destination';
import { searchDestinations } from '@/lib/discovery/destinations';

export function DestinationPicker({ name, onSelect }: { name: string; onSelect: (place: SelectedDestination) => void }) {
  const id = useId(), generation = useRef(0);
  const [query, setQuery] = useState(''), [results, setResults] = useState<SelectedDestination[]>([]);
  const [active, setActive] = useState(0), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const token = getMapboxToken();
  useEffect(() => {
    const current = ++generation.current;
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const places = token ? (await searchMapboxPlaces(query, token, { types: destinationSearchTypes, language: 'en' }, controller.signal)).map(destinationFromFeature).filter((item): item is SelectedDestination => !!item) : searchDestinations(query).map(item => ({ ...item, label: `${item.name}, ${item.region}`, mapboxId: item.slug, type: 'place' }));
        if (current === generation.current) { setResults(places); setError(places.length ? '' : 'No destinations found. Try adding a country or region.'); }
      } catch { if (!controller.signal.aborted && current === generation.current) setError('Destination search is unavailable. Try again.'); }
      finally { if (current === generation.current && !controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, token]);
  function choose(place: SelectedDestination) { ++generation.current; onSelect(place); setQuery(''); setResults([]); setLoading(false); setError(''); }
  return <div className="text-sm"><label className="block font-medium" htmlFor={id}>Destination</label><input id={id} role="combobox" aria-expanded={!!results.length} aria-controls={`${id}-options`} aria-autocomplete="list" aria-activedescendant={results[active] ? `${id}-${active}` : undefined} value={query} placeholder="🔎 Search destination..." autoComplete="off" maxLength={200} onChange={event => { ++generation.current; setQuery(event.target.value); setResults([]); setActive(0); setLoading(false); setError(''); }} onKeyDown={event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(value => results.length ? (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0); }
    if (event.key === 'Enter') { event.preventDefault(); if (results[active]) choose(results[active]); }
    if (event.key === 'Escape') { ++generation.current; setResults([]); setLoading(false); }
  }} className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 px-3"/>
    {name && <p className="mt-2 font-semibold text-brand">Selected destination: {name} <span className="font-normal">· Search to change</span></p>}
    {loading && <p role="status">Searching destinations…</p>}{error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {!!results.length && <ul id={`${id}-options`} role="listbox" aria-label="Destination suggestions" className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-stone-200">{results.map((place, index) => <li key={place.mapboxId} role="none"><button id={`${id}-${index}`} type="button" role="option" aria-selected={active === index} onClick={() => choose(place)} className={`min-h-12 w-full p-3 text-left ${active === index ? 'bg-[#e7eedf]' : ''}`}>{place.label}</button></li>)}</ul>}
    {!token && <p className="mt-2 text-xs text-stone-500">Worldwide search needs Mapbox. Existing destinations are available while disconnected.</p>}
  </div>;
}
