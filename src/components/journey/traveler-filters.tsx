import Link from "next/link";
import { travelerTypes, type TravelerFilter } from "@/lib/discovery/types";

export function TravelerFilters({ path, selected }: { path: string; selected: TravelerFilter }) {
  function href(type: TravelerFilter) {
    const url = new URL(path, 'http://journey.internal');
    if (type === 'all') url.searchParams.delete('traveler');
    else url.searchParams.set('traveler', type);
    return `${url.pathname}${url.search}`;
  }
  return <nav aria-label="Traveler type filters" className="flex flex-wrap gap-2">
    {(["all", ...travelerTypes] as const).map((type) => <Link key={type} href={href(type)} scroll={false}
      aria-current={selected === type ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors ${selected === type ? "border-brand bg-brand text-white" : "border-stone-200 bg-white text-stone-600 hover:border-brand"}`}>{type[0].toUpperCase() + type.slice(1)}</Link>)}
  </nav>;
}
