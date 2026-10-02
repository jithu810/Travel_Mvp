"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMapboxToken } from "@/lib/env";
import { buildMapData } from "@/lib/journey/map-data";
import type { JourneyStop } from "@/lib/journey/types";

type Props = { stops: JourneyStop[]; selectedId: string | null; onSelect: (id: string) => void };

function RoutePreview({ stops, selectedId, onSelect }: Props) {
  const data = buildMapData(stops);
  if (!data.markers.length) return <div className="flex h-80 items-center justify-center p-8 text-center text-sm text-stone-600">No map coordinates have been added to this journey yet.</div>;
  const lngs = data.markers.map((stop) => stop.longitude);
  const lats = data.markers.map((stop) => stop.latitude);
  const west = Math.min(...lngs), east = Math.max(...lngs), south = Math.min(...lats), north = Math.max(...lats);
  const point = (lng: number, lat: number) => [east === west ? 50 : 10 + ((lng - west) / (east - west)) * 80, north === south ? 50 : 85 - ((lat - south) / (north - south)) * 70];
  return <div className="relative h-80 bg-[#e7eedf] sm:h-96">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
      {data.line.geometry.coordinates.map((segment, index) => <polyline key={index} points={segment.map(([lng, lat]) => point(lng, lat).join(",")).join(" ")} fill="none" stroke="#245b46" strokeWidth="0.7" strokeDasharray="1.4 1" />)}
    </svg>
    {data.markers.map((stop) => {
      const [left, top] = point(stop.longitude, stop.latitude);
      return <button key={stop.id} type="button" data-testid="route-marker" data-sequence={stop.sequence} aria-label={`Stop ${stop.number}: ${stop.name}`} aria-pressed={stop.id === selectedId}
        onClick={() => onSelect(stop.id)} style={{ left: `${left}%`, top: `${top}%` }} className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white text-sm font-bold shadow-md ${stop.id === selectedId ? "bg-amber-600 text-white" : "bg-brand text-white"}`}>{stop.number}</button>;
    })}
    <p className="absolute right-3 bottom-3 left-3 text-xs text-stone-500">Route overview · Geographic map unavailable</p>
  </div>;
}

export function JourneyMap({ stops, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markersRef = useRef<{ id: string; marker: import("mapbox-gl").Marker; button: HTMLButtonElement }[]>([]);
  const selectRef = useRef(onSelect);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const token = getMapboxToken();
  const data = useMemo(() => buildMapData(stops), [stops]);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);

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
      map?.remove(); mapRef.current = null; setState("error");
    }
    async function initialize() {
      try {
        const mapbox = (await import("mapbox-gl")).default;
        if (disposed || !container.current) return;
        if (!mapbox.supported()) throw new Error("WebGL unavailable");
        map = new mapbox.Map({ container: container.current, accessToken: token, style: "mapbox://styles/mapbox/streets-v12", center: [data.markers[0].longitude, data.markers[0].latitude], zoom: 11 });
        mapRef.current = map;
        map.addControl(new mapbox.NavigationControl(), "top-right");
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
            .setPopup(new mapbox.Popup({ offset: 24 }).setDOMContent(popupContent)).addTo(map);
          button.addEventListener("click", () => selectRef.current(stop.id));
          markersRef.current.push({ id: stop.id, marker, button });
          bounds.extend([stop.longitude, stop.latitude]);
        }
        map.fitBounds(bounds, { padding: 55, maxZoom: 13, duration: 0 });
        map.on("load", () => {
          if (disposed || failed || !map) return;
          clearTimeout(timeout);
          map.addSource("journey-sequence", { type: "geojson", data: data.line });
          map.addLayer({ id: "journey-sequence", type: "line", source: "journey-sequence", paint: { "line-color": "#245b46", "line-width": 4, "line-opacity": 0.85 }, layout: { "line-join": "round", "line-cap": "round" } });
          setState("ready");
        });
        map.on("error", fail);
        timeout = setTimeout(fail, 12000);
        observer = new ResizeObserver(() => map?.resize()); observer.observe(container.current);
      } catch { fail(); }
    }
    void initialize();
    return () => { disposed = true; clearTimeout(timeout); observer?.disconnect(); markersRef.current.forEach(({ marker }) => marker.remove()); markersRef.current = []; if (!failed) map?.remove(); mapRef.current = null; };
  }, [token, data]);

  useEffect(() => {
    markersRef.current.forEach(({ id, marker, button }) => {
      const selected = id === selectedId;
      button.setAttribute("aria-pressed", String(selected)); button.classList.toggle("is-selected", selected);
      if (selected && !marker.getPopup()?.isOpen()) marker.togglePopup();
      else if (!selected && marker.getPopup()?.isOpen()) marker.getPopup()?.remove();
    });
  }, [selectedId, state]);

  const selected = data.markers.find((stop) => stop.id === selectedId);
  const fallback = !token || state === "error" || !data.markers.length;
  return <section aria-label="Journey route map" className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
    <div className={fallback ? "hidden" : "relative"}><div ref={container} className="h-80 w-full sm:h-96"/>{state === "loading" && !fallback && <p role="status" className="absolute bottom-4 left-4 rounded-xl bg-white p-3 text-sm shadow">Loading journey map…</p>}</div>
    {fallback && <RoutePreview stops={stops} selectedId={selectedId} onSelect={onSelect}/>}
    {selected && <div role="status" className="border-t border-stone-100 px-5 py-4"><p className="font-semibold">{selected.number}. {selected.name}</p>{selected.description && <p className="mt-1 text-sm text-stone-600">{selected.description}</p>}</div>}
    <p className="border-t border-stone-100 px-5 py-3 text-xs leading-5 text-stone-500">Lines connect stored stops in their original sequence, not roads or navigation directions.{data.missing ? ` ${data.missing} ${data.missing === 1 ? "stop has" : "stops have"} no coordinates; missing legs are not drawn.` : ""}</p>
  </section>;
}
