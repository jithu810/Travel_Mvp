"use client";

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const MapboxMap = dynamic(() => import('@/components/map/mapbox-map').then(module => module.MapboxMap), {
  ssr: false,
  loading: () => <div role="status" className="flex h-80 items-center justify-center rounded-3xl bg-[#e7eedf] text-sm text-brand sm:h-[440px]">Loading the map preview…</div>,
});

// Keep the existing Mapbox integration off the homepage's initial render path.
export function HomeMapPreview() {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container}>
    {visible ? <MapboxMap longitude={75.8} latitude={12} zoom={5} label="Southern India destination map preview" /> : <div className="flex h-80 items-center justify-center rounded-3xl bg-[#e7eedf] text-sm text-brand sm:h-[440px]">A little perspective for your next journey.</div>}
  </div>;
}
