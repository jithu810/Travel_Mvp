export default function ExploreLoading() {
  return <div role="status" aria-label="Loading Explore" className="space-y-8 sm:space-y-10">
    <div className="max-w-2xl space-y-4">
      <p className="text-sm font-semibold text-brand">Opening a world of journeys…</p>
      <div aria-hidden="true" className="h-9 max-w-md rounded-xl bg-stone-200 motion-safe:animate-pulse sm:h-12" />
      <div aria-hidden="true" className="h-12 max-w-xl rounded-xl bg-stone-100 sm:h-6" />
      <div aria-hidden="true" className="h-16 max-w-xl rounded-2xl bg-white" />
    </div>
    <div aria-hidden="true" className="max-w-2xl space-y-4">
      <div className="h-11 max-w-sm rounded-full bg-stone-200" />
      <div className="h-24 max-w-lg rounded-2xl bg-stone-100 sm:h-11" />
      <div className="h-10 max-w-xl rounded-xl bg-stone-100 sm:h-5" />
    </div>
    <div aria-hidden="true" className="space-y-4"><div className="h-16 max-w-md rounded-xl bg-stone-100" /><div className="h-[340px] rounded-3xl bg-[#e7eedf] sm:h-[440px]" /></div>
    <div aria-hidden="true" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(card => <div key={card} className="overflow-hidden rounded-3xl border border-stone-200 bg-white"><div className="aspect-[4/3] bg-stone-200" /><div className="h-60" /></div>)}</div>
  </div>;
}
