import type { Metadata } from 'next';
import Link from 'next/link';
import { DestinationSearch } from '@/components/destination/destination-search';
import { getExploreJourneys } from '@/lib/discovery/queries';
import { destinationHref, parseSelectedDestination } from '@/lib/discovery/selected-destination';
import { EmptyState } from '@/components/ui/empty-state';
import { parseTravelerFilter } from '@/lib/discovery/types';
import { DiscoveryControls } from '@/components/journey/discovery-controls';
import { parseDiscoverySearch, parseDiscoverySort, parseDiscoveryPage } from '@/lib/discovery/browse';
import { JourneyGrid } from '@/components/journey/journey-grid';
import { ExploreMap } from '@/components/map/explore-map';
import { publicMetadata } from '@/lib/seo/metadata';
import { RetryButton } from '@/components/ui/retry-button';

export const metadata: Metadata = publicMetadata('Explore Travel Journeys', 'Browse destinations and travel journeys for solo travelers, couples, friends and families. Follow ordered stops or remix a journey into your own trip.', '/explore');

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const traveler = parseTravelerFilter(params.traveler);
  const selected = parseSelectedDestination(params);
  const search = parseDiscoverySearch(params.q);
  const sort = parseDiscoverySort(params.sort);
  const page = parseDiscoveryPage(params.page);
  const filters = { q: search, sort: sort === 'all' ? '' : sort, traveler: traveler === 'all' ? '' : traveler };
  const url = new URL(selected ? destinationHref(selected) : '/explore', 'http://journey.internal');
  for (const [key, value] of Object.entries(filters)) if (value) url.searchParams.set(key, value);
  const path = url.pathname + url.search;
  function pageHref(next: number) { const link = new URL(path, 'http://journey.internal'); link.searchParams.set('page', String(next)); return link.pathname + link.search; }
  const clear = new URL('/explore', 'http://journey.internal');
  for (const [key, value] of Object.entries(filters)) if (value) clear.searchParams.set(key, value);
  const invalid = params.destination !== undefined && !selected;
  const result = invalid ? { journeys: [], source: 'supabase' as const, loaded: false, total: 0, page: 1, pages: 1 } : await getExploreJourneys(selected, traveler, { search, sort, page });
  return <div className="space-y-8 sm:space-y-10">
    <div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">Explore journeys</p><h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">A world of journeys.</h1><p className="mt-3 text-sm leading-6 text-stone-600 sm:text-base">Find your next place through the stories of travelers who went there.</p><div className="mt-6"><DestinationSearch key={path} filters={filters} journeySearch={{ path, value: search }} /></div></div>
    <div className="max-w-2xl space-y-2"><DiscoveryControls path={path} sort={sort} traveler={traveler} />
      <p className="text-xs leading-5 text-stone-500">Browse and search the latest 100 public journeys in this collection. {sort === 'popular' ? 'Popular ranks these journeys by likes; ties show newer stories first.' : 'Newest published stories appear first.'}</p>
    </div>
    {invalid && <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">That destination link is incomplete. Search and select a destination again.</p>}
    <section className="space-y-4" aria-label="Destination context">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-tight">{selected ? `Journeys in ${selected.name}` : 'Let curiosity lead the way.'}</h2><p className="mt-1 text-sm text-stone-500">{selected ? selected.label : 'Pan, zoom, and discover a different perspective.'}</p></div>{selected && <Link href={clear.pathname + clear.search} className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline">Clear destination</Link>}</div>
      <ExploreMap journeys={result.journeys} selected={selected} />
    </section>
    <section id="published-journeys" tabIndex={-1} className="scroll-mb-24 space-y-5 outline-brand" aria-label="Published journeys"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold tracking-wider text-brand uppercase">From fellow travelers</p><h2 className="mt-2 text-2xl font-semibold">{selected ? `Explore ${selected.name} your way.` : sort === 'popular' ? 'Popular with travelers.' : sort === 'recent' ? 'Recently published.' : 'Journeys to inspire your next trip.'}</h2></div>{result.loaded && !result.error && <p className="text-sm text-stone-500">{result.total ?? result.journeys.length} matching {(result.total ?? result.journeys.length) === 1 ? 'journey' : 'journeys'}</p>}</div>
      {result.error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">We couldn’t load journeys right now. Please try again.</p>}
      {result.journeys.length ? <JourneyGrid journeys={result.journeys} matchingStops={Object.fromEntries(result.journeys.map(journey => [journey.id, journey.matchingStops]))} /> : <EmptyState title={result.error ? 'We couldn’t load these journeys.' : invalid ? 'Choose a destination to continue.' : search ? 'No journeys found.' : 'No journeys here yet.'}><p>{result.error ? 'Your destination and travel style will stay selected when you retry.' : search ? 'Try another destination or search term.' : traveler === 'all' ? 'Be the first traveler to share one, or explore somewhere new.' : `No ${traveler} journeys in this view yet. Try another travel style or explore somewhere new.`}</p><div className="flex flex-wrap gap-3">{result.error && <RetryButton />}<Link href="/explore" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-white">Explore all journeys</Link><Link href="/create" className="mt-4 inline-flex min-h-11 items-center px-3 font-semibold text-brand underline">Create a journey</Link></div></EmptyState>}
      {(result.pages || 1) > 1 && <nav aria-label="Journey pages" className="flex flex-wrap items-center gap-4">{(result.page || 1) > 1 && <Link href={pageHref((result.page || 1) - 1)} className="inline-flex min-h-11 items-center text-brand underline">Previous journeys</Link>}<span className="text-sm text-stone-500">Page {result.page} of {result.pages}</span>{(result.page || 1) < (result.pages || 1) && <Link href={pageHref((result.page || 1) + 1)} className="inline-flex min-h-11 items-center text-brand underline">More journeys →</Link>}</nav>}
    </section>
  </div>;
}
