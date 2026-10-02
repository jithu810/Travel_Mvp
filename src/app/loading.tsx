export default function Loading() {
  return <div role="status" aria-label="Loading journeys" className="space-y-8"><p className="text-sm text-stone-500">Finding your next journey…</p><div className="h-48 animate-pulse rounded-3xl bg-stone-200"/><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-3xl bg-stone-200"/>)}</div></div>;
}
