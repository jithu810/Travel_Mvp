import { PageHeading } from '@/components/ui/page-heading';
import { JourneyCard } from '@/components/journey/journey-card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireUser } from '@/lib/auth/session';
import { accountJourneys } from '@/lib/profile/queries';
import Link from 'next/link';
export const metadata = { title: 'Saved journeys', robots: { index: false, follow: false, noarchive: true } };
export default async function SavedPage() {
  const { client } = await requireUser('/saved');
  const journeys = await accountJourneys(client,'saved');
  return <>
    <PageHeading eyebrow="Saved" title="For the road ahead." description="Published journeys you want to return to."/>
    {journeys.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{journeys.map(journey => <JourneyCard key={journey.id} journey={journey} removable/>)}</div> : <EmptyState title="No saved journeys yet."><p>Save journeys you want to remember and they’ll appear here.</p><Link href="/explore" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-white">Explore Journeys</Link></EmptyState>}
  </>;
}
