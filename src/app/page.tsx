import Link from 'next/link';
import { DestinationSearch } from '@/components/destination/destination-search';
import { DestinationCard } from '@/components/destination/destination-card';
import { JourneyGrid } from '@/components/journey/journey-grid';
import { TravelImage } from '@/components/ui/travel-image';
import { EmptyState } from '@/components/ui/empty-state';
import { ExploreMap } from '@/components/map/explore-map';
import { HomeMapPreview } from '@/components/map/home-map-preview';
import { destinations, getDestination } from '@/lib/discovery/destinations';
import { getExploreJourneys } from '@/lib/discovery/queries';
import { publicMetadata, siteDescription } from '@/lib/seo/metadata';
import { siteUrl } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/json-ld';
import { WelcomeCard } from '@/components/ui/welcome-card';
import { RetryButton } from '@/components/ui/retry-button';
import { JourneySearch } from '@/components/journey/discovery-controls';

export const metadata = {
  ...publicMetadata('Discover & Share Travel Journeys', siteDescription, '/'),
  title: { absolute: 'Discover & Share Travel Journeys | Journey' },
};

const travelStyles = [
  { type: 'solo', name: 'Solo', description: 'Go at your own pace.', symbol: '↗' },
  { type: 'couple', name: 'Couple', description: 'Find your next shared story.', symbol: '♡' },
  { type: 'friends', name: 'Friends', description: 'Take the scenic way together.', symbol: '✳' },
  { type: 'family', name: 'Family', description: 'Make room for everyone.', symbol: '⌂' },
];

export default async function HomePage() {
  const result = await getExploreJourneys(null, "all", { pageSize: 100 });
  // The launch homepage features real published journeys, never demo fallback data.
  const featured = result.source === 'supabase' ? result.journeys.filter(journey => !journey.isDemo).slice(0, 6) : [];
  const popular = [...result.journeys].filter(journey => journey.likes > 0).sort((a, b) => b.likes - a.likes).slice(0, 3);
  const publishedDestinations = result.source === 'supabase' ? [...new Set(result.journeys.filter(journey => !journey.isDemo).map(journey => journey.destinationSlug))].flatMap(slug => { const destination = getDestination(slug); return destination ? [destination] : []; }) : [];
  // Temporary editorial shortcuts when there is no live destination data.
  // These links are not the search source; search is worldwide Mapbox geocoding.
  const quickDestinations = (publishedDestinations.length ? publishedDestinations : destinations).slice(0, 3);
  return <div className="space-y-10 sm:space-y-14">
    {siteUrl('/') && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Journey', url: siteUrl('/'), description: siteDescription }} />}
    <section aria-labelledby="home-heading" className="relative">
      <div className="relative h-[320px] overflow-hidden rounded-[1.75rem] bg-stone-200 sm:h-[400px] lg:h-[420px]">
        <TravelImage src="/images/varkala.jpg" alt="Coastal travel inspiration for Varkala" sizes="(max-width: 1200px) 100vw, 1100px" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-14 text-white sm:px-10 sm:pb-16">
          <p className="mb-3 text-xs font-semibold tracking-[0.18em] uppercase text-white/90">Places. People. A different perspective.</p>
          <h1 id="home-heading" className="max-w-2xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl">Where will your<br />next story take you?</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-white/90 sm:text-base">Discover beautiful journeys shared by travelers. Follow their stops, or remix a route into your own.</p>
        </div>
      </div>
      <div className="relative mx-4 -mt-8 sm:mx-10"><DestinationSearch /></div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 px-4 text-sm sm:px-10"><span className="text-stone-500">Start somewhere:</span>{quickDestinations.map(destination => <Link key={destination.slug} href={`/destination/${destination.slug}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand">{destination.name}<span aria-hidden="true">↗</span></Link>)}</div>
      <nav aria-label="Discover Journey Creator" className="mt-2 flex flex-wrap gap-x-5 px-4 text-sm sm:px-10"><a href="#journeys-heading" className="inline-flex min-h-11 items-center font-medium text-brand">Discover journeys ↓</a><Link href="/explore" className="inline-flex min-h-11 items-center font-medium text-brand">Explore the world ↗</Link><a href="#styles-heading" className="inline-flex min-h-11 items-center font-medium text-brand">Choose your travel style ↓</a></nav>
    </section>
    <div className="max-w-xl"><JourneySearch /></div>
    <WelcomeCard />

    <section aria-labelledby="popular-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="popular-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">Popular with travelers.</h2><p className="mt-2 text-sm text-stone-600">Most liked among the latest 100 public journeys.</p></div><Link href="/explore?sort=popular" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">Explore popular journeys ↗</Link></div>
      {popular.length ? <JourneyGrid journeys={popular} /> : <p className="text-sm leading-6 text-stone-500">{result.error ? 'Popular stories will return when journeys finish loading.' : 'Traveler favorites will appear here as public journeys receive likes.'}</p>}
    </section>

    <section aria-labelledby="journeys-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-xs font-semibold tracking-[0.15em] uppercase text-brand">Through a traveler’s eyes</p><h2 id="journeys-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">Recently published.</h2><p className="mt-2 text-sm text-stone-600">Real places, personal routes, and the stops along the way.</p></div><Link href="/explore?sort=recent" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand">Explore journeys <span aria-hidden="true">↗</span></Link></div>
      {featured.length ? <JourneyGrid journeys={featured} /> : <EmptyState title={result.error ? 'Journeys are taking a little longer to arrive.' : 'The next great journey could be yours.'}><p>{result.error ? 'We couldn’t load published journeys right now. You can still browse destinations, or try again.' : 'Published traveler journeys will appear here. In the meantime, find a destination that sparks your curiosity.'}</p><div className="flex flex-wrap gap-3">{result.error && <RetryButton />}<Link href="/explore" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-white">Browse destinations</Link></div></EmptyState>}
    </section>

    <section aria-labelledby="destinations-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-xs font-semibold tracking-[0.15em] uppercase text-brand">Coastlines to hill country</p><h2 id="destinations-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">Find somewhere that feels like you.</h2></div><Link href="/explore" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">All destinations ↗</Link></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">{destinations.map(destination => <DestinationCard key={destination.slug} destination={destination} />)}</div>
    </section>

    <section aria-labelledby="styles-heading">
      <div className="mb-6"><p className="mb-2 text-xs font-semibold tracking-[0.15em] uppercase text-brand">Your people. Your pace.</p><h2 id="styles-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">Who’s coming along?</h2></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{travelStyles.map(style => <Link key={style.type} href={`/explore?traveler=${style.type}`} className="rounded-2xl border border-stone-200 bg-white p-5 transition-colors hover:border-brand/40 hover:bg-[#f0f5ed]"><span aria-hidden="true" className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#e7eedf] text-xl text-brand">{style.symbol}</span><h3 className="font-semibold">{style.name} <span aria-hidden="true" className="float-right text-brand">↗</span></h3><p className="mt-2 text-sm leading-6 text-stone-600">{style.description}</p></Link>)}</div>
    </section>

    <section aria-labelledby="map-heading" className="grid items-center gap-6 lg:grid-cols-[0.8fr_1.4fr] lg:gap-10">
      <div><p className="mb-3 text-xs font-semibold tracking-[0.15em] uppercase text-brand">A place to begin</p><h2 id="map-heading" className="text-3xl font-semibold tracking-tight">See the bigger picture.</h2><p className="mt-4 max-w-md text-sm leading-7 text-stone-600">See where travelers have shared their stories. Open a journey marker, or choose a destination to explore its stops.</p><div className="mt-5 flex flex-wrap gap-2">{destinations.map(destination => <Link key={destination.slug} href={`/destination/${destination.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-brand">{destination.name} ↗</Link>)}</div><p className="mt-5 text-xs text-stone-500">{result.journeys.length ? "Public journey locations · Explore more places on the Explore page." : "Destination inspiration · Browse journeys using the links above."}</p></div>
      {result.journeys.length ? <ExploreMap journeys={result.journeys.slice(0, 24)} selected={null} collectionHref="/explore" /> : <HomeMapPreview />}
    </section>
  </div>;
}
