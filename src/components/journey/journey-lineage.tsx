import Link from 'next/link';
import { CreatorAvatar } from './creator-avatar';
import { TravelImage } from '@/components/ui/travel-image';
import type { JourneyOrigin, InspiredJourney } from '@/lib/journey/lineage-queries';
import type { LineageNode } from '@/lib/journey/lineage';

export function JourneyOriginSection({ source, root }: { source: JourneyOrigin; root: LineageNode | null }) {
  return <section aria-labelledby="journey-origin-heading" className="border-t border-stone-200 pt-6">
    <h2 id="journey-origin-heading" className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">Journey origin</h2>
    <div className="mt-3 flex items-start gap-3">
      <CreatorAvatar name={source.creatorName} src={source.creatorAvatar}/>
      <div className="min-w-0 break-words">
        <p className="text-sm leading-6 text-stone-500">Remixed from <Link prefetch={false} href={`/journey/${source.id}`} className="inline-flex min-h-11 max-w-full items-center font-semibold text-brand underline underline-offset-4"><span className="min-w-0 break-words">{source.title}</span></Link></p>
        {source.creatorUsername ? <Link prefetch={false} href={`/profile/${encodeURIComponent(source.creatorUsername)}`} className="inline-flex min-h-11 max-w-full items-center text-sm text-stone-600 underline underline-offset-4"><span className="min-w-0 break-words">By {source.creatorName} · @{source.creatorUsername}</span></Link> : <p className="text-sm text-stone-600">By {source.creatorName}</p>}
        {root && <details className="mt-2 text-sm text-stone-500"><summary className="min-h-11 cursor-pointer py-3 font-medium">Earlier inspiration</summary><Link prefetch={false} href={`/journey/${root.id}`} className="inline-flex min-h-11 max-w-full items-center text-brand underline underline-offset-4"><span className="min-w-0 break-words">Earlier journey: {root.title}</span></Link></details>}
      </div>
    </div>
  </section>;
}

export function InspiredJourneys({ journeys }: { journeys: InspiredJourney[] }) {
  if (!journeys.length) return null;
  return <section aria-labelledby="inspired-journeys-heading" className="border-t border-stone-200 pt-8">
    <h2 id="inspired-journeys-heading" className="text-xl font-semibold">Inspired journeys</h2>
    <p className="mt-2 text-sm leading-6 text-stone-500">Travelers made these journeys their own by remixing this story.</p>
    <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {journeys.map(journey => <li key={journey.id} className="min-w-0"><Link prefetch={false} href={`/journey/${journey.id}`} className="flex min-h-20 items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4" aria-label={`Explore inspired journey: ${journey.title}`}>
        {journey.coverImage && <span className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100"><TravelImage src={journey.coverImage} alt="" sizes="80px"/></span>}
        <span className="min-w-0 flex-1 break-words"><span className="block font-semibold">{journey.title}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{[journey.destinationName, journey.travelerType, journey.durationDays > 0 ? `${journey.durationDays} ${journey.durationDays === 1 ? 'day' : 'days'}` : null].filter(Boolean).join(' · ')}</span></span><span aria-hidden="true" className="shrink-0 text-brand">↗</span>
      </Link></li>)}
    </ul>
  </section>;
}
