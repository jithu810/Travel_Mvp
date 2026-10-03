export default function TravelLoading() {
  return <div role="status" aria-label="Loading Travel Mode" className="space-y-6"><p className="text-sm font-semibold text-brand">Preparing your journey’s stops…</p><div className="h-[360px] rounded-3xl bg-[#e7eedf] motion-safe:animate-pulse sm:h-[500px]"/><div className="h-40 rounded-3xl bg-stone-200 motion-safe:animate-pulse"/></div>;
}
