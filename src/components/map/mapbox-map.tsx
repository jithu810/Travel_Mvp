"use client";

import { useEffect, useRef, useState } from "react";
import { getMapboxToken } from "@/lib/env";

type MapboxMapProps = {
  longitude?: number;
  latitude?: number;
  zoom?: number;
  label?: string;
};

export function MapboxMap({ longitude = 76.27, latitude = 10.85, zoom = 5, label = "Travel exploration map" }: MapboxMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const token = getMapboxToken();

  useEffect(() => {
    if (!token || !container.current) return;
    let disposed = false;
    let map: import("mapbox-gl").Map | undefined;
    let resizeObserver: ResizeObserver | undefined;

    async function initialize() {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (disposed || !container.current) return;
        if (!mapboxgl.supported()) throw new Error("WebGL is unavailable");
        map = new mapboxgl.Map({
          container: container.current,
          accessToken: token,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [longitude, latitude],
          zoom,
          attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        map.on("error", () => { if (!disposed) setError(true); });
        map.on("load", () => { if (!disposed) setError(false); });
        resizeObserver = new ResizeObserver(() => map?.resize());
        resizeObserver.observe(container.current);
      } catch {
        if (!disposed) setError(true);
      }
    }

    void initialize();
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      map?.remove();
    };
  }, [token, longitude, latitude, zoom]);

  return (
    <section aria-label={label} className="relative overflow-hidden rounded-3xl border border-stone-200 bg-[#e7eedf]">
      <div ref={container} className="h-80 w-full sm:h-[440px]" />
      {(!token || error) && <div className="absolute inset-0 flex items-center justify-center bg-[#e7eedf] p-8 text-center">
        <div><p className="text-lg font-semibold">{error ? "The map is unavailable right now." : "The world is waiting."}</p>
          <p className="mt-2 text-sm text-stone-600">{error ? "Please try again later." : "The map preview will appear here when it is connected."}</p>
        </div>
      </div>}
    </section>
  );
}
