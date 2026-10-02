"use client";

import { useState } from "react";
import { JourneyMap } from "@/components/map/journey-map";
import { TravelImage } from "@/components/ui/travel-image";
import { orderedStops } from "@/lib/journey/map-data";
import type { JourneyStop } from "@/lib/journey/types";

export function JourneyRoute({ stops }: { stops: JourneyStop[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = orderedStops(stops);
  return <div id="journey-route" className="grid scroll-mt-6 items-start gap-8 lg:grid-cols-[1.05fr_1fr]">
    <section className="space-y-4 lg:sticky lg:top-6"><h2 className="text-2xl font-semibold">The journey, on a map</h2><JourneyMap stops={stops} selectedId={selected} onSelect={setSelected}/></section>
    <section aria-labelledby="route-stops"><h2 id="route-stops" className="mb-6 text-2xl font-semibold">The places along the way</h2>
      {!sorted.length && <p className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">The creator has not added stops yet.</p>}
      <ol className="space-y-5">{sorted.map((stop, index) => <li key={stop.id} data-testid="journey-stop" data-sequence={stop.sequence} className="relative pl-14">
        {index < sorted.length - 1 && <div aria-hidden="true" className="absolute top-11 bottom-[-20px] left-5 w-px bg-stone-200"/>}
        <button type="button" aria-label={`Select stop ${index + 1}: ${stop.name}`} aria-pressed={selected === stop.id} onClick={() => setSelected(stop.id)} className={`absolute top-1 left-0 flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${selected === stop.id ? "bg-amber-600 text-white" : "bg-brand text-white"}`}>{index + 1}</button>
        <div className={`overflow-hidden rounded-2xl border bg-white ${selected === stop.id ? "border-brand ring-1 ring-brand" : "border-stone-200"}`}>
          {stop.photo && <div className="relative aspect-[16/9]"><TravelImage src={stop.photo} alt={stop.name} sizes="(max-width: 1024px) 100vw, 450px"/></div>}
          <div className="p-5">{stop.dayNumber != null && <p className="mb-2 text-xs font-semibold text-brand">Day {stop.dayNumber}</p>}<h3><button type="button" onClick={() => setSelected(stop.id)} className="min-h-11 text-left font-semibold">{stop.name}</button></h3>{stop.description && <p className="mt-1 text-sm leading-6 text-stone-600">{stop.description}</p>}{stop.rating != null && Number.isFinite(stop.rating) && <p className="mt-3 text-xs text-stone-500">Stop rating: {stop.rating.toFixed(1)} / 5</p>}</div>
        </div>
      </li>)}</ol>
    </section>
  </div>;
}
