import Link from 'next/link';
export default function TravelNotFound() {
  return <section className="space-y-4 py-8"><h1 className="text-3xl font-semibold">This journey is unavailable.</h1><p className="max-w-lg leading-7 text-stone-600">It may have been removed or is no longer public. Choose another published journey to preview Travel Mode.</p><Link href="/explore" className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 font-semibold text-white">Return to Explore</Link></section>;
}
