import Link from "next/link";
import { notFound } from "next/navigation";
import { getDestination } from "@/lib/discovery/destinations";
import { getJourneys } from "@/lib/discovery/queries";
import { parseTravelerFilter } from "@/lib/discovery/types";
import { TravelerFilters } from "@/components/journey/traveler-filters";
import { JourneyGrid } from "@/components/journey/journey-grid";
import { DiscoveryNotice } from "@/components/journey/discovery-notice";
import { TravelImage } from "@/components/ui/travel-image";
import { MapboxMap } from "@/components/map/mapbox-map";
import { getMapboxToken } from "@/lib/env";
import { publicMetadata, privateMetadata } from '@/lib/seo/metadata';
import { siteUrl } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/json-ld';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const destination = getDestination((await params).slug);
  return destination ? publicMetadata(`${destination.name} Travel Journeys & Itineraries`, `Explore travel journeys and itineraries for ${destination.name}. Browse routes for solo travelers, couples, friends and families. ${destination.description}`, `/destination/${destination.slug}`, destination.image) : privateMetadata('Destination not found');
}

export default async function DestinationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ traveler?: string }> }) {
  const { slug } = await params;
  const destination = getDestination(slug);
  if (!destination) notFound();
  const traveler = parseTravelerFilter((await searchParams).traveler);
  const result = await getJourneys(slug, traveler);
  return <div className="space-y-8">
    {siteUrl('/') && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Journey', item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Explore', item: siteUrl('/explore') },
      { '@type': 'ListItem', position: 3, name: destination.name, item: siteUrl(`/destination/${slug}`) },
    ] }} />}
    <Link href="/explore" className="inline-flex min-h-11 items-center text-sm font-medium text-stone-500">← All destinations</Link>
    <section className="relative flex min-h-72 items-end overflow-hidden rounded-3xl bg-stone-200 p-6 sm:min-h-96 sm:p-10">
      <TravelImage src={destination.image} alt={`${destination.name} travel inspiration`} sizes="(max-width: 1100px) 100vw, 1100px" priority/>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <div className="relative text-white"><p className="text-xs tracking-widest uppercase">{destination.region}</p><h1 className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">{destination.name}</h1><p className="mt-3 text-white/85">{destination.mood}</p></div>
    </section>
    <p className="max-w-2xl text-lg leading-8 text-stone-600">{destination.description}</p>
    <section className="space-y-5" aria-labelledby="destination-journeys"><div><p className="text-xs font-semibold tracking-wider text-brand uppercase">Choose your company</p><h2 id="destination-journeys" className="mt-2 text-2xl font-semibold">Journeys through {destination.name}</h2></div><TravelerFilters path={`/destination/${slug}`} selected={traveler}/><DiscoveryNotice result={result}/><JourneyGrid journeys={result.journeys}/></section>
    {getMapboxToken() && <section className="space-y-4"><h2 className="text-2xl font-semibold">Around {destination.name}</h2><MapboxMap longitude={destination.longitude} latitude={destination.latitude} zoom={10} label={`${destination.name} area map`}/></section>}
  </div>;
}
