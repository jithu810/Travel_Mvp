'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
export default function TravelError({ reset }: { reset: () => void }) {
  const { journeyId } = useParams<{ journeyId: string }>();
  return <section role="alert" className="space-y-4 py-8"><h1 className="text-3xl font-semibold">We couldn’t open Travel Mode.</h1><p className="text-stone-600">Please try again, or return to the journey overview.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={reset} className="min-h-12 rounded-full bg-brand px-6 font-semibold text-white">Try Again</button><Link href={`/journey/${encodeURIComponent(journeyId)}`} className="inline-flex min-h-12 items-center px-4 font-semibold text-brand underline">Back to Journey</Link></div></section>;
}
