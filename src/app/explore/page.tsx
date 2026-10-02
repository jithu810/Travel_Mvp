import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/page-heading";
import { DestinationSearch } from "@/components/destination/destination-search";
import { DestinationCard } from "@/components/destination/destination-card";
import { destinations } from "@/lib/discovery/destinations";
import { getJourneys } from "@/lib/discovery/queries";
import { parseTravelerFilter } from "@/lib/discovery/types";
import { TravelerFilters } from "@/components/journey/traveler-filters";
import { JourneyGrid } from "@/components/journey/journey-grid";
import { DiscoveryNotice } from "@/components/journey/discovery-notice";
import { publicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = publicMetadata('Explore Travel Journeys', 'Browse destinations and travel journeys for solo travelers, couples, friends and families. Follow ordered stops or remix a journey into your own trip.', '/explore');

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ traveler?: string }> }) {
  const traveler = parseTravelerFilter((await searchParams).traveler);
  const result = await getJourneys(undefined, traveler);
  return <div className="space-y-6">
    <PageHeading eyebrow="Explore" title="A world of journeys." description="Discover places through the routes that connect them." />
    <DestinationSearch />
    <section aria-label="Browse destinations" className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3 lg:grid-cols-5">{destinations.map((destination) => <DestinationCard key={destination.slug} destination={destination}/>)}</section>
    <section className="space-y-6 pt-8"><h2 className="text-2xl font-semibold">Find your travel style.</h2><TravelerFilters path="/explore" selected={traveler}/><DiscoveryNotice result={result}/><JourneyGrid journeys={result.journeys}/></section>
  </div>;
}
