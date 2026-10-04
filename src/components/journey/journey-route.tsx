"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from 'next/link';
import { JourneyMap } from "@/components/map/journey-map";
import { StopPhoto } from './stop-photo';
import { orderedStops } from "@/lib/journey/map-data";
import type { JourneyStop } from "@/lib/journey/types";

export function JourneyRoute({ stops, children, controls, travelHref }: { stops: JourneyStop[]; children?: ReactNode; controls?: ReactNode; travelHref?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = useMemo(() => orderedStops(stops), [stops]);
  function selectFromMap(id: string) {
    setSelected(id);
    const element = document.getElementById(`story-stop-${id}`);
    element?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    element?.focus({ preventScroll: true });
  }
  return <div className="space-y-10 sm:space-y-14">
    {controls}
    <section id="journey-route" aria-label="Journey map overview" className="scroll-mt-6"><JourneyMap stops={stops} selectedId={selected} onSelect={selectFromMap} story />
      {travelHref && <div className="mt-5 flex flex-wrap items-center justify-between gap-4"><p className="max-w-xl text-sm leading-6 text-stone-600">Follow the creator’s stops in Travel Mode. GPS can detect arrivals after you start; manual completion remains available. Progress stays in this browser tab.</p><Link href={travelHref} className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-sm font-semibold text-white">Preview Travel Mode →</Link></div>}
    </section>
    {children}
    <section aria-labelledby="route-stops" className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">Journey story</p><h2 id="route-stops" className="mt-3 mb-8 text-3xl font-semibold tracking-tight">The places along the way</h2>
      {!sorted.length && <p className="py-6 text-sm text-stone-500">The creator has not added stops yet.</p>}
      <ol>{sorted.map((stop, index) => <li key={stop.id} id={`story-stop-${stop.id}`} tabIndex={-1} data-testid="journey-stop" data-sequence={stop.sequence} className={`relative scroll-mb-24 pb-10 pl-14 outline-brand sm:pb-14 sm:pl-20 ${selected === stop.id ? 'rounded-2xl bg-[#e7eedf]/50' : ''}`}>
        {index < sorted.length - 1 && <div aria-hidden="true" className="absolute top-12 bottom-0 left-5 w-px bg-stone-300 sm:left-6" />}
        <button type="button" aria-label={`Select stop ${index + 1}: ${stop.name}`} aria-pressed={selected === stop.id} onClick={() => setSelected(stop.id)} className={`absolute top-0 left-0 flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold sm:h-12 sm:w-12 ${selected === stop.id ? 'bg-amber-600 text-white' : 'bg-brand text-white'}`}>{index + 1}</button>
        <div className="min-w-0 pt-1 pr-3"><p className="text-xs font-semibold tracking-wider text-brand uppercase">{stop.dayNumber != null ? `Day ${stop.dayNumber} · Stop ${index + 1}` : `Stop ${index + 1}`}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"><button type="button" onClick={() => setSelected(stop.id)} className="min-h-11 text-left">{stop.name}</button></h3>
          {stop.description && <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-600">{stop.description}</p>}
          {stop.photo && <StopPhoto key={stop.photo} src={stop.photo} name={stop.name} />}
          {stop.rating != null && Number.isFinite(stop.rating) && <p className="mt-4 text-xs text-stone-500">Stop rating: {stop.rating.toFixed(1)} / 5</p>}
        </div>
      </li>)}</ol>
    </section>
  </div>;
}
