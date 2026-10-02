import Link from "next/link";
import { DestinationSearch } from "@/components/destination/destination-search";
import { DestinationCard } from "@/components/destination/destination-card";
import { JourneyGrid } from "@/components/journey/journey-grid";
import { DiscoveryNotice } from "@/components/journey/discovery-notice";
import { TravelImage } from "@/components/ui/travel-image";
import { destinations } from "@/lib/discovery/destinations";
import { getJourneys } from "@/lib/discovery/queries";
import { publicMetadata, siteDescription } from '@/lib/seo/metadata';
import { siteUrl } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata = {
  ...publicMetadata('Discover & Share Travel Journeys', siteDescription, '/'),
  title: { absolute: 'Discover & Share Travel Journeys | Journey' },
};

export default async function HomePage() {
  const result = await getJourneys();
  const featured = result.source === "demo" ? [0, 8, 4, 11, 1, 14].map((index) => result.journeys[index]).filter(Boolean) : result.journeys.slice(0, 6);
  return (
    <div className="space-y-14 sm:space-y-20">
      {siteUrl('/') && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Journey', url: siteUrl('/'), description: siteDescription }} />}
      <section className="relative isolate rounded-[2rem] bg-[#e7eedf] px-6 py-10 sm:px-10 sm:py-16 lg:px-12">
        <div className="absolute inset-y-0 right-0 -z-10 hidden w-[48%] overflow-hidden rounded-r-[2rem] lg:block">
          <TravelImage src="/images/goa.jpg" alt="Coastal travel inspiration" sizes="550px" priority />
          <div className="absolute inset-0 bg-gradient-to-r from-[#e7eedf] via-[#e7eedf]/10 to-transparent" />
        </div>
        <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-brand uppercase">Less scrolling. More going.</p>
        <h1 className="max-w-lg text-4xl leading-[1.08] font-semibold tracking-tight sm:text-6xl">Find your place.<br/><span className="text-brand">Follow a journey.</span></h1>
        <p className="mt-5 mb-7 max-w-md text-base leading-7 text-stone-600">Discover travel through routes, real stops, and the stories between them. Your next chapter starts with a place.</p>
        <DestinationSearch />
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><span className="text-stone-500">Start somewhere:</span>{destinations.slice(0, 3).map((destination) => <Link className="min-h-11 py-3 font-medium text-brand hover:underline" key={destination.slug} href={`/destination/${destination.slug}`}>{destination.name} ↗</Link>)}</div>
      </section>
      <section aria-labelledby="destinations-heading">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-xs font-semibold tracking-wider text-brand uppercase">Pick a place, find a path</p><h2 id="destinations-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">Somewhere worth going.</h2></div><Link href="/explore" className="min-h-11 py-3 text-sm font-semibold text-brand">Explore all ↗</Link></div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{destinations.map((destination) => <DestinationCard key={destination.slug} destination={destination}/>)}</div>
      </section>
      <section aria-labelledby="journeys-heading" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-xs font-semibold tracking-wider text-brand uppercase">The route is the story</p><h2 id="journeys-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">{result.source === "demo" ? "Journeys to spark an idea." : "Fresh journeys to explore."}</h2></div><Link href="/explore" className="min-h-11 py-3 text-sm font-semibold text-brand">Browse journeys ↗</Link></div>
        <DiscoveryNotice result={result}/><JourneyGrid journeys={featured}/>
      </section>
      <section className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-brand p-8 text-white sm:flex-row sm:items-center sm:p-10"><div><p className="text-2xl font-semibold">Your kind of travel is out there.</p><p className="mt-2 text-sm text-white/75">Solo, together, or with the whole crew. Find a route that feels like you.</p></div><Link href="/explore" className="inline-flex min-h-12 shrink-0 items-center rounded-full bg-white px-6 text-sm font-semibold text-brand">Explore journeys ↗</Link></section>
    </div>
  );
}
