import { notFound } from 'next/navigation';
import { getJourneyDetail } from '@/lib/journey/detail';
import { privateMetadata } from '@/lib/seo/metadata';
import { TravelMode } from '@/components/travel/travel-mode';

export const metadata = privateMetadata('Travel Mode preview');

export default async function TravelPage({ params }: { params: Promise<{ journeyId: string }> }) {
  const { journeyId } = await params;
  const journey = await getJourneyDetail(journeyId);
  if (!journey || journey.status !== 'published') notFound();
  return <TravelMode key={journey.id} journey={journey} />;
}
