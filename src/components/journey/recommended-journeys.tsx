import Link from 'next/link';
import { JourneyCard } from './journey-card';
import type { RecommendationResult } from '@/lib/discovery/recommendations';

export function RecommendedJourneys({ results, personalized }: { results: RecommendationResult[]; personalized: boolean }) {
  if (!results.length) return null;
  return <section aria-labelledby="recommendations-heading" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div>
      <h2 id="recommendations-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">{personalized ? 'Journeys you may like.' : 'More journeys to explore.'}</h2>
      <p className="mt-2 text-sm text-stone-600">{personalized ? 'Inspired by journeys you’ve liked or saved, with room for a different journey.' : 'Public stories to spark your next trip.'}</p>
    </div><Link href="/explore" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">Explore all journeys ↗</Link></div>
    <div role="list" aria-label="Recommended journey cards" className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible">{results.map(result => <div role="listitem" key={result.journey.id} className="w-[min(85vw,320px)] min-w-0 shrink-0 space-y-2 lg:w-auto">
      <JourneyCard journey={result.journey}/><p className="break-words px-2 text-xs leading-5 text-stone-600">{result.reasons[0]}</p>
    </div>)}</div>
  </section>;
}
