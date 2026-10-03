import type { Metadata } from 'next';
import Link from 'next/link';
import { DestinationSearch } from '@/components/destination/destination-search';
import { getExploreJourneys } from '@/lib/discovery/queries';
import { destinationHref, parseSelectedDestination } from '@/lib/discovery/selected-destination';
import { EmptyState } from '@/components/ui/empty-state';
import { parseTravelerFilter } from '@/lib/discovery/types';
import { TravelerFilters } from '@/components/journey/traveler-filters';
import { JourneyGrid } from '@/components/journey/journey-grid';
import { ExploreMap } from '@/components/map/explore-map';
import { TravelImage } from '@/components/ui/travel-image';
import { publicMetadata } from '@/lib/seo/metadata';
import { RetryButton } from '@/components/ui/retry-button';

export const metadata: Metadata = publicMetadata('Explore Travel Journeys', 'Browse destinations and travel journeys for solo travelers, couples, friends and families. Follow ordered stops or remix a journey into your own trip.', '/explore');

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const traveler = parseTravelerFilter(params.traveler);
  const selected = parseSelectedDestination(params);
  const invalid = params.destination !== undefined && !selected;
  const result = invalid ? { journeys: [], source: 'supabase' as const, loaded: false } : await getExploreJourneys(selected, traveler);
  const destinations = [...new Map(result.journeys.map(journey => [journey.destinationSlug, journey])).values()].slice(0, 6);
  return <div className="space-y-8 sm:space-y-10">
    <div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">Explore journeys</p><h1 className="mt-3 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">A world of journeys.</h1><p className="mt-3 text-sm leading-6 text-stone-600 sm:text-base">Find your next place through the stories of travelers who went there.</p><div className="mt-6"><DestinationSearch /></div></div>
    {invalid && <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">That destination link is incomplete. Search and select a destination again.</p>}
    <section className="space-y-4" aria-label="Destination context">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-tight">{selected ? `Journeys in ${selected.name}` : 'Let curiosity lead the way.'}</h2><p className="mt-1 text-sm text-stone-500">{selected ? selected.label : 'Pan, zoom, and discover a different perspective.'}</p></div>{selected && <Link href="/explore" className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline">Clear destination</Link>}</div>
      <ExploreMap journeys={result.journeys} selected={selected} />
    </section>
    {!selected && destinations.length > 0 && <section aria-label="Browse destinations" className="space-y-4"><h2 className="text-xl font-semibold">Places with stories to tell.</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{destinations.map(journey => <Link key={journey.destinationSlug} href={`/destination/${encodeURIComponent(journey.destinationSlug)}`} className="group relative flex min-h-36 items-end overflow-hidden rounded-2xl bg-stone-200 p-4"><TravelImage src={journey.coverImage} alt={`${journey.destinationName} journey cover`} sizes="(max-width: 640px) 50vw, 360px" /><div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" /><span className="relative font-semibold text-white">{journey.destinationName}<span className="mt-1 block text-xs font-normal">Explore journeys ↗</span></span></Link>)}</div></section>}
    <section id="published-journeys" tabIndex={-1} className="scroll-mb-24 space-y-5 outline-brand" aria-label="Published journeys"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold tracking-wider text-brand uppercase">From fellow travelers</p><h2 className="mt-2 text-2xl font-semibold">{selected ? `Explore ${selected.name} your way.` : 'Find your travel style.'}</h2></div>{result.loaded && !result.error && <p className="text-sm text-stone-500">{result.journeys.length === 100 ? 'Showing up to 100 published journeys' : `${result.journeys.length} published ${result.journeys.length === 1 ? 'journey' : 'journeys'}`}</p>}</div>
      <TravelerFilters path={selected ? destinationHref(selected) : '/explore'} selected={traveler} />
      {result.error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">We couldn’t load journeys right now. Please try again.</p>}
      {result.journeys.length ? <JourneyGrid journeys={result.journeys} matchingStops={Object.fromEntries(result.journeys.map(journey => [journey.id, journey.matchingStops]))} /> : <EmptyState title={result.error ? 'We couldn’t load these journeys.' : invalid ? 'Choose a destination to continue.' : 'No journeys here yet.'}><p>{result.error ? 'Your destination and travel style will stay selected when you retry.' : traveler === 'all' ? 'Try another destination or explore somewhere new.' : `No ${traveler} journeys in this view yet. Try another travel style or explore somewhere new.`}</p><div className="flex flex-wrap gap-3">{result.error && <RetryButton />}<Link href="/explore" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-white">Explore all journeys</Link><Link href="/create" className="mt-4 inline-flex min-h-11 items-center px-3 font-semibold text-brand underline">Create a journey</Link></div></EmptyState>}
    </section>
  </div>;
}
