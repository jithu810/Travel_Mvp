import type { ExploreJourney } from './explore-types';

export type DiscoverySort = 'all' | 'popular' | 'recent';
export type DiscoveryOptions = { search?: string; sort?: DiscoverySort; page?: number; pageSize?: number };
export const discoveryPageSize = 24;
export function parseDiscoverySort(value: unknown): DiscoverySort { return value === 'popular' || value === 'recent' ? value : 'all'; }
export function parseDiscoverySearch(value: unknown) { return typeof value === 'string' ? value.trim().slice(0, 120) : ''; }
export function parseDiscoveryPage(value: unknown) { const page = typeof value === 'string' ? Number(value) : 1; return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 5) : 1; }

export function browseJourneys(journeys: ExploreJourney[], options: DiscoveryOptions) {
  const term = (options.search || '').normalize('NFKC').toLocaleLowerCase('en');
  let matching = journeys.filter(journey => !term || [journey.title, journey.destinationName, journey.destinationSlug, journey.creatorName, journey.creatorUsername, ...journey.stops.map(stop => stop.name)].join(' ').normalize('NFKC').toLocaleLowerCase('en').includes(term));
  // Popularity = existing public likes, within the latest 100 eligible journeys.
  // Saves are private and have no public aggregate. Equal likes retain newest
  // publication order from the query, with the journey ID as its stable tie-break.
  if (options.sort === 'popular') matching = [...matching].sort((a, b) => b.likes - a.likes);
  const pageSize = Math.max(1, Math.min(100, options.pageSize || discoveryPageSize));
  const total = matching.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, options.page || 1), pages);
  return { journeys: matching.slice((page - 1) * pageSize, page * pageSize), total, page, pages };
}
