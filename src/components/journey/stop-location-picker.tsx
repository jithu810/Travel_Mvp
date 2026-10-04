'use client';
import { useEffect, useRef, useState } from 'react';
import { TravelDialog } from '@/components/travel/travel-dialog';
import { getMapboxToken } from '@/lib/env';
import { hasCoordinates } from '@/lib/journey/map-data';
import type { Place } from '@/components/map/place-search';

export function StopLocationPicker({ initial, onSave, onClose }: { initial: Place; onSave: (place: Place) => boolean; onClose: () => void }) {
  const [name, setName] = useState(initial.name), [point, setPoint] = useState({ latitude: initial.latitude, longitude: initial.longitude });
  const [error, setError] = useState(''), [mapError, setMapError] = useState('');
  const container = useRef<HTMLDivElement>(null), marker = useRef<import('mapbox-gl').Marker | null>(null);
  const token = getMapboxToken();
  useEffect(() => {
    if (!token || !container.current) return;
    let disposed = false, map: import('mapbox-gl').Map | undefined, observer: ResizeObserver | undefined;
    void (async () => {
      try {
        const mapbox = (await import('mapbox-gl')).default;
        if (disposed || !container.current) return;
        if (!mapbox.supported()) throw new Error('Map unavailable');
        map = new mapbox.Map({ container: container.current, accessToken: token, style: 'mapbox://styles/mapbox/streets-v12', center: [initial.longitude, initial.latitude], zoom: 14 });
        observer = new ResizeObserver(() => map?.resize()); observer.observe(container.current);
        marker.current = new mapbox.Marker({ draggable: true }).setLngLat([initial.longitude, initial.latitude]).addTo(map);
        marker.current.on('dragend', () => { const p = marker.current!.getLngLat(); setPoint({ latitude: p.lat, longitude: p.lng }); setError(''); });
        map.on('click', event => { setPoint({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }); setError(''); });
        map.on('error', () => { if (!disposed) setMapError('Map unavailable. Enter exact pin coordinates below.'); });
      } catch { if (!disposed) setMapError('Map unavailable. Enter exact pin coordinates below.'); }
    })();
    return () => { disposed = true; observer?.disconnect(); marker.current?.remove(); marker.current = null; map?.remove(); };
  }, [token, initial.latitude, initial.longitude]);
  useEffect(() => { if (hasCoordinates(point)) marker.current?.setLngLat([point.longitude, point.latitude]); }, [point]);
  return <TravelDialog title="Choose stop location" onClose={onClose}><p className="my-3 text-sm text-stone-600">Tap the map or drag the pin to the exact spot. Enter the name you want to share.</p><div ref={container} data-testid="stop-pin-map" className="h-[30dvh] min-h-40 rounded-xl bg-[#e7eedf]"/>{(!token || mapError) && <p role="status" className="mt-2 text-sm">{mapError || 'Mapbox is not connected. Enter exact pin coordinates below.'}</p>}
    <label className="mt-3 block text-sm">Stop name<input autoFocus value={name} maxLength={200} onChange={event => { setName(event.target.value); setError(''); }} placeholder="Hotel, viewpoint, friend’s house…" className="mt-1 min-h-12 w-full rounded-xl border border-stone-200 px-3"/></label>
    <div className="mt-3 grid grid-cols-2 gap-3">{(['latitude', 'longitude'] as const).map(axis => <label key={axis} className="text-sm">Pin {axis}<input type="number" step="any" min={axis === 'latitude' ? -90 : -180} max={axis === 'latitude' ? 90 : 180} value={Number.isFinite(point[axis]) ? point[axis] : ''} onChange={event => { setPoint(current => ({ ...current, [axis]: event.target.value === '' ? NaN : Number(event.target.value) })); setError(''); }} className="mt-1 min-h-12 w-full rounded-xl border border-stone-200 px-3"/></label>)}</div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<button type="button" onClick={() => { if (!name.trim()) { setError('Enter a stop name.'); return; } if (!hasCoordinates(point)) { setError('Choose valid coordinates.'); return; } if (onSave({ name: name.trim(), ...point, mapboxId: null })) onClose(); else setError('This location is already in your stops or the 50-stop limit was reached.'); }} className="mt-4 min-h-12 w-full rounded-full bg-brand px-5 text-sm font-semibold text-white">Save stop location</button>
  </TravelDialog>;
}
