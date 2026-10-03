export default function JourneyLoading() {
  return <div role="status" aria-label="Loading journey" className="space-y-6"><div className="h-[360px] motion-safe:animate-pulse rounded-3xl bg-stone-200 sm:h-[500px]"/><p className="text-sm text-stone-500">Loading the journey and its stops…</p><div className="h-12 w-2/3 motion-safe:animate-pulse rounded-xl bg-stone-200"/><div className="h-80 motion-safe:animate-pulse rounded-3xl bg-stone-200"/></div>;
}
