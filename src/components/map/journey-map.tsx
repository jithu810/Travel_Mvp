"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMapboxToken } from "@/lib/env";
import { buildMapData } from "@/lib/journey/map-data";
import type { JourneyStop } from "@/lib/journey/types";
import type { LocationFix } from '@/lib/travel/location';
import type { RoadGeometry } from '@/lib/travel/navigation';

type Props = { stops: JourneyStop[]; selectedId: string | null; onSelect: (id: string) => void; story?: boolean; progress?: { completedIds: string[]; currentId: string | null }; locationEnabled?: boolean; currentLocation?: LocationFix | null; navigationRoute?: RoadGeometry };

function stopState(id: string, progress: Props['progress']) {
  return !progress ? null : progress.completedIds.includes(id) ? 'completed' : progress.currentId === id ? 'current' : 'upcoming';
}

function RoutePreview({ stops, selectedId, onSelect, story, progress }: Props) {
  const data = buildMapData(stops);
  if (!data.markers.length) return <div className="flex h-80 items-center justify-center p-8 text-center text-sm text-stone-600">No map coordinates have been added to this journey yet.</div>;
  const lngs = data.markers.map((stop) => stop.longitude);
  const lats = data.markers.map((stop) => stop.latitude);
  const west = Math.min(...lngs), east = Math.max(...lngs), south = Math.min(...lats), north = Math.max(...lats);
  const point = (lng: number, lat: number) => [east === west ? 50 : 10 + ((lng - west) / (east - west)) * 80, north === south ? 50 : 85 - ((lat - south) / (north - south)) * 70];
  return <div className={`relative bg-[#e7eedf] ${story ? "h-[360px] sm:h-[500px]" : "h-80 sm:h-96"}`}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
      {data.line.geometry.coordinates.map((segment, index) => <polyline key={index} points={segment.map(([lng, lat]) => point(lng, lat).join(",")).join(" ")} fill="none" stroke="#245b46" strokeWidth="0.7" strokeDasharray="1.4 1" />)}
    </svg>
    {data.markers.map((stop) => {
      const [left, top] = point(stop.longitude, stop.latitude);
      const status = stopState(stop.id, progress);
      return <button key={stop.id} type="button" data-testid="route-marker" data-sequence={stop.sequence} data-progress={status || undefined} aria-label={`${status ? status + ' stop' : 'Stop'} ${stop.number}: ${stop.name}`} aria-pressed={stop.id === selectedId}
        onClick={() => onSelect(stop.id)} style={{ left: `${left}%`, top: `${top}%` }} className={`journey-map-marker absolute -translate-x-1/2 -translate-y-1/2 text-sm ${status ? 'is-' + status : stop.id === selectedId ? 'is-selected' : ''}`}>{status === 'completed' ? '✓' : stop.number}</button>;
    })}
    <p className="absolute right-3 bottom-3 left-3 text-xs text-stone-500">Route overview · Geographic map unavailable</p>
  </div>;
}

export function JourneyMap({ stops, selectedId, onSelect, story = false, progress, locationEnabled = false, currentLocation, navigationRoute }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const locationMarker = useRef<import('mapbox-gl').Marker | null>(null);
  const markersRef = useRef<{ id: string; marker: import("mapbox-gl").Marker; button: HTMLButtonElement }[]>([]);
  const selectRef = useRef(onSelect);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [following, setFollowing] = useState(false);
  const followingRef = useRef(false);
  const token = getMapboxToken();
  const data = useMemo(() => buildMapData(stops), [stops]);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (currentLocation) return;
    const timer = setTimeout(() => { followingRef.current = false; setFollowing(false); }, 0);
    return () => clearTimeout(timer);
  }, [currentLocation]);

  useEffect(() => {
    if (!token || !container.current || !data.markers.length) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let map: import("mapbox-gl").Map | undefined;
    let failed = false;
    function fail() {
      if (disposed || failed) return;
      failed = true; clearTimeout(timeout); observer?.disconnect();
      markersRef.current.forEach(({ marker }) => marker.remove()); markersRef.current = [];
      locationMarker.current?.remove(); locationMarker.current = null;
      map?.remove(); mapRef.current = null; setState("error");
    }
    async function initialize() {
      try {
        const mapbox = (await import("mapbox-gl")).default;
        if (disposed || !container.current) return;
        if (!mapbox.supported()) throw new Error("WebGL unavailable");
        map = new mapbox.Map({ container: container.current, accessToken: token, style: "mapbox://styles/mapbox/streets-v12", center: [data.markers[0].longitude, data.markers[0].latitude], zoom: 11,
          ...(locationEnabled ? { attributionControl: false, performanceMetricsCollection: false } : {}) });
        mapRef.current = map;
        if (locationEnabled) map.on('movestart', event => { if (event.originalEvent) { followingRef.current = false; setFollowing(false); } });
        map.addControl(new mapbox.NavigationControl(story ? { showCompass: false } : undefined), "top-right");
        const bounds = new mapbox.LngLatBounds();
        for (const stop of data.markers) {
          const button = document.createElement("button");
          button.type = "button"; button.textContent = String(stop.number);
          button.className = "journey-map-marker";
          button.setAttribute("aria-label", `Stop ${stop.number}: ${stop.name}`);
          button.dataset.testid = "route-marker"; button.dataset.sequence = String(stop.sequence);
          const popupContent = document.createElement("div");
          const heading = document.createElement("strong"); heading.textContent = `${stop.number}. ${stop.name}`;
          const description = document.createElement("p"); description.textContent = stop.description.slice(0, 180);
          popupContent.append(heading, description);
          const marker = new mapbox.Marker({ element: button }).setLngLat([stop.longitude, stop.latitude])
            .setPopup(new mapbox.Popup({ offset: 24, ...(story ? { focusAfterOpen: false } : {}) }).setDOMContent(popupContent)).addTo(map);
          button.setAttribute("role", "button");
          button.addEventListener("click", () => selectRef.current(stop.id));
          markersRef.current.push({ id: stop.id, marker, button });
          bounds.extend([stop.longitude, stop.latitude]);
        }
        map.fitBounds(bounds, { padding: story ? { top: locationEnabled ? 120 : 70, right: 85, bottom: 55, left: 55 } : 55, maxZoom: 13, duration: 0 });
        map.on("load", () => {
          if (disposed || failed || !map) return;
          clearTimeout(timeout);
          map.addSource("journey-sequence", { type: "geojson", data: data.line });
          if (story) map.addLayer({ id: "journey-sequence-outline", type: "line", source: "journey-sequence", paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 }, layout: { "line-join": "round", "line-cap": "round" } });
          map.addLayer({ id: "journey-sequence", type: "line", source: "journey-sequence", paint: { "line-color": "#245b46", "line-width": locationEnabled ? 3 : 4, "line-opacity": locationEnabled ? 0.55 : 0.85, ...(locationEnabled ? { 'line-dasharray': [2, 2] } : {}) }, layout: { "line-join": "round", "line-cap": "round" } });
          setState("ready");
        });
        map.on("error", fail);
        timeout = setTimeout(fail, 12000);
        observer = new ResizeObserver(() => map?.resize()); observer.observe(container.current);
      } catch { fail(); }
    }
    void initialize();
    return () => { disposed = true; clearTimeout(timeout); observer?.disconnect(); markersRef.current.forEach(({ marker }) => marker.remove()); markersRef.current = []; locationMarker.current?.remove(); locationMarker.current = null; if (!failed) map?.remove(); mapRef.current = null; };
  }, [token, data, story, locationEnabled]);

  useEffect(() => {
    let disposed = false;
    const map = mapRef.current;
    if (!currentLocation || !map || state !== 'ready') { locationMarker.current?.remove(); locationMarker.current = null; followingRef.current = false; return; }
    async function update() {
      const mapbox = (await import('mapbox-gl')).default;
      if (disposed || map !== mapRef.current || !currentLocation) return;
      if (!locationMarker.current) {
        const element = document.createElement('div');
        element.className = 'journey-current-location';
        element.dataset.testid = 'current-location-marker';
        element.setAttribute('role', 'img'); element.setAttribute('aria-label', 'Your current location');
        locationMarker.current = new mapbox.Marker({ element }).setLngLat([currentLocation.longitude, currentLocation.latitude]).addTo(map!);
      }
      locationMarker.current.setLngLat([currentLocation.longitude, currentLocation.latitude]);
      const element = locationMarker.current.getElement();
      element.classList.toggle('has-heading', currentLocation.heading !== null);
      element.setAttribute('aria-label', currentLocation.heading !== null ? 'Your current location and reported heading' : 'Your current location');
      locationMarker.current.setRotationAlignment('map').setRotation(currentLocation.heading ?? 0);
      if (followingRef.current) map?.easeTo({ center: [currentLocation.longitude, currentLocation.latitude], ...(currentLocation.heading !== null ? { bearing: currentLocation.heading } : {}), zoom: 14, padding: { top: 100, bottom: 30, left: 30, right: 30 }, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600 });
    }
    void update();
    return () => { disposed = true; };
  }, [currentLocation, state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== 'ready') return;
    const source = map.getSource('travel-navigation') as import('mapbox-gl').GeoJSONSource | undefined;
    const line: { type: 'Feature'; properties: Record<string, never>; geometry: RoadGeometry } = { type: 'Feature', properties: {}, geometry: navigationRoute || { type: 'LineString', coordinates: [] } };
    if (source) source.setData(line);
    else if (navigationRoute) {
      map.addSource('travel-navigation', { type: 'geojson', data: line });
      map.addLayer({ id: 'travel-navigation-outline', type: 'line', source: 'travel-navigation', paint: { 'line-color': '#ffffff', 'line-width': 9 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      map.addLayer({ id: 'travel-navigation', type: 'line', source: 'travel-navigation', paint: { 'line-color': '#1d4ed8', 'line-width': 6 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
    }
  }, [navigationRoute, state]);

  useEffect(() => {
    markersRef.current.forEach(({ id, marker, button }) => {
      const selected = id === selectedId;
      const status = stopState(id, progress);
      const stop = data.markers.find(stop => stop.id === id);
      for (const name of ['completed', 'current', 'upcoming']) button.classList.toggle('is-' + name, status === name);
      if (stop) {
        button.textContent = status === 'completed' ? '✓' : String(stop.number);
        button.setAttribute('aria-label', `${status ? status + ' stop' : 'Stop'} ${stop.number}: ${stop.name}`);
      }
      if (status) button.dataset.progress = status;
      else delete button.dataset.progress;
      button.setAttribute("aria-pressed", String(selected)); button.classList.toggle("is-selected", selected);
      if (selected && !marker.getPopup()?.isOpen()) marker.togglePopup();
      else if (!selected && marker.getPopup()?.isOpen()) marker.getPopup()?.remove();
    });
  }, [selectedId, state, progress, data]);

  const selected = data.markers.find((stop) => stop.id === selectedId);
  const fallback = !token || state === "error" || !data.markers.length;
  return <section aria-label="Journey route map" className={`overflow-hidden rounded-3xl border border-stone-200 bg-white ${story ? '[&_.mapboxgl-popup]:z-[3]' : ''}`}>
    <div className={fallback ? "hidden" : "relative"}><div ref={container} data-testid="journey-map" data-state={state} data-navigation={navigationRoute ? 'road-route' : 'none'} className={`w-full ${story ? "h-[360px] sm:h-[500px]" : "h-80 sm:h-96"}`}/>{state === "loading" && !fallback && <p role="status" className="absolute bottom-4 left-4 rounded-xl bg-white p-3 text-sm shadow">Loading journey map…</p>}
      {locationEnabled && state === 'ready' && <><button type="button" disabled={!currentLocation} onClick={() => { if (currentLocation) mapRef.current?.easeTo({ center: [currentLocation.longitude, currentLocation.latitude], zoom: 13, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 }); }} className="absolute top-3 left-3 z-[4] min-h-11 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-brand shadow disabled:opacity-50">Center on me</button><button type="button" disabled={!currentLocation} aria-pressed={following && !!currentLocation} onClick={() => { followingRef.current = !followingRef.current; setFollowing(followingRef.current); if (followingRef.current && currentLocation) mapRef.current?.easeTo({ center: [currentLocation.longitude, currentLocation.latitude], zoom: 14, ...(currentLocation.heading !== null ? { bearing: currentLocation.heading } : {}), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 }); }} className="absolute top-16 left-3 z-[4] min-h-11 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-brand shadow disabled:opacity-50">{following && currentLocation ? 'Stop following' : 'Follow'}</button><p className="absolute right-2 bottom-1 rounded bg-white/90 px-2 text-[10px] text-stone-700"><a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">© Mapbox</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></p></>}
    </div>
    {fallback && <RoutePreview stops={stops} selectedId={selectedId} onSelect={onSelect} story={story} progress={progress}/>}
    {story && <p className="border-t border-stone-100 px-5 py-3 text-xs font-semibold text-brand">{stops.length} stops · {data.markers[0]?.name || "Journey overview"}{data.markers.length > 1 ? ` → ${data.markers.at(-1)?.name}` : ""}</p>}
    {selected && <div role="status" className="border-t border-stone-100 px-5 py-4"><p className="font-semibold">{selected.number}. {selected.name}</p>{selected.description && <p className="mt-1 text-sm text-stone-600">{selected.description}</p>}</div>}
    <p className="border-t border-stone-100 px-5 py-3 text-xs leading-5 text-stone-500">{locationEnabled ? 'Dashed green connects the creator’s stored stops. Blue shows the calculated road route to your next stop.' : 'Lines connect stored stops in their original sequence, not roads or navigation directions.'}{data.missing ? ` ${data.missing} ${data.missing === 1 ? "stop has" : "stops have"} no coordinates; missing legs are not drawn.` : ""}</p>
  </section>;
}
