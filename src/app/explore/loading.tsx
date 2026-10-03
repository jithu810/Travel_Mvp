export default function ExploreLoading() {
  return <div role="status" aria-label="Loading Explore" className="space-y-6">
    <p className="text-sm font-semibold text-brand">Opening a world of journeys…</p>
    <div className="h-16 max-w-2xl rounded-2xl bg-stone-200 motion-safe:animate-pulse" />
    <div className="h-[340px] rounded-3xl bg-[#e7eedf] motion-safe:animate-pulse sm:h-[440px]" />
    <div className="h-32 rounded-3xl bg-white" />
  </div>;
}
