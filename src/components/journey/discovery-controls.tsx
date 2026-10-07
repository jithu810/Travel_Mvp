import Link from 'next/link';
import { TravelerFilters } from './traveler-filters';
import type { TravelerFilter } from '@/lib/discovery/types';
import type { DiscoverySort } from '@/lib/discovery/browse';

export function JourneySearch({ path = '/explore', search = '' }: { path?: string; search?: string }) {
  const url = new URL(path, 'http://journey.internal');
  return <form key={path} action="/explore" role="search" aria-label="Search traveler journeys" className="space-y-2">
    <label htmlFor="journey-search" className="text-sm font-medium text-stone-600">Find a journey or traveler</label>
    {[...url.searchParams].filter(([key]) => key !== 'q' && key !== 'page').map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    <div className="flex gap-2"><input id="journey-search" name="q" type="search" maxLength={120} defaultValue={search} placeholder="Title, place or traveler" className="min-h-12 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 text-base" /><button className="min-h-12 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white">Find stories</button></div>
  </form>;
}
export function DiscoveryControls({ path, search, sort, traveler }: { path: string; search: string; sort: DiscoverySort; traveler: TravelerFilter }) {
  function href(value: DiscoverySort) { const url = new URL(path, 'http://journey.internal'); url.searchParams.delete('page'); if (value === 'all') url.searchParams.delete('sort'); else url.searchParams.set('sort', value); return url.pathname + url.search; }
  return <div className="space-y-4">
    <JourneySearch path={path} search={search} />
    <nav aria-label="Journey collections" className="flex flex-wrap gap-2">{(['all', 'popular', 'recent'] as const).map(value => <Link key={value} href={href(value)} scroll={false} aria-current={sort === value ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold sm:px-5 ${sort === value ? 'border-brand bg-brand text-white' : 'border-stone-200 bg-white text-stone-600'}`}>{value === 'all' ? 'All journeys' : value === 'popular' ? 'Popular' : 'Recent'}</Link>)}</nav>
    <TravelerFilters path={path} selected={traveler} />
  </div>;
}
