import { PageHeading } from '@/components/ui/page-heading';
import { JourneyCard } from '@/components/journey/journey-card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireUser } from '@/lib/auth/session';
import { accountJourneys } from '@/lib/profile/queries';
export const metadata = { title: 'Saved journeys', robots: { index: false, follow: false, noarchive: true } };
export default async function SavedPage() {
  const { client } = await requireUser('/saved');
  const journeys = await accountJourneys(client,'saved');
  return <>
    <PageHeading eyebrow="Saved" title="For the road ahead." description="Published journeys you want to return to."/>
    {journeys.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{journeys.map(journey => <JourneyCard key={journey.id} journey={journey} removable/>)}</div> : <EmptyState title="No saved journeys yet.">Save a published journey to find it here.</EmptyState>}
  </>;
}
