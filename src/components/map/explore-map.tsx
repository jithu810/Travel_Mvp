'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ExploreJourney } from '@/lib/discovery/explore-types';
import type { SelectedDestination } from '@/lib/discovery/selected-destination';

const Map = dynamic(() => import('./explore-mapbox').then(module => module.ExploreMapbox), {
  ssr: false, loading: () => <div role="status" className="flex h-[340px] items-center justify-center rounded-3xl bg-[#e7eedf] text-brand sm:h-[440px]">Opening the world…</div>,
});
export function ExploreMap(props: { journeys: ExploreJourney[]; selected: SelectedDestination | null }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container}>{visible ? <Map {...props} /> : <div className="h-[340px] rounded-3xl bg-[#e7eedf] sm:h-[440px]" />}</div>;
}
